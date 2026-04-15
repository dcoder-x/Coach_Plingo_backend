const mockMarkProcessing = jest.fn();
const mockMarkCompleted = jest.fn();
const mockMarkFailed = jest.fn();

const mockUpdateGeneratedWords = jest.fn();
const mockNotifyLessonAvailable = jest.fn();
const mockNotifyError = jest.fn();

const mockGetSubcategoryTag = jest.fn();
const mockGetUnusedWordsForSubcategoryFromGlobalSet = jest.fn();
const mockAddWordsToGlobalSet = jest.fn();
const mockAddTranslation = jest.fn();
const mockWordHasSubcategory = jest.fn();
const mockAssignWordsToLearner = jest.fn();
const mockGetActiveWindowSize = jest.fn();
const mockPromoteNextWord = jest.fn();

const mockGenerateLessonWords = jest.fn();

jest.mock('../../src/services/AIService', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    markProcessing: mockMarkProcessing,
    markCompleted: mockMarkCompleted,
    markFailed: mockMarkFailed,
  })),
}));

jest.mock('../../src/services/LearningService', () => ({
  LearningService: jest.fn().mockImplementation(() => ({
    updateGeneratedWords: mockUpdateGeneratedWords,
  })),
}));

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifyLessonAvailable: mockNotifyLessonAvailable,
    notifyError: mockNotifyError,
  })),
}));

jest.mock('../../src/services/VocabularyService', () => ({
  VocabularyService: jest.fn().mockImplementation(() => ({
    getSubcategoryTag: mockGetSubcategoryTag,
    getUnusedWordsForSubcategoryFromGlobalSet: mockGetUnusedWordsForSubcategoryFromGlobalSet,
    addWordsToGlobalSet: mockAddWordsToGlobalSet,
    addTranslation: mockAddTranslation,
    wordHasSubcategory: mockWordHasSubcategory,
    assignWordsToLearner: mockAssignWordsToLearner,
    getActiveWindowSize: mockGetActiveWindowSize,
    promoteNextWord: mockPromoteNextWord,
  })),
}));

jest.mock('../../src/jobs/clients/ClaudeClient', () => {
  class MockClaudeClient {
    static isRetriableError = jest.fn().mockReturnValue(false);
    generateLessonWords = mockGenerateLessonWords;
  }

  return { ClaudeClient: MockClaudeClient };
});

import { GenerateLessonHandler } from '../../src/jobs/handlers/GenerateLessonHandler';

describe('GenerateLessonHandler', () => {
  const payload = {
    learningPathId: 'path_1',
    learnerId: 'learner_1',
    language: 'es',
    profession: 'healthcare',
    currentSubcategoryId: 'sub_1',
    currentSubcategoryName: 'Nursing',
    currentSubcategoryDescription: 'Patient care terms',
    subcategories: [
      { id: 'sub_1', name: 'Nursing', description: 'Patient care terms', wordAllocation: 100, position: 1 },
      { id: 'sub_2', name: 'Pharmacy', description: 'Medication terms', wordAllocation: 100, position: 2 },
    ],
    wordsPerLesson: 2,
    globalSetId: 'set_1',
    milestoneId: 'milestone_1',
    baseLanguage: 'en',
    excludeWords: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSubcategoryTag.mockReturnValue('subcategory:sub_1');
    mockGetUnusedWordsForSubcategoryFromGlobalSet.mockResolvedValue([]);
    mockGetActiveWindowSize.mockResolvedValue(0);
    mockPromoteNextWord.mockResolvedValue({ promoted: { id: 'state_1' } });
    mockWordHasSubcategory.mockReturnValue(true);
    mockAssignWordsToLearner.mockResolvedValue([]);
    mockUpdateGeneratedWords.mockResolvedValue(undefined);
    mockMarkProcessing.mockResolvedValue(undefined);
    mockMarkCompleted.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockNotifyLessonAvailable.mockResolvedValue(undefined);
    mockNotifyError.mockResolvedValue(undefined);
    mockAddTranslation.mockResolvedValue(undefined);
  });

  it('persists and assigns only words that match the active subcategory', async () => {
    mockGenerateLessonWords.mockResolvedValue([
      {
        word: 'triaje',
        translation: 'triage',
        subcategory: 'Nursing',
        complexityLevel: 'BEGINNER',
        examplePhrases: ['triaje rapido'],
        exampleSentences: ['El triaje empieza ahora.'],
        tags: ['care'],
      },
      {
        word: 'farmaco',
        translation: 'drug',
        subcategory: 'Pharmacy',
        complexityLevel: 'BEGINNER',
        examplePhrases: ['nuevo farmaco'],
        exampleSentences: ['Este farmaco es efectivo.'],
        tags: ['medication'],
      },
    ]);

    mockAddWordsToGlobalSet.mockResolvedValue([
      {
        id: 'word_1',
        word: 'triaje',
        tags: ['care', 'subcategory:sub_1'],
      },
    ]);

    const handler = new GenerateLessonHandler({} as never);
    const result = await handler.handle('job_1', payload as never);

    expect(mockAddWordsToGlobalSet).toHaveBeenCalledTimes(1);
    expect(mockAddWordsToGlobalSet.mock.calls[0][1]).toEqual([
      expect.objectContaining({
        word: 'triaje',
        tags: expect.arrayContaining(['care', 'subcategory:sub_1']),
      }),
    ]);
    expect(mockAssignWordsToLearner).toHaveBeenCalledWith('path_1', [
      expect.objectContaining({ word: 'triaje' }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        learningPathId: 'path_1',
        assignedWords: 1,
        generatedWords: ['triaje'],
      }),
    );
  });

  it('marks job as failed when no valid words can be produced for the subcategory', async () => {
    mockGenerateLessonWords.mockResolvedValue([
      {
        word: 'farmaco',
        translation: 'drug',
        subcategory: 'Pharmacy',
        complexityLevel: 'BEGINNER',
        examplePhrases: ['nuevo farmaco'],
        exampleSentences: ['Este farmaco es efectivo.'],
        tags: ['medication'],
      },
    ]);
    mockAddWordsToGlobalSet.mockResolvedValue([]);

    const handler = new GenerateLessonHandler({} as never);

    await expect(handler.handle('job_2', payload as never)).rejects.toThrow(
      'No lesson vocabulary could be produced',
    );

    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
    expect(mockNotifyError).toHaveBeenCalledWith('learner_1', 'Lesson generation failed.');
  });
});
