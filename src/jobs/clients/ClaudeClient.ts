import axios from 'axios';
import {
  GeneratedLessonWord,
  GeneratedPronunciationExercise,
  GeneratedStoryContent,
  generateFallbackLessonWords,
  generateFallbackPronunciationExercises,
  generateFallbackStory,
} from '../contentGenerators';
import { SimpleLogger } from '../../utils/Logger';

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class ClaudeClient {
  private readonly apiKey?: string;
  private readonly model: string;
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
    const fallback = generateFallbackLessonWords(input);

    return this.requestJson<{ words: GeneratedLessonWord[] }>({
      system: 'You create professional language-learning vocabulary. Return strict JSON only.',
      prompt: [
        `Generate ${input.count} ${input.language} vocabulary words for the profession ${input.profession}.`,
        `Avoid these words: ${input.excludeWords.join(', ') || 'none'}.`,
        'Return JSON with shape: {"words":[{"word":"...","translation":"...","complexityLevel":"BEGINNER|INTERMEDIATE|ADVANCED","examplePhrases":["..."],"exampleSentences":["..."],"tags":["..."]}]}',
      ].join(' '),
      fallback: { words: fallback },
      validator: (value): value is { words: GeneratedLessonWord[] } =>
        typeof value === 'object' && value !== null && Array.isArray((value as { words?: unknown }).words),
    }).then((result) => result.words.slice(0, input.count));
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
    fallback: T;
    validator: (value: unknown) => value is T;
  }): Promise<T> {
    if (!this.hasConfiguredKey()) {
      return input.fallback;
    }

    try {
      const response = await axios.post<OpenRouterResponse>(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: this.model,
          max_tokens: 1200,
          temperature: 0.2,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.prompt },
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

      const text = response.data.choices?.[0]?.message?.content || '';

      const parsed = this.extractJson(text);
      if (input.validator(parsed)) {
        return parsed;
      }

      this.logger.warn('Claude response failed validation, using fallback');
      return input.fallback;
    } catch (error) {
      this.logger.warn('Claude request failed, using fallback', error);
      return input.fallback;
    }
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

  private hasConfiguredKey(): boolean {
    return Boolean(
      this.apiKey &&
      !this.apiKey.startsWith('YOUR_') &&
      this.apiKey !== 'YOUR_CLAUDE_API_KEY' &&
      this.apiKey !== 'YOUR_OPENROUTER_API_KEY',
    );
  }
}
