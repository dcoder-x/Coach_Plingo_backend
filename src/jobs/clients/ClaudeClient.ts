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
    message?: { content?: string };
    finish_reason?: string;
  }>;
}

// Free-tier models on OpenRouter have hard output caps (~512-2048 tokens).
// CJK characters (Japanese, Chinese, Korean) tokenize more densely than Latin.
// Each word entry costs ~60-80 tokens for CJK, ~40-60 for Latin.
// Batches of 5 words = ~300-400 tokens — safely within even the strictest free model cap.
const WORDS_PER_BATCH = 5;

export class ClaudeClient {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly siteUrl: string;
  private readonly appName: string;
  private readonly logger: SimpleLogger;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || process.env.CLAUDE_API_KEY;
    this.model =
      process.env.OPENROUTER_MODEL ||
      process.env.CLAUDE_MODEL ||
      'anthropic/claude-3.5-sonnet';
    this.siteUrl = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
    this.appName = process.env.OPENROUTER_APP_NAME || 'CoachPlingo';
    this.logger = new SimpleLogger('ClaudeClient');
  }

  /**
   * Generate vocabulary words via OpenRouter in batches so each request stays
   * within the output-token limit of free-tier models (~2048 tokens max).
   * Each batch requests WORDS_PER_BATCH words; batches are merged in order.
   */
  async generateLessonWords(input: {
    profession: string;
    language: string;
    count: number;
    excludeWords: string[];
  }): Promise<GeneratedLessonWord[]> {
    const results: GeneratedLessonWord[] = [];

    while (results.length < input.count) {
      const batchSize = Math.min(WORDS_PER_BATCH, input.count - results.length);
      const alreadyGenerated = results.map((w) => w.word);
      const excludeList = [...input.excludeWords, ...alreadyGenerated];

      // Ask the model for a compact schema (no exampleSentences) to minimise output tokens.
      // exampleSentences is derived from examplePhrases after generation.
      const batch = await this.requestJson<{ words: Array<Omit<GeneratedLessonWord, 'exampleSentences'>> }>({
        system:
          'You are a professional language-learning vocabulary creator. ' +
          'Output strict JSON only — no markdown, no backticks, no commentary.',
        prompt: [
          `Generate exactly ${batchSize} ${input.language} vocabulary words for the profession: ${input.profession}.`,
          excludeList.length > 0
            ? `Do not use any of these words: ${excludeList.join(', ')}.`
            : '',
          'Return a single JSON object with this exact shape:',
          '{"words":[{"word":"...","translation":"...","complexityLevel":"BEGINNER","examplePhrases":["short phrase"],"tags":["tag"]}]}',
          'complexityLevel must be BEGINNER, INTERMEDIATE, or ADVANCED.',
          'Max 6 words per examplePhrase. Exactly 1 phrase and 1-2 tags per word.',
          'Output only the JSON object. Nothing else.',
        ]
          .filter(Boolean)
          .join(' '),
        maxTokens: 900,
        validator: (value): value is { words: Array<Omit<GeneratedLessonWord, 'exampleSentences'>> } =>
          typeof value === 'object' &&
          value !== null &&
          Array.isArray((value as { words?: unknown }).words) &&
          (value as { words: unknown[] }).words.length > 0,
      });

      // Derive exampleSentences from examplePhrases so WordData is fully populated
      const wordsWithSentences: GeneratedLessonWord[] = batch.words.map((w) => ({
        ...w,
        exampleSentences: w.examplePhrases,
      }));

      results.push(...wordsWithSentences);
    }

    return results.slice(0, input.count);
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
      maxTokens: 1000,
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
      maxTokens: 600,
      fallback: { exercises: fallback },
      validator: (value): value is { exercises: GeneratedPronunciationExercise[] } =>
        typeof value === 'object' && value !== null && Array.isArray((value as { exercises?: unknown }).exercises),
    }).then((result) => result.exercises);
  }

  private async requestJson<T>(input: {
    system: string;
    prompt: string;
    maxTokens: number;
    fallback?: T;
    validator: (value: unknown) => value is T;
  }): Promise<T> {
    const hasFallback = Object.prototype.hasOwnProperty.call(input, 'fallback');

    if (!this.hasConfiguredKey()) {
      if (hasFallback) {
        return input.fallback as T;
      }

      throw new Error('OpenRouter API key (OPENROUTER_API_KEY) is not configured');
    }

    // Single attempt only — no in-function retry.
    // Vercel functions have a 60s hard timeout; a retry would double the latency
    // and guarantee a timeout. QStash handles job-level retries automatically.
    try {
      const text = await this.callOpenRouter(input.system, input.prompt, input.maxTokens);
      const result = this.tryParse(text, input.validator);

      if (result !== null) {
        return result;
      }

      this.logger.warn('OpenRouter response failed validation', {
        model: this.model,
        preview: text.slice(0, 300),
      });
    } catch (error) {
      this.logger.warn('OpenRouter call failed', { model: this.model, error: String(error) });

      if (!hasFallback) {
        throw error;
      }
    }

    if (hasFallback) {
      this.logger.warn('OpenRouter response unusable — using fallback content');
      return input.fallback as T;
    }

    throw new Error(`OpenRouter model ${this.model} returned no valid JSON`);
  }

  private async callOpenRouter(
    system: string,
    prompt: string,
    maxTokens: number,
  ): Promise<string> {
    const response = await axios.post<OpenRouterResponse>(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: this.model,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName,
        },
        // 45s — leaves ~15s buffer inside a 60s Vercel function execution
        timeout: 45000,
      },
    );

    const choice = response.data.choices?.[0];
    if (choice?.finish_reason === 'length') {
      this.logger.warn('OpenRouter response was cut off by model output-token limit', {
        model: this.model,
        maxTokensRequested: maxTokens,
      });
    }

    const content = choice?.message?.content ?? '';
    return typeof content === 'string' ? content.trim() : '';
  }

  /**
   * Attempt to parse valid JSON from model output.
   * First tries a direct parse of the full text, then scans for the largest
   * valid JSON object/array in case model added prose before/after.
   * Returns null (not throws) so callers can decide to retry cleanly.
   */
  private tryParse<T>(text: string, validator: (v: unknown) => v is T): T | null {
    if (!text) {
      return null;
    }

    // Direct parse (happy path — model returned pure JSON)
    try {
      const parsed = JSON.parse(text) as unknown;
      if (validator(parsed)) {
        return parsed;
      }
    } catch {
      // fall through
    }

    // Substring scan — find outermost { } or [ ] that yields a valid result
    const starts = [text.indexOf('{'), text.indexOf('[')].filter((i) => i >= 0).sort((a, b) => a - b);
    for (const start of starts) {
      const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
      if (end <= start) {
        continue;
      }

      try {
        const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
        if (validator(parsed)) {
          return parsed;
        }
      } catch {
        // truncated / malformed — cannot recover, will retry via callOpenRouter
      }
    }

    return null;
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
