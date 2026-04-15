import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler';

const mockLessonHandle = jest.fn();
const mockStoryHandle = jest.fn();
const mockExercisesHandle = jest.fn();

jest.mock('../../src/jobs/handlers/GenerateLessonHandler', () => ({
  GenerateLessonHandler: jest.fn().mockImplementation(() => ({
    handle: mockLessonHandle,
  })),
}));

jest.mock('../../src/jobs/handlers/GenerateStoryHandler', () => ({
  GenerateStoryHandler: jest.fn().mockImplementation(() => ({
    handle: mockStoryHandle,
  })),
}));

jest.mock('../../src/jobs/handlers/GenerateExercisesHandler', () => ({
  GenerateExercisesHandler: jest.fn().mockImplementation(() => ({
    handle: mockExercisesHandle,
  })),
}));

import jobsRouter from '../../src/routes/jobs';

describe('jobs route validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLessonHandle.mockResolvedValue({ ok: true });
    mockStoryHandle.mockResolvedValue({ ok: true });
    mockExercisesHandle.mockResolvedValue({ ok: true });
  });

  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/jobs', jobsRouter);
    app.use(errorHandler);

    return app;
  }

  it('rejects lesson payload missing currentSubcategoryId', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/jobs/generate-lesson')
      .send({
        jobId: 'job_1',
        payload: {
          learningPathId: 'path_1',
          learnerId: 'learner_1',
          language: 'es',
          profession: 'healthcare',
          currentSubcategoryName: 'Nursing',
          subcategories: [
            {
              id: 'sub_1',
              name: 'Nursing',
              wordAllocation: 100,
              position: 1,
            },
          ],
          wordsPerLesson: 20,
          globalSetId: 'set_1',
          milestoneId: 'mile_1',
          baseLanguage: 'en',
          excludeWords: [],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Validation failed',
      }),
    );
    expect(mockLessonHandle).not.toHaveBeenCalled();
  });

  it('rejects lesson payload with empty subcategories list', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/jobs/generate-lesson')
      .send({
        jobId: 'job_2',
        payload: {
          learningPathId: 'path_1',
          learnerId: 'learner_1',
          language: 'es',
          profession: 'healthcare',
          currentSubcategoryId: 'sub_1',
          currentSubcategoryName: 'Nursing',
          subcategories: [],
          wordsPerLesson: 20,
          globalSetId: 'set_1',
          milestoneId: 'mile_1',
          baseLanguage: 'en',
          excludeWords: [],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mockLessonHandle).not.toHaveBeenCalled();
  });

  it('accepts lesson payload when required subcategory fields are present', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/jobs/generate-lesson')
      .send({
        jobId: 'job_3',
        payload: {
          learningPathId: 'path_1',
          learnerId: 'learner_1',
          language: 'es',
          profession: 'healthcare',
          currentSubcategoryId: 'sub_1',
          currentSubcategoryName: 'Nursing',
          currentSubcategoryDescription: 'Patient care',
          subcategories: [
            {
              id: 'sub_1',
              name: 'Nursing',
              description: 'Patient care',
              wordAllocation: 100,
              position: 1,
            },
          ],
          wordsPerLesson: 20,
          globalSetId: 'set_1',
          milestoneId: 'mile_1',
          baseLanguage: 'en',
          excludeWords: [],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(mockLessonHandle).toHaveBeenCalledTimes(1);
  });
});
