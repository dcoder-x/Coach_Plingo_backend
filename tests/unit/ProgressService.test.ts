import { ProgressService } from '../../src/services/ProgressService';

describe('ProgressService scoring helpers', () => {
  const service = new ProgressService({} as never);
  const calculateMasteryScore = (
    service as unknown as { calculateMasteryScore: (signals: { usageAccuracy: number; pronunciationAccuracy: number; responseSpeed: number }) => number }
  ).calculateMasteryScore.bind(service);
  const calculateSpeedScore = (
    service as unknown as { calculateSpeedScore: (responseTimeMs: number) => number }
  ).calculateSpeedScore.bind(service);

  it('calculates weighted mastery score', () => {
    expect(
      calculateMasteryScore({
        usageAccuracy: 8,
        pronunciationAccuracy: 6,
        responseSpeed: 10,
      }),
    ).toBe(7.8);
  });

  it('returns perfect speed score for fast answers', () => {
    expect(calculateSpeedScore(900)).toBe(10);
  });

  it('returns zero speed score at or above max response time', () => {
    expect(calculateSpeedScore(30000)).toBe(0);
    expect(calculateSpeedScore(45000)).toBe(0);
  });

  it('returns zero milestone progress when subcategory progress is missing', async () => {
    const prisma = {
      subcategoryProgress: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as never;

    const milestoneService = new ProgressService(prisma);
    const progress = await milestoneService.getMilestoneProgress('path_1', 1);

    expect(progress).toEqual({ progress: 0, masteredWords: 0, targetWords: 0 });
  });

  it('computes milestone 1 progress from active subcategory allocation', async () => {
    const prisma = {
      subcategoryProgress: {
        findMany: jest.fn().mockResolvedValue([{
          wordsCompleted: 25,
          wordsTotal: 100,
        }]),
      },
    } as never;

    const milestoneService = new ProgressService(prisma);
    const progress = await milestoneService.getMilestoneProgress('path_1', 1);

    expect(progress).toEqual({
      progress: 25,
      masteredWords: 25,
      targetWords: 100,
    });
  });

  it('advances milestone only when subcategory target is met', async () => {
    const prisma = {
      learningPath: {
        findUnique: jest.fn().mockResolvedValue({
          currentMilestone: 1,
          currentSubcategoryId: 'sub_1',
        }),
      },
      subcategoryProgress: {
        findMany: jest.fn().mockResolvedValue([{
          wordsCompleted: 100,
          wordsTotal: 100,
        }]),
      },
    } as never;

    const milestoneService = new ProgressService(prisma);
    const advanceToNextMilestone = jest.fn().mockResolvedValue(undefined);
    (milestoneService as unknown as { learningService: { advanceToNextMilestone: (pathId: string) => Promise<void> } }).learningService = {
      advanceToNextMilestone,
    };

    const checkMilestone1Completion = (
      milestoneService as unknown as { checkMilestone1Completion: (pathId: string) => Promise<void> }
    ).checkMilestone1Completion.bind(milestoneService);

    await checkMilestone1Completion('path_1');

    expect(advanceToNextMilestone).toHaveBeenCalledWith('path_1');
  });

  it('does not advance milestone when wordsTotal is zero', async () => {
    const prisma = {
      learningPath: {
        findUnique: jest.fn().mockResolvedValue({
          currentMilestone: 1,
          currentSubcategoryId: 'sub_1',
        }),
      },
      subcategoryProgress: {
        findMany: jest.fn().mockResolvedValue([{
          wordsCompleted: 0,
          wordsTotal: 0,
        }]),
      },
    } as never;

    const milestoneService = new ProgressService(prisma);
    const advanceToNextMilestone = jest.fn().mockResolvedValue(undefined);
    (milestoneService as unknown as { learningService: { advanceToNextMilestone: (pathId: string) => Promise<void> } }).learningService = {
      advanceToNextMilestone,
    };

    const checkMilestone1Completion = (
      milestoneService as unknown as { checkMilestone1Completion: (pathId: string) => Promise<void> }
    ).checkMilestone1Completion.bind(milestoneService);

    await checkMilestone1Completion('path_1');

    expect(advanceToNextMilestone).not.toHaveBeenCalled();
  });
});
