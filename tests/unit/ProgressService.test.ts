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
});
