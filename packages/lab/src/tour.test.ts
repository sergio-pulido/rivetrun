import { describe, expect, it } from 'vitest';
import { bestTour, type TourJob } from './tour';

// Places on a line: the distance between two is how far apart they are.
const line = (from: number, to: number): number => Math.abs(from - to);
const job = (id: string, from: number, to = from): TourJob => ({ id, from, to });

describe('the order of the jobs', () => {
  it('with nothing to do, the tour is the way to the end point, or nothing', () => {
    expect(bestTour(3, [], 0, undefined, line)).toBe(0);
    expect(bestTour(3, [], 0, 10, line)).toBe(7);
    expect(bestTour(3, [job('a', 5)], 0, 10, line)).toBe(7);
  });

  it('tries every order and keeps the shortest', () => {
    // From 0: the far job first (to 10, back to 0, then 1 and 2) is 22 tiles; the near one first is 20.
    const jobs = [job('far', 10, 0), job('near', 1, 2)];
    expect(bestTour(0, jobs, 2, undefined, line)).toBe(20);
    // Nearest first is not always shortest: with the end point at 20 the far job should come last.
    expect(bestTour(0, [job('a', 1, 0), job('b', 18, 19)], 2, 20, line)).toBe(1 + 1 + 18 + 1 + 1);
  });

  it('picks which jobs to do when only some are needed', () => {
    const jobs = [job('a', 2), job('b', 50), job('c', 4), job('d', 60)];
    expect(bestTour(0, jobs, 2, 0, line)).toBe(8);
    expect(bestTour(0, jobs, 3, 0, line)).toBe(100);
  });

  it('falls back to nearest-first beyond seven jobs, and still returns a way through all of them', () => {
    const many = Array.from({ length: 9 }, (_, i) => job(`j${i}`, (i + 1) * 2));
    expect(bestTour(0, many, 9, undefined, line)).toBe(18);
  });
});
