// Common types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | Record<string, string[]>;
  statusCode?: number;
}

// Auth types
export interface JwtPayload {
  learnerId: string;
  email: string;
  tokenType?: 'access' | 'refresh' | 'onboarding';
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest {
  user?: JwtPayload;
  learnerId?: string;
}

// Mastery calculation types
export interface MasterySignals {
  usageAccuracy: number; // 0-10, from phrase/sentence completion
  pronunciationAccuracy: number; // 0-10, from ElevenLabs
  responseSpeed: number; // 0-10, calculated from attempt timestamps
}

export interface MasteryScoreResult {
  masteryScore: number;
  signals: MasterySignals;
  isMastered: boolean;
}

// Lesson generation types
export interface LessonGenerationInput {
  learningPathId: string;
  learnerId: string;
  language: string;
  profession: string;
  wordsPerLesson: number;
  excludeWords: string[];
}

export interface GeneratedWordData {
  word: string;
  translations: {
    language: string;
    translation: string;
  }[];
  examplePhrases: string[];
  exampleSentences: string[];
  tags: string[];
  complexityLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

export interface LessonData {
  words: GeneratedWordData[];
  milestone1Status: string;
  totalWordsGenerated: number;
}

// Window advancement types
export interface WindowAdvancementResult {
  promotedWord: {
    wordId: string;
    word: string;
  };
  nextLockedWord?: {
    wordId: string;
    word: string;
  };
  needsExtension: boolean;
}

// Audio cache types
export interface AudioCacheData {
  wordId: string;
  audioUrl: string;
  ipa: string;
}

// Pronunciation exercise types
export interface PronunciationExerciseData {
  targetText: string;
  referenceAudioUrl: string;
  complexityLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  position: number;
}

// Comprehension types
export interface ComprehensionQuestion {
  questionText: string;
  options?: string[];
  correctAnswer: string;
  questionType: 'MULTIPLE_CHOICE' | 'SHORT_ANSWER';
  position: number;
}

export interface StoryData {
  content: string;
  questions: ComprehensionQuestion[];
  vocabularyCoverage: string[];
}
