import axios from 'axios';
import {
  GeneratedLessonWord,
  GeneratedPronunciationExercise,
  GeneratedStoryContent,
  generateFallbackPronunciationExercises,
  generateFallbackStory,
} from '../contentGenerators';
import { SimpleLogger } from '../../utils/Logger';

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
            content?: string;
          }>;
    };
  }>;
}

interface OpenRouterModelsResponse {
  data?: Array<{
    id?: string;
  }>;
}

export class ClaudeClient {
  private readonly apiKey?: string;
  private model: string;
  private readonly logger: SimpleLogger;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || process.env.CLAUDE_API_KEY;
    this.model = process.env.OPENROUTER_MODEL || process.env.CLAUDE_MODEL || 'anthropic/claude-3.5-sonnet';
    this.logger = new SimpleLogger('ClaudeClient');
  }

  async generateLessonWords(input: {
    profession: string;
    language: string;
    count: number;
    excludeWords: string[];
  }): Promise<GeneratedLessonWord[]> {
    return this.requestJson<{ words: GeneratedLessonWord[] } | GeneratedLessonWord[]>({
      system: 'You create professional language-learning vocabulary. Return strict JSON only.',
      prompt: [
        `Generate ${input.count} ${input.language} vocabulary words for the profession ${input.profession}.`,
        `Avoid these words: ${input.excludeWords.join(', ') || 'none'}.`,
        'Return a valid JSON object with this exact shape: {"words":[{"word":"...","translation":"...","complexityLevel":"BEGINNER|INTERMEDIATE|ADVANCED","examplePhrases":["..."],"exampleSentences":["..."],"tags":["..."]}]}.',
        'Use concise text to stay within output limits: each example phrase <= 4 words, each example sentence <= 10 words.',
        'Never truncate output. If you cannot complete all items, still return valid JSON with as many complete items as possible.',
      ].join(' '),
      maxTokens: 3200,
      validator: (value): value is { words: GeneratedLessonWord[] } | GeneratedLessonWord[] =>
        Array.isArray(value) ||
        (typeof value === 'object' && value !== null && Array.isArray((value as { words?: unknown }).words)),
    }).then((result) => {
      const words = Array.isArray(result) ? result : result.words;
      return words.slice(0, input.count);
    });
  }

  async generateStory(input: {
    language: string;
    profession: string;
    vocabulary: Array<{ word: string; translation: string }>;
  }): Promise<GeneratedStoryContent> {
    const fallback = generateFallbackStory(input);

    return this.requestJson<GeneratedStoryContent>({
      system: 'You create short workplace stories for language learners. Return strict JSON only.',
      prompt: [
        `Write a short ${input.language} story for the profession ${input.profession}.`,
        `Use these words: ${input.vocabulary.map((entry) => `${entry.word} (${entry.translation})`).join(', ')}.`,
        'Return JSON with shape: {"content":"...","vocabularyCoverage":["..."],"questions":[{"questionText":"...","options":["..."],"correctAnswer":"...","questionType":"MULTIPLE_CHOICE|SHORT_ANSWER","position":1}]}',
      ].join(' '),
      fallback,
      validator: (value): value is GeneratedStoryContent =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as GeneratedStoryContent).content === 'string' &&
        Array.isArray((value as GeneratedStoryContent).questions),
    });
  }

  async generatePronunciationExercises(input: {
    profession: string;
    language: string;
    vocabulary: string[];
  }): Promise<GeneratedPronunciationExercise[]> {
    const fallback = generateFallbackPronunciationExercises({
      profession: input.profession,
      vocabulary: input.vocabulary,
    });

    return this.requestJson<{ exercises: GeneratedPronunciationExercise[] }>({
      system: 'You create short pronunciation exercises for workplace language learning. Return strict JSON only.',
      prompt: [
        `Generate up to 5 ${input.language} pronunciation exercise sentences for ${input.profession}.`,
        `Use this vocabulary where helpful: ${input.vocabulary.join(', ')}.`,
        'Return JSON with shape: {"exercises":[{"targetText":"...","complexityLevel":"BEGINNER|INTERMEDIATE|ADVANCED","position":1}]}',
      ].join(' '),
      fallback: { exercises: fallback },
      validator: (value): value is { exercises: GeneratedPronunciationExercise[] } =>
        typeof value === 'object' && value !== null && Array.isArray((value as { exercises?: unknown }).exercises),
    }).then((result) => result.exercises);
  }

  private async requestJson<T>(input: {
    system: string;
    prompt: string;
    fallback?: T;
    maxTokens?: number;
    validator: (value: unknown) => value is T;
  }): Promise<T> {
    const hasFallback = Object.prototype.hasOwnProperty.call(input, 'fallback');

    if (!this.hasConfiguredKey()) {
      if (hasFallback) {
        return input.fallback as T;
      }

      throw new Error('OpenRouter API key is not configured for lesson word generation');
    }

    const currentModel = this.model;

    try {
      const response = await this.sendCompletionRequest(currentModel, input.system, input.prompt);

      const parsed = this.parseValidatedResponse(response.data, input.validator, {
        phase: 'primary',
        model: currentModel,
      });
      if (parsed !== null) {
        return parsed;
      }

      if (!hasFallback) {
        const strictResponse = await this.sendCompletionRequest(
          currentModel,
          `${input.system} Return only valid JSON. Do not use markdown, code fences, or explanations.`,
          `${input.prompt} Return only a valid JSON object and nothing else.`,
          input.maxTokens,
        );

        const strictParsed = this.parseValidatedResponse(strictResponse.data, input.validator, {
          phase: 'primary-strict-json',
          model: currentModel,
        });
        if (strictParsed !== null) {
          return strictParsed;
        }

        throw new Error('OpenRouter response failed validation for lesson word generation');
      }

      if (hasFallback) {
        this.logger.warn('Claude response failed validation, using fallback');
        return input.fallback as T;
      }

      throw new Error('OpenRouter response failed validation for lesson word generation');
    } catch (error) {
      const retriableEndpointError = this.isEndpointNotFoundError(error);

      if (retriableEndpointError) {
        const discoveredModel = await this.discoverFreeModel(currentModel);
        if (discoveredModel && discoveredModel !== currentModel) {
          this.logger.warn(
            `Configured model unavailable (${currentModel}); retrying with discovered free model (${discoveredModel})`,
          );

          this.model = discoveredModel;

          try {
            const retryResponse = await this.sendCompletionRequest(
              discoveredModel,
              input.system,
              input.prompt,
              input.maxTokens,
            );

            const retryParsed = this.parseValidatedResponse(retryResponse.data, input.validator, {
              phase: 'discovered-model-retry',
              model: discoveredModel,
            });
            if (retryParsed !== null) {
              return retryParsed;
            }

            if (!hasFallback) {
              const strictRetryResponse = await this.sendCompletionRequest(
                discoveredModel,
                `${input.system} Return only valid JSON. Do not use markdown, code fences, or explanations.`,
                `${input.prompt} Return only a valid JSON object and nothing else.`,
                input.maxTokens,
              );

              const strictRetryParsed = this.parseValidatedResponse(
                strictRetryResponse.data,
                input.validator,
                {
                  phase: 'discovered-model-strict-json',
                  model: discoveredModel,
                },
              );

              if (strictRetryParsed !== null) {
                return strictRetryParsed;
              }
            }

            if (hasFallback) {
              this.logger.warn('Claude retry response failed validation, using fallback');
            } else {
              throw new Error('OpenRouter retry response failed validation for lesson word generation');
            }
          } catch (retryError) {
            if (hasFallback) {
              this.logger.warn(
                'Claude retry request failed, using fallback',
                this.formatProviderError(retryError),
              );
            } else {
              throw retryError;
            }
          }
        }
      }

      if (hasFallback) {
        this.logger.warn('Claude request failed, using fallback', this.formatProviderError(error));
        return input.fallback as T;
      }

      throw error;
    }
  }

  private async sendCompletionRequest(
    model: string,
    system: string,
    prompt: string,
    maxTokens = 1200,
  ): Promise<{ data: OpenRouterResponse }> {
    return axios.post<OpenRouterResponse>(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'CoachPlingo',
        },
        timeout: 30000,
      },
    );
  }

  private async discoverFreeModel(currentModel: string): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await axios.get<OpenRouterModelsResponse>('https://openrouter.ai/api/v1/models', {
        headers: {
          authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 15000,
      });

      const modelIds = (response.data.data || [])
        .map((item) => item.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      if (modelIds.includes(currentModel)) {
        return currentModel;
      }

      const freeModels = modelIds.filter((id) => id.endsWith(':free'));

      const preferredFreeModels = [
        'arcee-ai/trinity-mini:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
      ];

      for (const modelId of preferredFreeModels) {
        if (freeModels.includes(modelId)) {
          return modelId;
        }
      }

      const preferredPrefixes = [
        'meta-llama/',
        'mistralai/',
        'google/',
        'qwen/',
        'deepseek/',
      ];

      for (const prefix of preferredPrefixes) {
        const preferred = freeModels.find((id) => id.startsWith(prefix));
        if (preferred) {
          return preferred;
        }
      }

      return freeModels[0] || null;
    } catch (error) {
      this.logger.warn(
        'Failed to discover OpenRouter models; proceeding with fallback content',
        this.formatProviderError(error),
      );
      return null;
    }
  }

  private isEndpointNotFoundError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    const data = error.response?.data as { error?: { message?: string } } | undefined;
    const message = data?.error?.message?.toLowerCase() || '';

    return status === 404 && message.includes('no endpoints found');
  }

  private formatProviderError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const code = error.code;
      const data = error.response?.data as { error?: { message?: string } } | undefined;
      const providerMessage = data?.error?.message;

      return [
        'provider=OpenRouter',
        `model=${this.model}`,
        status ? `status=${status}` : undefined,
        code ? `code=${code}` : undefined,
        providerMessage ? `message=${providerMessage}` : undefined,
      ]
        .filter(Boolean)
        .join(' | ');
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private extractJson(text: string): unknown {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const firstIndex = [firstBrace, firstBracket].filter((index) => index >= 0).sort((a, b) => a - b)[0];
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const lastIndex = Math.max(lastBrace, lastBracket);

    if (firstIndex === undefined || lastIndex < firstIndex) {
      throw new Error('No JSON payload found in Claude response');
    }

    return JSON.parse(text.slice(firstIndex, lastIndex + 1));
  }

  private parseValidatedResponse<T>(
    response: OpenRouterResponse,
    validator: (value: unknown) => value is T,
    context: { phase: string; model: string },
  ): T | null {
    const text = this.extractMessageText(response);
    this.logResponsePreview(text, context);

    let parsed: unknown;
    try {
      parsed = this.extractJson(text);
    } catch (error) {
      this.logger.warn(
        'Failed to parse OpenRouter JSON response',
        this.formatResponseDebug(text, context, error),
      );
      return null;
    }

    if (validator(parsed)) {
      return parsed;
    }

    return null;
  }

  private extractMessageText(response: OpenRouterResponse): string {
    const content = response.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part?.text === 'string') {
            return part.text;
          }

          if (typeof part?.content === 'string') {
            return part.content;
          }

          return '';
        })
        .join('')
        .trim();
    }

    return '';
  }

  private logResponsePreview(text: string, context: { phase: string; model: string }): void {
    this.logger.debug('OpenRouter response preview', this.formatResponseDebug(text, context));
  }

  private formatResponseDebug(
    text: string,
    context: { phase: string; model: string },
    error?: unknown,
  ): Record<string, unknown> {
    return {
      provider: 'OpenRouter',
      model: context.model,
      phase: context.phase,
      contentLength: text.length,
      preview: text.slice(0, 1200),
      ...(error instanceof Error ? { parseError: error.message } : {}),
    };
  }

  private hasConfiguredKey(): boolean {
    return Boolean(
      this.apiKey &&
      !this.apiKey.startsWith('YOUR_') &&
      this.apiKey !== 'YOUR_CLAUDE_API_KEY' &&
      this.apiKey !== 'YOUR_OPENROUTER_API_KEY',
    );
  }
}
