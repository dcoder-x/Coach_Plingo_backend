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

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
}

type AiProvider = 'openrouter' | 'openai';

export type PronunciationErrorType =
  | 'none'
  | 'wrong_word'
  | 'missing_sound'
  | 'stress'
  | 'vowel'
  | 'consonant'
  | 'unclear'
  | 'other';

export interface PronunciationScoringInput {
  targetText: string;
  transcriptText: string;
  languageCode: string;
  ipa?: string | null;
  professionContext?: string | null;
  lessonContext?: string | null;
  baseSimilarityScore?: number;
  transcriptConfidence?: number | null;
}

export interface PronunciationScoringResult {
  score: number;
  feedback: string;
  errorType: PronunciationErrorType;
}

export interface ScenarioGenerationInput {
  profession: string;
  professionDescription?: string;
  subcategoryName: string;
  subcategoryDescription?: string;
  scenarioName: string;
  scenarioDescription?: string;
  targetLanguage: string;
  baseLanguages: string[];
  count?: number;
  excludeWords?: string[];
}

export interface GeneratedScenarioWord {
  word: string;
  ipa: string | null;
  complexityLevel: 'beginner' | 'intermediate' | 'advanced';
  examplePhrases: Array<{ text: string; translation: string }>;
  fillGapSentences: Array<{ template: string; answer: string; templateTranslation?: string }>;
  tags: string[];
  translations: Record<string, string>;
}

export interface ScenarioComprehensionInput {
  profession: string;
  subcategoryName: string;
  scenarioName: string;
  targetLanguage: string;
  baseLanguage: string;
  words: Array<{ word: string }>;
  passageCount: 1 | 2;
}

export interface GeneratedComprehensionQuestion {
  questionText: string;
  questionType: 'multiple_choice' | 'short_answer';
  options: string[] | null;
  correctAnswer: string;
  position: number;
  questionTranslation?: string;
  optionsTranslation?: string[] | null;
}

export interface GeneratedComprehensionPassage {
  position: number;
  content: string;
  contentTranslation?: string;
  tokenGlosses?: Array<{ token: string; start: number; end: number; lemma?: string; baseLanguageGloss: string; source: string }>;
  questions: GeneratedComprehensionQuestion[];
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

const LANGUAGE_CONTRACT_RULES = (targetLanguage: string, sourceLanguage: string): string =>
  [
    `All "word", "text", and "targetText" fields must be written in ${targetLanguage}.`,
    `All "translation" fields must be written in ${sourceLanguage}.`,
    'Never mix languages within a single field.',
  ].join(' ');

const LEXICAL_RULES = [
  '"word" must be a single standalone word — no phrases, no punctuation, no conjugated or inflected duplicates of other words in the batch.',
].join(' ');

const CONTEXTUAL_MEANING_RULES = [
  'Every example sentence must be immediately usable as real workplace speech in the given profession.',
  'Every sentence must imply a concrete speaker intent (question, instruction, status update, handoff, or request).',
  'Do not output generic filler such as "we use X every day", definition-style phrases like "X is essential" or "X is important", or meta-learning statements.',
  'Each pair of example sentences for a word must serve different communicative functions.',
].join(' ');

const PRONUNCIATION_GUARD_RULES = [
  'Avoid English-looking spellings when a native target-language form exists.',
  'Do not mix English tokens into target-language fields unless they are unavoidable domain terms.',
  'Prefer target-language orthography and spoken realism over literal English cognates.',
].join(' ');

const IPA_RULES = [
  'The "ipa" field must use standard broad IPA notation enclosed in forward slashes: /notation/.',
  'Transcribe each word as a native speaker of the target language would pronounce it.',
  'Do not output pseudo-phonetic English spellings such as "pey-shnt".',
].join(' ');

const FILL_GAP_STARTERS_BY_LANGUAGE: Record<string, string> = {
  es: '"En", "Al", "Durante", "La", "El", "Los", "Las", "Debemos", "Necesitamos", "Hay que", "Para", "Cuando", "Si"',
  en: '"In", "At", "During", "While", "The", "We", "To", "When", "If"',
  fr: '"Dans", "Au", "En", "Pendant", "La", "Le", "Les", "Nous", "Pour", "Quand"',
  de: '"Im", "In", "Beim", "Während", "Die", "Der", "Das", "Wir", "Für", "Wenn", "Bei"',
  it: '"In", "Nel", "Nella", "Al", "Durante", "La", "Il", "I", "Dobbiamo", "Per", "Quando"',
  pt: '"Em", "No", "Na", "Ao", "Durante", "Devemos", "Precisamos", "Para", "Quando"',
};

function getFillGapRules(targetLanguage: string): string {
  const langRoot = targetLanguage.trim().toLowerCase().slice(0, 2);
  const starters = FILL_GAP_STARTERS_BY_LANGUAGE[langRoot] ?? FILL_GAP_STARTERS_BY_LANGUAGE['en'];
  return [
    'Each fill-gap template must contain exactly one ___ token.',
    'The answer must be the exact same word value used in the word field.',
    'Do not include the answer word anywhere else in the template sentence.',
    'Templates must be complete standalone professional sentences.',
    'Each sentence must place the learner inside the scenario with situational framing.',
    `Each template must start with a framing preposition or subject: ${starters}.`,
  ].join(' ');
}

const EXAMPLE_PHRASE_RULES = [
  'Each example phrase must be 2–5 words.',
  'Phrases must be usable as standalone professional utterances, not sentence fragments.',
  'Do not repeat phrases across different words in the same response.',
  'Each example phrase must include translation in the learner base language.',
].join(' ');

const SCENARIO_SELECTION_RULES = [
  'Choose words a learner would genuinely need in this exact scenario, not broad office vocabulary that fits any meeting.',
  'At least 7 of the 10 words must be concrete scenario-operational terms tied to blockers, delivery risk, architecture choices, dependencies, debugging, rollout, or decision-making.',
  'Avoid overgeneric nouns unless they are unmistakably central to the scenario.',
  'Prefer precise workplace terms over abstract labels.',
  'Every word, phrase, and sentence must be directly usable in the active scenario context.',
  'Reject generic business vocabulary that could appear in any professional setting.',
].join(' ');

const COMPREHENSION_QUESTION_RULES = [
  'Each passage must have exactly 4 multiple-choice questions and 1 short-answer question.',
  'Each multiple-choice question must include exactly 4 options.',
  'The correctAnswer for multiple-choice must match one option verbatim.',
  'Questions must be answerable from the passage content only.',
  'Do not write trivial questions that merely ask what the meeting is about or ask the learner to repeat a single vocabulary item.',
  'At least 2 questions must target a decision, blocker, trade-off, next step, or technical risk described in the passage.',
  'For short-answer questions, correctAnswer must be 1-3 words maximum.',
  'If a short-answer answer needs more than 3 words, convert that question to multiple-choice.',
].join(' ');

const SCENARIO_FILL_GAP_STARTERS: Record<string, RegExp> = {
  es: /^(en|al|durante|la|el|los|las|debemos|necesitamos|hay que|para|cuando|si)\b/i,
  en: /^(in|at|during|while|the|a|we|to|when|if)\b/i,
  fr: /^(dans|au|en|pendant|la|le|les|nous|pour|quand)\b/i,
  de: /^(in|im|beim|waehrend|während|die|der|das|wir|für|wenn)\b/i,
  it: /^(in|nel|nella|al|durante|la|il|i|dobbiamo|per|quando)\b/i,
  pt: /^(em|no|na|ao|durante|a|o|os|as|devemos|precisamos|para|quando)\b/i,
};

// ---------------------------------------------------------------------------

export class ClaudeClient {
  private readonly provider: AiProvider;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fallbackModels: string[];
  private readonly siteUrl: string;
  private readonly appName: string;
  private readonly logger: SimpleLogger;

