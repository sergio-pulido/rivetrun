import { describe, expect, it } from 'vitest';
import { readAudience, versusLine } from './proof';

describe('live proof', () => {
  it('reads the figures the big screen reads', () => {
    expect(readAudience({ verified: 14, rejected: 1, vsJev: { runs: 11, humanWins: 3 }, board: [] })).toEqual({ verified: 14, vsJev: { runs: 11, humanWins: 3 } });
  });

  it('shows nothing for an answer in another shape', () => {
    expect(readAudience({ verified: '14' })).toBeNull();
    expect(readAudience(null)).toBeNull();
  });

  it('words the runs against Jev as the big screen does', () => {
    expect(versusLine({ verified: 14, vsJev: { runs: 11, humanWins: 3 } })).toBe('Humans beat Jev 3 of 11 runs');
    expect(versusLine({ verified: 1, vsJev: { runs: 1, humanWins: 0 } })).toBe('Humans beat Jev 0 of 1 run');
    expect(versusLine({ verified: 0, vsJev: { runs: 0, humanWins: 0 } })).toBe('No run against Jev yet. Be the first.');
  });
});
