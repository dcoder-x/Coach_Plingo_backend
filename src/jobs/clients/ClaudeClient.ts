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
    message?: { content?: string };
    finish_reason?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Prompt constants — defined once, reused everywhere.
// Changing a rule here propagates to all generation methods.
// ---------------------------------------------------------------------------

const JSON_CONTRACT_RULES = [
  'Return ONLY a valid JSON object. No markdown, no code fences, no prose before or after.',
  'All string values must be properly escaped.',
  'No trailing commas. No extra fields. No missing required fields.',
  'Verify your JSON is syntactically valid before returning it.',
  'If you cannot complete all items, still return valid JSON with as many complete items as possible.',
].join(' ');

const LANGUAGE_CONTRACT_RULES = (targetLanguage: string, sourceLanguage: string) =>
  [
    `All "word", "text", and "targetText" fields must be written in ${targetLanguage}.`,
    `All "translation" fields must be written in ${sourceLanguage}.`,
    'Never mix languages within a single field.',
  ].join(' ');

const LEXICAL_RULES = [
  '"word" must be a single standalone word — no phrases, no punctuation, no conjugated or inflected duplicates of other words in the batch.',
].join(' ');

// ---------------------------------------------------------------------------

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

  static isRetriableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    const code = error.code;
    if (!status && !!code) return true;
    if (!status) return false;
    return status === 408 || status === 429 || status >= 500;
  }

  // ---------------------------------------------------------------------------
  // Public generation methods
  // ---------------------------------------------------------------------------

  async generateLessonWords(input: {
    profession: string;
    targetLanguage: string;
    sourceLanguage: string;
    currentSubcategory: { id: string; name: string; description?: string };
    allSubcategories: Array<{
      id: string;
      name: string;
      description?: string;
      wordAllocation: number;
      position: number;
    }>;
    count: number;
    excludeWords: string[];
  }): Promise<GeneratedLessonWord[]> {
    const fallback = generateFallbackLessonWords({
      profession: input.profession,
      language: input.targetLanguage,
      subcategory: input.currentSubcategory.name,
      count: input.count,
      excludeWords: input.excludeWords,
    });

    console.log(`[claude client] : ${input.targetLanguage} ${input.sourceLanguage} ${input.profession} ${input.currentSubcategory.name} ${input.count} ${input.excludeWords}`)

    const subcategoryContext = input.allSubcategories
      .map((s) => `${s.name} [${s.wordAllocation} words]`)
      .join(', ');

    const excludeClause =
      input.excludeWords.length > 0
        ? `Do NOT include any of these already-used words: ${input.excludeWords.join(', ')}.`
        : 'No words to exclude.';

    const schema = `{
  "words": [
    {
      "word": "<single ${input.targetLanguage} word>",
      "translation": "<${input.sourceLanguage} translation>",
      "subcategory": "${input.currentSubcategory.name}",
      "complexityLevel": "BEGINNER | INTERMEDIATE | ADVANCED",
      "exampleSentences": [
        {
          "text": "<natural sentence in ${input.targetLanguage}, max 8 words, must include the word>",
          "translation": "<${input.sourceLanguage} translation of sentence>",
          "keywords": [
            { "word": "<key ${input.targetLanguage} word>", "translation": "<${input.sourceLanguage}>", "pronunciation": "<phonetic>" }
          ]
        },
        {
          "text": "<second natural sentence in ${input.targetLanguage}, max 8 words, must include the word>",
          "translation": "<${input.sourceLanguage} translation of sentence>",
          "keywords": [
            { "word": "<key ${input.targetLanguage} word>", "translation": "<${input.sourceLanguage}>", "pronunciation": "<phonetic>" }
          ]
        }
      ],
      "tags": ["<relevant tag>"]
    }
  ]
}`;

    const result = await this.requestJson<{ words: GeneratedLessonWord[] }>({
      system: [
        `You are a strict JSON generator for a professional ${input.targetLanguage} language-learning app.`,
        'Your only output is a valid JSON object that exactly matches the schema provided.',
        'You are not a creative writer. You do not add commentary, explanations, or formatting.',
        JSON_CONTRACT_RULES,
      ].join(' '),
      prompt: [
        `Generate EXACTLY ${input.count} ${input.targetLanguage} vocabulary words for the profession: ${input.profession}.`,
        `Target subcategory: "${input.currentSubcategory.name}"${input.currentSubcategory.description ? ` — ${input.currentSubcategory.description}` : ''}.`,
        `All subcategories for context (do not generate words from other subcategories): ${subcategoryContext}.`,
        excludeClause,
        `Each word MUST belong to subcategory "${input.currentSubcategory.name}".`,
        LANGUAGE_CONTRACT_RULES(input.targetLanguage, input.sourceLanguage),
        LEXICAL_RULES,
        'Each word must have EXACTLY 2 exampleSentences. No more, no fewer.',
        'Each sentence must be natural, professional, and directly relevant to the given profession.',
        `Return a JSON object matching this exact schema:\n${schema}`,
      ].join(' '),
      fallback: undefined,
      maxTokens: 3000,
      // Slightly above zero to avoid repetitive greedy outputs across batches,
      // but low enough to keep structure reliable.
      temperature: 0.2,
      validator: (value): value is { words: GeneratedLessonWord[] } => {
        if (typeof value !== 'object' || value === null) return false;
        const words = (value as { words?: unknown }).words;
        if (!Array.isArray(words) || words.length === 0) return false;
        return words.every(
          (w: unknown) =>
            typeof w === 'object' &&
            w !== null &&
            typeof (w as GeneratedLessonWord).word === 'string' &&
            (w as GeneratedLessonWord).word.trim().split(/\s+/).length === 1 && // single word only
            typeof (w as GeneratedLessonWord).translation === 'string' &&
            Array.isArray((w as GeneratedLessonWord).exampleSentences),
        );
      },
    });

    // Post-process: deduplicate against excludeWords and enforce count
    const excludeSet = new Set(input.excludeWords.map((w) => w.toLowerCase()));
    const clean = result.words
      .filter((w) => !excludeSet.has(w.word.toLowerCase()))
      .slice(0, input.count);

    return clean;
  }

  async generateStory(input: {
    targetLanguage: string;
    sourceLanguage: string;
    profession: string;
    vocabulary: Array<{ word: string; translation: string }>;
  }): Promise<GeneratedStoryContent> {
    const fallback = generateFallbackStory({
      language: input.targetLanguage,
      profession: input.profession,
      vocabulary: input.vocabulary,
    });

    const schema = `{
  "content": "<story in ${input.targetLanguage}>",
  "vocabularyCoverage": ["<each vocabulary word that appears in the story>"],
  "questions": [
    {
      "questionText": "<question in ${input.targetLanguage}>",
      "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "correctAnswer": "<one of the options, verbatim>",
      "questionType": "MULTIPLE_CHOICE | SHORT_ANSWER",
      "position": 1
    }
  ]
}`;

    return this.requestJson<GeneratedStoryContent>({
      system: [
        `You are a strict JSON generator for a professional ${input.targetLanguage} language-learning app.`,
        'Your only output is a valid JSON object that exactly matches the schema provided.',
        JSON_CONTRACT_RULES,
      ].join(' '),
      prompt: [
        `Write a short workplace story in ${input.targetLanguage} for the profession: ${input.profession}.`,
        `The story must naturally incorporate these vocabulary words: ${input.vocabulary.map((v) => `${v.word} (${v.translation})`).join(', ')}.`,
        'The story should be 80–120 words, professional in tone, and suitable for an intermediate language learner.',
        LANGUAGE_CONTRACT_RULES(input.targetLanguage, input.sourceLanguage),
        'Include 2–3 comprehension questions about the story.',
        `Return a JSON object matching this exact schema:\n${schema}`,
      ].join(' '),
      maxTokens: 1000,
      temperature: 0.3,
      fallback,
      validator: (value): value is GeneratedStoryContent =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as GeneratedStoryContent).content === 'string' &&
        Array.isArray((value as GeneratedStoryContent).questions) &&
        (value as GeneratedStoryContent).questions.length > 0,
    });
  }

  async generatePronunciationExercises(input: {
    profession: string;
    targetLanguage: string;
    sourceLanguage: string;
    vocabulary: string[];
  }): Promise<GeneratedPronunciationExercise[]> {
    const fallback = generateFallbackPronunciationExercises({
      profession: input.profession,
      vocabulary: input.vocabulary,
    });

    const schema = `{
  "exercises": [
    {
      "targetText": "<natural sentence in ${input.targetLanguage}, 6–12 words>",
      "complexityLevel": "BEGINNER | INTERMEDIATE | ADVANCED",
      "position": 1
    }
  ]
}`;

    return this.requestJson<{ exercises: GeneratedPronunciationExercise[] }>({
      system: [
        `You are a strict JSON generator for a professional ${input.targetLanguage} language-learning app.`,
        'Your only output is a valid JSON object that exactly matches the schema provided.',
        JSON_CONTRACT_RULES,
      ].join(' '),
      prompt: [
        `Generate EXACTLY 5 ${input.targetLanguage} pronunciation exercise sentences for the profession: ${input.profession}.`,
        `Incorporate these vocabulary words where natural: ${input.vocabulary.join(', ')}.`,
        LANGUAGE_CONTRACT_RULES(input.targetLanguage, input.sourceLanguage),
        'Each sentence must be 6–12 words, natural in speech rhythm, and professionally relevant.',
        'Assign one complexityLevel per sentence: use a mix of BEGINNER, INTERMEDIATE, and ADVANCED across the 5 sentences.',
        `Return a JSON object matching this exact schema:\n${schema}`,
      ].join(' '),
      maxTokens: 600,
      temperature: 0.2,
      fallback: { exercises: fallback },
      validator: (value): value is { exercises: GeneratedPronunciationExercise[] } =>
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as { exercises?: unknown }).exercises) &&
        (value as { exercises: unknown[] }).exercises.length > 0,
    }).then((result) => result.exercises);
  }

  // ---------------------------------------------------------------------------
  // Core request method
  // ---------------------------------------------------------------------------

  private async requestJson<T>(input: {
    system: string;
    prompt: string;
    maxTokens: number;
    temperature?: number;
    fallback?: T;
    validator: (value: unknown) => value is T;
  }): Promise<T> {
    const hasFallback = Object.prototype.hasOwnProperty.call(input, 'fallback');

    if (!this.hasConfiguredKey()) {
      if (hasFallback) return input.fallback as T;
      throw new Error('OpenRouter API key (OPENROUTER_API_KEY) is not configured');
    }

    // Single attempt only — no in-function retry.
    // Vercel functions have a 60s hard timeout; a retry would double latency
    // and guarantee a timeout. QStash handles job-level retries automatically.
    try {
      const text = await this.callOpenRouter(
        input.system,
        input.prompt,
        input.maxTokens,
        input.temperature ?? 0,
      );

      console.log(`[claude client text] : ${text}`)
      const result = this.tryParse(text, input.validator);

      console.log(`[claude client result] : ${JSON.stringify(result)}`)


      if (result !== null) return result;

      this.logger.warn('OpenRouter response failed validation', {
        model: this.model,
        preview: text.slice(0, 300),
      });
    } catch (error) {
      this.logger.warn('OpenRouter call failed', { model: this.model, error: String(error) });
      if (!hasFallback) throw error;
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
    temperature: number,
  ): Promise<string> {
    const response = await axios.post<OpenRouterResponse>(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: this.model,
        max_tokens: maxTokens,
        temperature,
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
   *
   * Strategy:
   * 1. Direct parse (model returned clean JSON — happy path).
   * 2. Locate the outermost `{...}` or `[...]` block by scanning forward from
   *    each candidate start index and backward from the end of the string.
   *    NOTE: We fix the original bug where `lastIndexOf` was called on the full
   *    string for every start candidate, causing all attempts to share the same
   *    (wrong) end index when there was trailing prose after the JSON.
   *
   * Returns null (not throws) so callers decide how to handle failure.
   */
  private tryParse<T>(text: string, validator: (v: unknown) => v is T): T | null {
    if (!text) return null;

    // 1. Happy path
    try {
      const parsed = JSON.parse(text) as unknown;
      if (validator(parsed)) return parsed;
    } catch {
      // fall through
    }

    // 2. Find the outermost balanced JSON block.
    // We look for the first `{` or `[`, then find the matching closing
    // delimiter by scanning backwards from the end of the string.
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const candidates: number[] = [firstBrace, firstBracket].filter((i) => i >= 0);
    candidates.sort((a, b) => a - b);

    for (const start of candidates) {
      const openChar = text[start];
      const closeChar = openChar === '{' ? '}' : ']';

      // Walk backwards from end of string to find the last matching close char
      // that is at or after `start`. This correctly handles trailing prose.
      let end = text.lastIndexOf(closeChar);
      while (end > start) {
        try {
          const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
          if (validator(parsed)) return parsed;
        } catch {
          // Try a shorter slice
        }
        end = text.lastIndexOf(closeChar, end - 1);
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