  // ── Language-agnostic quality gate constants ──────────────────────────────
  // Copula forms across Latin-script languages (is/are/es/ist/est/é/è/…)
  private static readonly DEFINITION_COPULAS =
    /\b(is|are|es|ist|est|é|è|są|je|er|zijn|on|är)\b/i;

  // Universal closed-class generic adjectives (near-cognates across Latin-script languages)
  private static readonly GENERIC_ADJECTIVES =
    /\b(important|essential|key|critical|necessary|vital|good|useful|basic|fundamental|main|common|central|relevant)\b/i;

  // "La ___ es", "Die ___ ist", "Le ___ est" — blank is the subject of a definition sentence
  private static readonly COPULAR_BLANK_PATTERN =
    /\b(la|el|los|las|the|a|an|le|les|der|die|das|il|lo|i|gli)\b\s+___\s*(es|is|est|ist|é|è|sind|sont|are)\b/i;

  // Discourse meta-openers the model occasionally outputs despite prompt instructions
  private static readonly META_DISCUSSION_PATTERN =
    /^(let'?s|let us|lassen|parlons|vamos a)/i;

  // English words that are NOT loanwords in Spanish, French, German, Italian, or Portuguese.
  // Keep this set small and high-confidence. Never add tech jargon — it loanwords freely.
  private static readonly UNAMBIGUOUS_ENGLISH_WORDS = new Set([
    // Determiners / pronouns — never appear as target-language vocabulary words
    'the', 'this', 'that', 'these', 'those', 'which', 'whose',
    'he', 'she', 'they', 'we', 'you', 'it', 'his', 'her', 'their', 'our', 'your',
    // Prepositions / conjunctions — English-only forms
    'with', 'from', 'about', 'into', 'onto', 'upon', 'until', 'unless',
    // Nouns with no loanword status in the supported languages
    'issue', 'update', 'safety', 'report', 'patient',
  ]);

  constructor() {
    this.provider = this.parseProvider();
    this.apiKey = this.resolveApiKey();
    this.model = this.resolveModel();
    this.fallbackModels = this.parseFallbackModels();
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

  async generateScenarioWords(input: ScenarioGenerationInput): Promise<GeneratedScenarioWord[]> {
    const count = input.count ?? 10;
    const excludeWords = input.excludeWords ?? [];
    const baseLanguages = input.baseLanguages.length > 0 ? input.baseLanguages : ['en'];

    const schema = `{
  "words": [
    {
      "word": "<single ${input.targetLanguage} word>",
      "ipa": "/<ipa>/",
      "complexityLevel": "beginner | intermediate | advanced",
      "examplePhrases": [
        { "text": "<phrase 1 in ${input.targetLanguage}>", "translation": "<translation in ${baseLanguages[0]}>" },
        { "text": "<phrase 2 in ${input.targetLanguage}>", "translation": "<translation in ${baseLanguages[0]}>" }
      ],
      "fillGapSentences": [
        { "template": "<sentence with ___ blank in ${input.targetLanguage}>", "answer": "<the word>", "templateTranslation": "<translation in ${baseLanguages[0]}>" },
        { "template": "<sentence with ___ blank in ${input.targetLanguage}>", "answer": "<the word>", "templateTranslation": "<translation in ${baseLanguages[0]}>" }
      ],
      "tags": ["<tag1>", "<tag2>", "<tag3>"],
      "translations": {
        ${baseLanguages.map((lang) => `"${lang}": "<translation in ${lang}>"`).join(',\n        ')}
      }
    }
  ]
}`;

    const wordsToAvoid = excludeWords.length
      ? `Do not include any of these words: ${excludeWords.join(', ')}.`
      : 'No pre-excluded words.';

    const result = await this.requestJson<{ words: GeneratedScenarioWord[] }>({
      system: [
        `You are a strict JSON generator for a professional ${input.targetLanguage} language-learning app.`,
        'Output only JSON, with no markdown or explanatory text.',
        JSON_CONTRACT_RULES,
      ].join(' '),
      prompt: [
        `Generate EXACTLY ${count} words in ${input.targetLanguage} for profession: ${input.profession}.`,
        input.professionDescription
          ? `Profession context: ${input.professionDescription}.`
          : '',
        `Subcategory: ${input.subcategoryName}${input.subcategoryDescription ? ` — ${input.subcategoryDescription}` : ''}.`,
        `Scenario: ${input.scenarioName}${input.scenarioDescription ? ` — ${input.scenarioDescription}` : ''}.`,
        wordsToAvoid,
        LANGUAGE_CONTRACT_RULES(input.targetLanguage, baseLanguages[0]),
        LEXICAL_RULES,
        SCENARIO_SELECTION_RULES,
        CONTEXTUAL_MEANING_RULES,
        PRONUNCIATION_GUARD_RULES,
        IPA_RULES,
        EXAMPLE_PHRASE_RULES,
        getFillGapRules(input.targetLanguage),
        'For every fill-gap sentence template in the target language, provide a translation in the base language.',
        `Return a JSON object matching this exact schema:\n${schema}`,
      ]
        .filter(Boolean)
        .join(' '),
      maxTokens: 3000,
      temperature: 0.2,
      validator: (value): value is { words: GeneratedScenarioWord[] } => {
        if (typeof value !== 'object' || value === null) return false;
        const words = (value as { words?: unknown }).words;
        if (!Array.isArray(words) || words.length === 0) return false;

        return words.some((item) => {
          if (typeof item !== 'object' || item === null) return false;
          const word = item as { word?: unknown };
          return typeof word.word === 'string' && word.word.trim().split(/\s+/).length === 1;
        });
      },
    });

    const dedupe = new Set<string>();
    const scenarioRejectionCounts = new Map<string, number>();
    const acceptedWords = result.words
      .map((word) => ({
        ...word,
        examplePhrases: (Array.isArray(word.examplePhrases)
          ? (word.examplePhrases as Array<{ text?: unknown; translation?: unknown }>)
          : [])
          .map((phrase) => ({
            text: typeof phrase.text === 'string' ? phrase.text.trim() : '',
            translation: typeof phrase.translation === 'string' ? phrase.translation.trim() : '',
          }))
          .filter((phrase) => phrase.text.length > 0 && phrase.translation.length > 0)
          .slice(0, 2),
        fillGapSentences: (Array.isArray(word.fillGapSentences)
          ? (word.fillGapSentences as Array<{ template?: unknown; answer?: unknown; templateTranslation?: unknown }>)
          : [])
          .map((sentence) => ({
            template: typeof sentence.template === 'string' ? sentence.template.trim() : '',
            answer: typeof sentence.answer === 'string' ? sentence.answer.trim() : word.word,
            templateTranslation: typeof sentence.templateTranslation === 'string' ? sentence.templateTranslation.trim() : undefined,
          }))
          .filter((sentence) => sentence.template.length > 0 && sentence.answer.length > 0)
          .slice(0, 2),
        tags: (Array.isArray(word.tags) ? word.tags : [])
          .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          .map((tag) => tag.trim())
          .slice(0, 5),
      }))
      .filter((word) => !excludeWords.map((w) => w.toLowerCase()).includes(word.word.toLowerCase()))
      .filter((word) => !this.isLikelyEnglishForTargetLanguage(word.word, input.targetLanguage))
      .filter((word) => {
        const rejectionReason = this.getScenarioWordRejectionReason(word, input);
        if (!rejectionReason) {
          return true;
        }

        const current = scenarioRejectionCounts.get(rejectionReason) ?? 0;
        scenarioRejectionCounts.set(rejectionReason, current + 1);
        return false;
      })
      .map((word) => ({
        ...word,
        ipa: this.validateIPA(word.ipa),
      }))
      .filter((word) => {
        const key = word.word.toLowerCase();
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      })
      .slice(0, count);

    if (acceptedWords.length < count) {
      this.logger.warn('Scenario word filtering dropped candidates', {
        profession: input.profession,
        subcategoryName: input.subcategoryName,
        scenarioName: input.scenarioName,
        requested: count,
        received: result.words.length,
        accepted: acceptedWords.length,
        rejections: Object.fromEntries(scenarioRejectionCounts),
      });
    }

    return acceptedWords;
  }

  async generateScenarioComprehension(
    input: ScenarioComprehensionInput,
  ): Promise<GeneratedComprehensionPassage[]> {
    const vocabulary = input.words.map((w) => w.word);
    const schema = `{
  "passages": [
    {
      "position": 1,
      "content": "<100-150 word passage in ${input.targetLanguage}>",
      "contentTranslation": "<translation of passage in ${input.baseLanguage}>",
      "tokenGlosses": [
        {
          "token": "<word from passage>",
          "start": <character position in passage>,
          "end": <character position end>,
          "lemma": "<base form if verb/adjective>",
          "baseLanguageGloss": "<translation or definition in ${input.baseLanguage}>",
          "source": "lesson_vocab or common_lexicon"
        }
      ],
      "questions": [
        {
          "questionText": "<question in ${input.targetLanguage}>",
          "questionTranslation": "<question in ${input.baseLanguage}>",
          "questionType": "multiple_choice",
          "options": ["A", "B", "C", "D"],
          "optionsTranslation": ["<A in ${input.baseLanguage}>", "<B in ${input.baseLanguage}>", "<C in ${input.baseLanguage}>", "<D in ${input.baseLanguage}>"],
          "correctAnswer": "<one of options>",
          "position": 1
        },
        {
          "questionText": "<question in ${input.targetLanguage}>",
          "questionTranslation": "<question in ${input.baseLanguage}>",
          "questionType": "multiple_choice",
          "options": ["A", "B", "C", "D"],
          "optionsTranslation": ["<A in ${input.baseLanguage}>", "<B in ${input.baseLanguage}>", "<C in ${input.baseLanguage}>", "<D in ${input.baseLanguage}>"],
          "correctAnswer": "<one of options>",
          "position": 4
        },
        {
          "questionText": "<question in ${input.targetLanguage}>",
          "questionTranslation": "<question in ${input.baseLanguage}>",
          "questionType": "short_answer",
          "options": null,
          "correctAnswer": "<short answer in ${input.targetLanguage}>",
          "position": 5
        }
      ]
    }
  ]
}`;

    const result = await this.requestJson<{ passages: GeneratedComprehensionPassage[] }>({
      system: [
        `You are a strict JSON generator for a professional ${input.targetLanguage} language-learning app.`,
        'Output only valid JSON with no markdown or commentary.',
        JSON_CONTRACT_RULES,
      ].join(' '),
      prompt: [
        `Write ${input.passageCount} professional passage(s) in ${input.targetLanguage}.`,
        `Profession: ${input.profession}. Subcategory: ${input.subcategoryName}. Scenario: ${input.scenarioName}.`,
        `Each passage must include ALL of these words in exact form: ${vocabulary.join(', ')}.`,
        'The passage must read like a specific workplace moment with a clear blocker, decision, or next step.',
        LANGUAGE_CONTRACT_RULES(input.targetLanguage, input.baseLanguage),
        'For every passage, question, and multiple-choice option in the target language, provide a complete translation in the base language.',
        'Ensure all translations match the target-language content exactly in meaning and context.',
        'For each passage, provide tokenGlosses ONLY for vocabulary NOT in the lesson word list.',
        'Include token start/end character positions, lemma (base form) for verbs/adjectives, baseLanguageGloss (translation), and source (lesson_vocab or common_lexicon).',
        'Aim for 70%+ of passage tokens covered by lesson vocab + common lexicon.',
        COMPREHENSION_QUESTION_RULES,
        `Return a JSON object matching this exact schema:\n${schema}`,
      ].join(' '),
      maxTokens: 3000,
      temperature: 0.35,
      validator: (value): value is { passages: GeneratedComprehensionPassage[] } => {
        if (typeof value !== 'object' || value === null) return false;
        const passages = (value as { passages?: unknown }).passages;
        if (!Array.isArray(passages) || passages.length === 0) return false;

        return passages.some((passage) => {
          if (typeof passage !== 'object' || passage === null) return false;
          const typed = passage as { content?: unknown; questions?: unknown };
          return typeof typed.content === 'string' && Array.isArray(typed.questions);
        });
      },
    });

    const normalizedPassages = result.passages
      .map((passage, passageIndex) => {
        const questions = Array.isArray(passage.questions) ? passage.questions : [];

        const multipleChoice = questions
          .filter((question) => question.questionType === 'multiple_choice')
          .filter((question) =>
            this.validateMCQAnswer({ options: question.options, correctAnswer: question.correctAnswer }),
          )
          .slice(0, 4)
          .map((question) => ({
            ...question,
            options: question.options,
            correctAnswer: String(question.correctAnswer || '').trim(),
            questionType: 'multiple_choice' as const,
            questionTranslation: typeof question.questionTranslation === 'string' ? question.questionTranslation.trim() : undefined,
            optionsTranslation: Array.isArray(question.optionsTranslation)
              ? (question.optionsTranslation as string[])
                  .map((opt) => (typeof opt === 'string' ? opt.trim() : ''))
                  .filter((opt) => opt.length > 0)
              : undefined,
          }));

        const shortAnswer = questions
          .filter((question) => question.questionType === 'short_answer')
          .map((question) => ({
            ...question,
            options: null,
            questionType: 'short_answer' as const,
            correctAnswer: String(question.correctAnswer || '')
              .trim()
              .split(/\s+/)
              .slice(0, 3)
              .join(' '),
            questionTranslation: typeof question.questionTranslation === 'string' ? question.questionTranslation.trim() : undefined,
          }))
          .find((question) => this.isValidShortAnswer(question.correctAnswer));

        const normalizedQuestions = [
          ...multipleChoice,
          ...(shortAnswer ? [shortAnswer] : []),
        ].map((question, index) => ({
          ...question,
          position: index + 1,
        }));

        return {
          ...passage,
          position: passage.position || passageIndex + 1,
          contentTranslation: typeof passage.contentTranslation === 'string' ? passage.contentTranslation.trim() : undefined,
          questions: normalizedQuestions,
        };
      })
      .filter((passage) => {
        if (typeof passage.content !== 'string' || passage.content.trim().length === 0) {
          return false;
        }

        return Array.isArray(passage.questions) && passage.questions.length >= 3;
      });

    return normalizedPassages.slice(0, input.passageCount);
  }

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
        CONTEXTUAL_MEANING_RULES,
        PRONUNCIATION_GUARD_RULES,
        `Scene anchor: all examples must sound like short utterances inside a ${input.profession} workflow, not textbook statements.`,
        'Each word must have EXACTLY 2 exampleSentences. No more, no fewer.',
        'Each sentence must be natural, professional, and directly relevant to the given profession.',
        'Sentence 1 should sound operational (instruction, check, or update). Sentence 2 should sound interactional (question, response, or handoff).',
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
            !this.isLikelyEnglishForTargetLanguage(
              (w as GeneratedLessonWord).word,
              input.targetLanguage,
            ) &&
            this.hasMeaningfulExampleSentences(
              (w as GeneratedLessonWord).exampleSentences,
              input.profession,
            ),
        );
      },
    });

    // Post-process: deduplicate against excludeWords and enforce count
    const excludeSet = new Set(input.excludeWords.map((w) => w.toLowerCase()));
    const clean = result.words
      .filter((w) => !excludeSet.has(w.word.toLowerCase()))
      .filter((w) => !this.isLikelyEnglishForTargetLanguage(w.word, input.targetLanguage))
      .filter((w) => this.hasMeaningfulExampleSentences(w.exampleSentences, input.profession))
      .slice(0, input.count);

    if (clean.length > 0) {
      return clean;
    }

    return result.words
      .filter((w) => !excludeSet.has(w.word.toLowerCase()))
      .slice(0, input.count);
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
      "spokenForm": "<how this sentence should be spoken naturally in ${input.targetLanguage}; must avoid English-looking tokens>",
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
        PRONUNCIATION_GUARD_RULES,
        'Avoid sentence patterns that read like translated English. Prefer native phrasing and rhythm.',
        'Provide spokenForm for each exercise. spokenForm should be what TTS must read if targetText contains ambiguous or English-looking words.',
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
        (value as { exercises: unknown[] }).exercises.length > 0 &&
        (value as { exercises: GeneratedPronunciationExercise[] }).exercises.every(
          (exercise) =>
            typeof exercise.targetText === 'string' &&
            (exercise.spokenForm === undefined || typeof exercise.spokenForm === 'string') &&
            !this.isLikelyEnglishForTargetLanguage(exercise.targetText, input.targetLanguage),
        ),
    }).then((result) => {
      const critiqued = this.critiquePronunciationExercises(result.exercises, input.targetLanguage);
      if (critiqued.length > 0) {
        return critiqued;
      }

      return fallback.map((exercise) => ({
        ...exercise,
        spokenForm: this.rewriteSpeechForm(exercise.spokenForm || exercise.targetText, input.targetLanguage),
      }));
    });
  }

  async gradePronunciation(input: PronunciationScoringInput): Promise<PronunciationScoringResult | null> {
    if (!this.hasConfiguredKey()) {
      return null;
    }

    const targetText = String(input.targetText || '').trim();
    const transcriptText = String(input.transcriptText || '').trim();
    if (!targetText || !transcriptText) {
      return null;
    }

    try {
      return await this.requestJson<PronunciationScoringResult>({
        system: [
          'You are a strict pronunciation scoring engine for a language-learning app.',
          'Score only the spoken transcript against the target text.',
          'Do not discuss audio quality, speaker intent, or unrelated language learning advice.',
          'Return only valid JSON that matches the schema exactly.',
          JSON_CONTRACT_RULES,
        ].join(' '),
        prompt: [
          `Target language: ${input.languageCode}.`,
          `Target text: ${targetText}.`,
          `STT transcript: ${transcriptText}.`,
          input.ipa ? `IPA hint: ${input.ipa}.` : '',
          input.professionContext ? `Profession context: ${input.professionContext}.` : '',
          input.lessonContext ? `Lesson context: ${input.lessonContext}.` : '',
          typeof input.baseSimilarityScore === 'number'
            ? `Deterministic similarity score from the server: ${input.baseSimilarityScore}.`
            : '',
          typeof input.transcriptConfidence === 'number'
            ? `STT confidence from the server: ${input.transcriptConfidence}.`
            : '',
          'Grade the transcript on a 0-100 scale where 100 means the spoken word is essentially correct and 0 means unrelated or unintelligible.',
          'Use strict context: a near-match should not be collapsed to zero, but a clearly wrong word should score very low.',
          'Prefer conservative scoring when the transcript is ambiguous.',
          'Return a concise learner-facing feedback string with no more than one sentence.',
          'Use errorType from: none, wrong_word, missing_sound, stress, vowel, consonant, unclear, other.',
          'Return JSON with fields: score, feedback, errorType.',
        ]
          .filter(Boolean)
          .join(' '),
        maxTokens: 220,
        temperature: 0,
        validator: (value): value is PronunciationScoringResult => {
          if (typeof value !== 'object' || value === null) return false;

          const result = value as Partial<PronunciationScoringResult>;
          const validErrorTypes: PronunciationErrorType[] = [
            'none',
            'wrong_word',
            'missing_sound',
            'stress',
            'vowel',
            'consonant',
            'unclear',
            'other',
          ];

          return (
            typeof result.score === 'number' &&
            Number.isFinite(result.score) &&
            result.score >= 0 &&
            result.score <= 100 &&
            typeof result.feedback === 'string' &&
            result.feedback.trim().length > 0 &&
            typeof result.errorType === 'string' &&
            validErrorTypes.includes(result.errorType as PronunciationErrorType)
          );
        },
      });
    } catch (error) {
      this.logger.warn('Pronunciation grading request failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
    const fallbackCandidates = this.fallbackModels.filter((candidate) => candidate !== this.model);
    const providerLabel = this.provider.toUpperCase();

    if (!this.hasConfiguredKey()) {
      if (hasFallback) return input.fallback as T;
      throw new Error(`${providerLabel} API key is not configured`);
    }

    // Single attempt only — no in-function retry.
    // Vercel functions have a 60s hard timeout; a retry would double latency
    // and guarantee a timeout. QStash handles job-level retries automatically.
    let modelUsed = this.model;
    try {
      const text = await this.callProvider(
        this.model,
        input.system,
        input.prompt,
        input.maxTokens,
        input.temperature ?? 0,
      );

      const result = this.tryParse(text, input.validator);


      if (result !== null) return result;

      this.logger.warn(`${providerLabel} response failed validation`, {
        model: modelUsed,
        preview: text.slice(0, 300),
      });

      for (const fallbackModel of fallbackCandidates) {
        modelUsed = fallbackModel;
        try {
          const fallbackText = await this.callProvider(
            fallbackModel,
            input.system,
            input.prompt,
            input.maxTokens,
            input.temperature ?? 0,
          );

          const fallbackResult = this.tryParse(fallbackText, input.validator);
          if (fallbackResult !== null) return fallbackResult;

          this.logger.warn(`${providerLabel} fallback response failed validation`, {
            model: fallbackModel,
            preview: fallbackText.slice(0, 300),
          });
        } catch (fallbackError) {
          const fallbackDetails = this.extractAxiosErrorDetails(fallbackError);
          this.logger.warn(`${providerLabel} fallback call failed`, {
            model: fallbackModel,
            status: fallbackDetails.status,
            message: fallbackDetails.message,
            responseBody: fallbackDetails.responseBody,
          });
        }
      }
    } catch (error) {
      const shouldRetryWithFallback =
        this.shouldRetryWithFallbackModel(error);

      const details = this.extractAxiosErrorDetails(error);

      if (shouldRetryWithFallback) {
        this.logger.warn(`${providerLabel} primary model unavailable, retrying with fallback candidates`, {
          requestedModel: this.model,
          fallbackModels: fallbackCandidates,
          status: details.status,
          message: details.message,
          responseBody: details.responseBody,
        });

        let lastFallbackError: unknown = null;
        for (const fallbackModel of fallbackCandidates) {
          modelUsed = fallbackModel;
          try {
            const text = await this.callProvider(
              fallbackModel,
              input.system,
              input.prompt,
              input.maxTokens,
              input.temperature ?? 0,
            );

            const result = this.tryParse(text, input.validator);
            if (result !== null) return result;

            this.logger.warn(`${providerLabel} fallback response failed validation`, {
              model: fallbackModel,
              preview: text.slice(0, 300),
            });
          } catch (fallbackError) {
            lastFallbackError = fallbackError;
            const fallbackDetails = this.extractAxiosErrorDetails(fallbackError);
            this.logger.warn(`${providerLabel} fallback call failed`, {
              model: fallbackModel,
              status: fallbackDetails.status,
              message: fallbackDetails.message,
              responseBody: fallbackDetails.responseBody,
            });
          }
        }

        if (!hasFallback && lastFallbackError) {
          throw lastFallbackError;
        }
      } else {
        this.logger.warn(`${providerLabel} call failed`, {
          model: this.model,
          status: details.status,
          message: details.message,
          responseBody: details.responseBody,
        });
        if (!hasFallback) throw error;
      }
    }

    if (hasFallback) {
      this.logger.warn(`${providerLabel} response unusable — using fallback content`);
      return input.fallback as T;
    }

    throw new Error(`${providerLabel} model ${modelUsed} returned no valid JSON`);
  }

  private async callProvider(
    model: string,
    system: string,
    prompt: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    if (this.provider === 'openai') {
      const response = await axios.post<OpenAIResponse>(
        'https://api.openai.com/v1/chat/completions',
        {
          model,
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
          },
          timeout: 45000,
        },
      );

      const choice = response.data.choices?.[0];
      if (choice?.finish_reason === 'length') {
        this.logger.warn('OpenAI response was cut off by model output-token limit', {
          model,
          maxTokensRequested: maxTokens,
        });
      }

      const content = choice?.message?.content ?? '';
      return typeof content === 'string' ? content.trim() : '';
    }

    const response = await axios.post<OpenRouterResponse>(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
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
        model,
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
      this.apiKey !== 'YOUR_OPENROUTER_API_KEY' &&
      this.apiKey !== 'YOUR_OPENAI_API_KEY',
    );
  }

  private shouldRetryWithFallbackModel(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    if (!status) {
      return ClaudeClient.isRetriableError(error);
    }

    if (status === 404) {
      return true;
    }

    if (status !== 400) {
      return false;
    }

    const responseBody = this.safeSerialize(error.response?.data).toLowerCase();
    const message = String(error.message || '').toLowerCase();

    // Retry on model/provider compatibility issues that are commonly reported
    // by OpenRouter as HTTP 400.
    const modelSignals = [
      'model',
      'provider',
      'endpoint',
      'not found',
      'unsupported',
      'invalid model',
      'no endpoints',
      'not available',
    ];

    return modelSignals.some((signal) => responseBody.includes(signal) || message.includes(signal));
  }

  private extractAxiosErrorDetails(error: unknown): {
    status: number | null;
    message: string;
    responseBody: string;
  } {
    if (!axios.isAxiosError(error)) {
      return {
        status: null,
        message: String(error),
        responseBody: '',
      };
    }

    return {
      status: error.response?.status ?? null,
      message: error.message,
      responseBody: this.safeSerialize(error.response?.data),
    };
  }

  private safeSerialize(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }


  private parseFallbackModels(): string[] {
    const configured =
      this.provider === 'openai'
        ? process.env.OPENAI_FALLBACK_MODELS
        : process.env.OPENROUTER_FALLBACK_MODELS;
    if (configured && configured.trim().length > 0) {
      const parsed = configured
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (parsed.length > 0) {
        return parsed;
      }
    }

    if (this.provider === 'openai') {
      return ['gpt-4o-mini', 'gpt-4.1-mini'];
    }

    return [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ];
  }

  private parseProvider(): AiProvider {
    const raw = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
    if (raw === 'openai') {
      return 'openai';
    }
    return 'openrouter';
  }

  private resolveApiKey(): string | undefined {
    if (this.provider === 'openai') {
      return process.env.OPENAI_API_KEY;
    }
    return process.env.OPENROUTER_API_KEY || process.env.CLAUDE_API_KEY;
  }

  private resolveModel(): string {
    if (this.provider === 'openai') {
      return process.env.OPENAI_MODEL || 'gpt-4o-mini';
    }
    return (
      process.env.OPENROUTER_MODEL ||
      process.env.CLAUDE_MODEL ||
      'anthropic/claude-3.5-sonnet'
    );
  }

  private hasMeaningfulExampleSentences(exampleSentences: unknown, _profession: string): boolean {
    if (!Array.isArray(exampleSentences) || exampleSentences.length < 2) return false;

    return exampleSentences.every((entry) => {
      if (typeof entry !== 'object' || entry === null) return false;
      const text = String((entry as { text?: string }).text || '').trim();
      if (!text) return false;

      const tokenCount = text.split(/\s+/).length;
      if (tokenCount < 4 || tokenCount > 12) return false;

      if (this.isDefinitionStylePhrase(text)) return false;

      return true;
    });
  }

  private getScenarioWordRejectionReason(
    word: GeneratedScenarioWord,
    input: ScenarioGenerationInput,
  ): string | null {
    const normalizedWord = word.word.trim().toLowerCase();
    if (!normalizedWord) return 'empty_word';

    if (this.isLikelyEnglishForTargetLanguage(normalizedWord, input.targetLanguage)) {
      return 'likely_english';
    }

    if (this.isGenericScenarioWord(normalizedWord, input.targetLanguage, input.profession, input)) {
      return 'generic_word';
    }

    if (!this.hasMeaningfulScenarioPhrases(word.examplePhrases)) {
      return 'phrases_gate';
    }

    if (!this.hasMeaningfulScenarioTemplates(word.fillGapSentences, input.targetLanguage)) {
      return 'templates_gate';
    }

    return null;
  }

  private isDefinitionStylePhrase(text: string): boolean {
    return (
      ClaudeClient.DEFINITION_COPULAS.test(text) &&
      ClaudeClient.GENERIC_ADJECTIVES.test(text)
    );
  }

  private hasMeaningfulScenarioPhrases(
    examplePhrases: Array<{ text: string; translation: string }>,
  ): boolean {
    if (!Array.isArray(examplePhrases) || examplePhrases.length !== 2) return false;

    return examplePhrases.every((phrase) => {
      const text = String(phrase?.text || '').trim();
      const translation = String(phrase?.translation || '').trim();
      if (!text || !translation) return false;

      const tokenCount = text.split(/\s+/).length;
      if (tokenCount < 2 || tokenCount > 7) return false;

      if (this.isDefinitionStylePhrase(text)) return false;

      return true;
    });
  }

  private hasMeaningfulScenarioTemplates(
    sentences: Array<{ template: string; answer: string }>,
    targetLanguage: string,
  ): boolean {
    if (!Array.isArray(sentences) || sentences.length !== 2) return false;

    return sentences.every((sentence) => {
      const template = String(sentence.template || '').trim();
      if (!this.validateFillGapTemplate(template, sentence.answer)) return false;
      if (!this.hasScenarioFramingStarter(template, targetLanguage)) return false;
      if (ClaudeClient.COPULAR_BLANK_PATTERN.test(template)) return false;
      if (ClaudeClient.META_DISCUSSION_PATTERN.test(template)) return false;
      return true;
    });
  }

  private hasScenarioFramingStarter(template: string, targetLanguage: string): boolean {
    const normalized = String(targetLanguage || '').trim().toLowerCase();
    const languageRoot = normalized.slice(0, 2);
    const pattern = SCENARIO_FILL_GAP_STARTERS[languageRoot];

    // Unknown language: keep this guard permissive and rely on other quality checks.
    if (!pattern) {
      return true;
    }

    return pattern.test(template);
  }

  private isGenericScenarioWord(
    word: string,
    _targetLanguage: string,
    _profession: string,
    input?: ScenarioGenerationInput,
  ): boolean {
    const value = word.trim().toLowerCase();
    if (!value) return true;

    // Hyphens indicate the model output a phrase disguised as a compound word
    if (value.includes('-')) return true;

    // Context echo: if the word is a token from the scenario/profession label itself,
    // the model echoed the prompt rather than generating lesson vocabulary.
    if (input) {
      const contextTokens = [input.scenarioName, input.subcategoryName, input.profession]
        .join(' ')
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 3);
      if (contextTokens.includes(value)) return true;
    }

    return false;
  }

  private isLikelyEnglishForTargetLanguage(text: string, targetLanguage: string): boolean {
    const normalizedLanguage = targetLanguage.trim().toLowerCase();
    if (normalizedLanguage === 'en' || normalizedLanguage.startsWith('en')) return false;

    const value = text.trim().toLowerCase();
    if (!value) return false;

    // Non-ASCII characters (diacritics, CJK, Arabic, etc.) → not plain English orthography
    if (/[^\x00-\x7F]/.test(value)) return false;

    const tokens = value.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      return ClaudeClient.UNAMBIGUOUS_ENGLISH_WORDS.has(value);
    }

    // Multi-token text (e.g., pronunciation exercise sentences): if >30% of tokens are
    // unambiguous English function words, the text is predominantly English.
    const englishCount = tokens.filter((t) => ClaudeClient.UNAMBIGUOUS_ENGLISH_WORDS.has(t)).length;
    return englishCount / tokens.length > 0.3;
  }

  private critiquePronunciationExercises(
    exercises: GeneratedPronunciationExercise[],
    targetLanguage: string,
  ): GeneratedPronunciationExercise[] {
    const critiqued: Array<GeneratedPronunciationExercise | null> = exercises
      .map((exercise, index) => {
        const targetText = String(exercise.targetText || '').trim();
        if (!targetText) {
          return null;
        }

        const spokenSource = String(exercise.spokenForm || targetText).trim();
        const repairedSpokenForm = this.rewriteSpeechForm(spokenSource, targetLanguage);

        if (this.hasHighRiskPronunciationTokens(repairedSpokenForm, targetLanguage)) {
          return null;
        }

        return {
          ...exercise,
          targetText,
          spokenForm: repairedSpokenForm,
          position: exercise.position || index + 1,
        };
      });

    return critiqued.filter(
      (exercise): exercise is GeneratedPronunciationExercise => exercise !== null,
    );
  }

  private rewriteSpeechForm(text: string, targetLanguage: string): string {
    const normalizedLanguage = String(targetLanguage || '').trim().toLowerCase();
    if (!text || !normalizedLanguage || normalizedLanguage.startsWith('en')) {
      return text;
    }

    const languageRoot = normalizedLanguage.slice(0, 2);
    const replacements: Record<string, Record<string, string>> = {
      es: {
        update: 'actualizacion',
        report: 'informe',
        team: 'equipo',
        manager: 'gerente',
        check: 'revision',
        meeting: 'reunion',
        handoff: 'traspaso',
        support: 'soporte',
      },
      de: {
        update: 'aktualisierung',
        report: 'bericht',
        team: 'team',
        manager: 'leiter',
        check: 'pruefung',
        meeting: 'besprechung',
        handoff: 'uebergabe',
        support: 'unterstuetzung',
      },
      fr: {
        update: 'mise a jour',
        report: 'rapport',
        team: 'equipe',
        manager: 'responsable',
        check: 'verification',
        meeting: 'reunion',
        handoff: 'transmission',
        support: 'assistance',
      },
    };

    const mapping = replacements[languageRoot];
    if (!mapping) {
      return text;
    }

    return text
      .split(/(\s+)/)
      .map((token) => this.rewriteSpeechToken(token, mapping))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private rewriteSpeechToken(token: string, mapping: Record<string, string>): string {
    if (!token || /^\s+$/.test(token) || !/[A-Za-z]/.test(token)) {
      return token;
    }

    const leading = token.match(/^[^A-Za-z0-9]*/)?.[0] || '';
    const trailing = token.match(/[^A-Za-z0-9]*$/)?.[0] || '';
    const core = token.slice(leading.length, token.length - trailing.length);

    if (!core) {
      return token;
    }

    const replacement = mapping[core.toLowerCase()];
    if (!replacement) {
      return token;
    }

    return `${leading}${this.matchOriginalCase(core, replacement)}${trailing}`;
  }

  private matchOriginalCase(source: string, mapped: string): string {
    if (source.toUpperCase() === source) {
      return mapped.toUpperCase();
    }

    if (source[0] === source[0].toUpperCase()) {
      return mapped.charAt(0).toUpperCase() + mapped.slice(1);
    }

    return mapped;
  }

  private hasHighRiskPronunciationTokens(text: string, targetLanguage: string): boolean {
    const normalizedLanguage = String(targetLanguage || '').trim().toLowerCase();
    if (!text || !normalizedLanguage || normalizedLanguage.startsWith('en')) {
      return false;
    }

    const riskyTokens = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    return riskyTokens.some((token) => this.isLikelyEnglishForTargetLanguage(token, targetLanguage));
  }

  private validateIPA(ipa: string | undefined | null): string | null {
    if (!ipa || typeof ipa !== 'string') return null;
    const cleaned = ipa.trim();
    if (/^\/.*\/$/.test(cleaned)) return cleaned;
    if (/[əɪɛæɔʊʌθðʃʒŋɑɒɐɾɲ]/.test(cleaned)) return cleaned;
    return null;
  }

  private validateFillGapTemplate(template: string, answer: string): boolean {
    if (!template || !answer) return false;
    const blankCount = (template.match(/___/g) || []).length;
    if (blankCount !== 1) return false;

    const withoutBlank = template.replace('___', '').toLowerCase();
    return !withoutBlank.includes(answer.toLowerCase());
  }

  private validateMCQAnswer(input: {
    options?: string[] | null;
    correctAnswer: string;
  }): boolean {
    if (!input.options || !Array.isArray(input.options)) return true;
    if (input.options.length !== 4) return false;
    return input.options.some((option) => option === input.correctAnswer);
  }

  private isValidShortAnswer(answer: string): boolean {
    if (typeof answer !== 'string') {
      return false;
    }

    const tokens = answer
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0);

    return tokens.length >= 1 && tokens.length <= 3;
  }
}