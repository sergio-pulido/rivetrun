import { describe, expect, it } from 'vitest';
import { formatSeconds } from './format';

/** The Result headline counts up in tenths and then prints them; it has to land on formatSeconds. */
const headline = (timeS: number): string => (Math.round(Number(formatSeconds(timeS)) * 10) / 10).toFixed(1);

describe('formatSeconds', () => {
  it('gives the headline, the Brain Duel row and the breakdown the same figure at a .x5 boundary', () => {
    // 43.65 is stored as 43.649999…: rounding the tenths separately used to show 43.7 beside 43.6.
    for (const timeS of [43.65, 14.55, 20.05, 79.95, 0.05, 27.4, 100]) {
      expect(headline(timeS), `${timeS}`).toBe(formatSeconds(timeS));
    }
  });
});
