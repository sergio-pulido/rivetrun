import { describe, expect, it } from 'vitest';
import { fuzz } from './fuzz';

describe('fuzz: random builds and random inputs never break the sim', () => {
  it('500 runs across M1–M9: no NaN, battery and damage within 0–100, never past the finish, every run ends, no exception', () => {
    const result = fuzz(20261010, 500);
    expect(result.violations).toEqual([]);
    // Sanity: the fuzz is not just 500 robots standing still.
    expect(result.finished).toBeGreaterThan(20);
  }, 10000);
});
