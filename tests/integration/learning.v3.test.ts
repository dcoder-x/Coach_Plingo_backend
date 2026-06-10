import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler';

const mockGetCurrentScenarioSession = jest.fn();
const mockCompleteCurrentScenarioSession = jest.fn();
const mockGetLessons = jest.fn();
const mockRetakeLesson = jest.fn();

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.learnerId = 'learner_test';
    next();
  },
}));

jest.mock('../../src/controllers/LearningController', () => ({
  LearningController: jest.fn().mockImplementation(() => ({
    createPath: jest.fn(),
    getPaths: jest.fn(),
    getPath: jest.fn(),
    archivePath: jest.fn(),
    resumePath: jest.fn(),
    resetPath: jest.fn(),
    getPathSubcategories: jest.fn(),
    updatePath: jest.fn(),
    getMilestones: jest.fn(),
    getActiveMilestone: jest.fn(),
    getPathReadiness: jest.fn(),
    getCurrentSession: jest.fn(),
    getPreparationJobStatus: jest.fn(),
    completeCurrentSession: jest.fn(),
    getCurrentScenarioSession: mockGetCurrentScenarioSession,
    completeCurrentScenarioSession: mockCompleteCurrentScenarioSession,
    getLessons: mockGetLessons,
    retakeLesson: mockRetakeLesson,
    advanceMilestone: jest.fn(),
    deletePath: jest.fn(),
    getPathVocabulary: jest.fn(),
    getPathProgress: jest.fn(),
  })),
}));

import learningRouter from '../../src/routes/learning';

describe('learning v3 scenario routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetCurrentScenarioSession.mockImplementation(
      async (_req: express.Request, res: express.Response) => {
        res.json({
          success: true,
          data: {
            ready: true,
            lessonType: 'SCENARIO',
            lessonId: 'lesson_1',
            words: [],
            comprehension: [],
          },
        });
      },
    );

    mockCompleteCurrentScenarioSession.mockImplementation(
      async (_req: express.Request, res: express.Response) => {
        res.json({
          success: true,
          data: {
            success: true,
            lessonId: 'lesson_1',
            retake: false,
            lessonPassed: true,
            unlockedNextLesson: true,
            pathCompleted: false,
            wordMasteryLevel: 100,
            lessonMastered: true,
            performance: {
              totalExercises: 24,
              passedExercises: 24,
              passRate: 100,
              breakdown: {
                fillGapPassedCount: 10,
                pronunciationPassedCount: 10,
                comprehensionPassedCount: 4,
              },
              thresholds: {
                pronunciationPassThreshold: 70,
                unlockThreshold: 70,
                wordMasteryThreshold: 70,
              },
            },
          },
        });
      },
    );

    mockGetLessons.mockImplementation(async (_req: express.Request, res: express.Response) => {
      res.json({
        success: true,
        data: {
          pathId: 'path_1',
          summary: {
            totalLessons: 2,
            completedLessons: 1,
            masteredLessons: 1,
            activeLessons: 1,
            lockedLessons: 0,
          },
          subcategories: [],
        },
      });
    });

    mockRetakeLesson.mockImplementation(async (_req: express.Request, res: express.Response) => {
      res.json({
        success: true,
        data: {
          ready: true,
          lessonType: 'SCENARIO',
          lessonId: 'lesson_1',
          retake: true,
          words: [],
          comprehension: [],
        },
      });
    });
  });

  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/learning', learningRouter);
    app.use(errorHandler);

    return app;
  }

  it('serves current scenario session endpoint', async () => {
    const app = createTestApp();

    const response = await request(app).get('/learning/paths/path_1/current-scenario-session');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(mockGetCurrentScenarioSession).toHaveBeenCalledTimes(1);
  });

  it('validates complete scenario payload and rejects malformed request', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/learning/paths/path_1/current-scenario-session/complete')
      .send({
        lessonType: 'SCENARIO',
        wordResults: [
          {
            wordId: 'word_1',
            fillGapCorrect: true,
            // attemptCount is intentionally missing to assert schema validation.
          },
        ],
        comprehensionResponses: [],
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Validation failed',
      }),
    );
    expect(mockCompleteCurrentScenarioSession).not.toHaveBeenCalled();
  });

  it('accepts valid complete scenario payload', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/learning/paths/path_1/current-scenario-session/complete')
      .send({
        lessonType: 'SCENARIO',
        wordResults: [
          {
            wordId: 'word_1',
            pronunciationAttemptId: 'attempt_1',
            fillGapCorrect: true,
            attemptCount: 1,
          },
        ],
        comprehensionResponses: [
          {
            questionId: 'q_1',
            response: 'Option A',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(mockCompleteCurrentScenarioSession).toHaveBeenCalledTimes(1);
  });

  it('completion response includes performance and mastery fields', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/learning/paths/path_1/current-scenario-session/complete')
      .send({
        lessonType: 'SCENARIO',
        wordResults: [
          { wordId: 'word_1', pronunciationAttemptId: 'attempt_1', fillGapCorrect: true, attemptCount: 1 },
        ],
        comprehensionResponses: [{ questionId: 'q_1', response: 'Option A' }],
      });

    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data).toMatchObject({
      lessonPassed: expect.any(Boolean),
      wordMasteryLevel: expect.any(Number),
      lessonMastered: expect.any(Boolean),
      performance: expect.objectContaining({
        totalExercises: expect.any(Number),
        passedExercises: expect.any(Number),
        passRate: expect.any(Number),
        breakdown: expect.objectContaining({
          fillGapPassedCount: expect.any(Number),
          pronunciationPassedCount: expect.any(Number),
          comprehensionPassedCount: expect.any(Number),
        }),
        thresholds: expect.objectContaining({
          pronunciationPassThreshold: expect.any(Number),
          unlockThreshold: expect.any(Number),
          wordMasteryThreshold: expect.any(Number),
        }),
      }),
    });
  });

  it('serves V3 lessons map endpoint', async () => {
    const app = createTestApp();

    const response = await request(app).get('/learning/paths/path_1/lessons');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(mockGetLessons).toHaveBeenCalledTimes(1);
  });

  it('serves V3 retake endpoint', async () => {
    const app = createTestApp();

    const response = await request(app).post('/learning/paths/path_1/lessons/lesson_1/retake');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(mockRetakeLesson).toHaveBeenCalledTimes(1);
  });

  it('accepts a fallback client pronunciation score during migration', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/learning/paths/path_1/current-scenario-session/complete')
      .send({
        lessonType: 'SCENARIO',
        wordResults: [
          {
            wordId: 'word_1',
            pronunciationScore: 88,
            fillGapCorrect: true,
            attemptCount: 1,
          },
        ],
        comprehensionResponses: [
          {
            questionId: 'q_1',
            response: 'Option A',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(mockCompleteCurrentScenarioSession).toHaveBeenCalledTimes(1);
  });
});
