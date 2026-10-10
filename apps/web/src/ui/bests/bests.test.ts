import { describe, expect, it } from 'vitest';
import type { PersonalBest } from '@/state/personalBests';
import { bestLine, newBestLine } from './bests';

const best = (extra: Partial<PersonalBest> = {}): PersonalBest => ({ missionId: 'M1', buildKey: 'k', buildName: 'All-rounder', timeS: 43.64, score: 720, stars: 2, runs: 3, at: '2026-10-10T03:00:00.000Z', ...extra });

describe('bestLine', () => {
  it('states the best time, score and how many runs it took', () => {
    expect(bestLine(best())).toBe('43.6 s · 720 pts · 3 runs');
    expect(bestLine(best({ runs: 1 }))).toBe('43.6 s · 720 pts · 1 run');
  });

  it('says so when no run has finished yet', () => {
    expect(bestLine(best({ timeS: null, score: null, runs: 2 }))).toBe('No finish yet · 2 runs');
  });
});

describe('newBestLine', () => {
  const outcome = { finished: true, timeS: 41.2, score: 760 };

  it('celebrates a first finish', () => {
    expect(newBestLine(outcome, { improved: true, previous: null })).toEqual({ fresh: true, text: 'First finish with this robot: your time to beat.' });
  });

  it('says by how much a new best beats the old one, in the figures shown', () => {
    expect(newBestLine(outcome, { improved: true, previous: best() })).toEqual({ fresh: true, text: '2.4 s faster and 40 pts more than your best with this robot.' });
    expect(newBestLine({ ...outcome, timeS: 44.0 }, { improved: true, previous: best() })).toEqual({ fresh: true, text: '40 pts more than your best with this robot (0.4 s slower).' });
  });

  it('shows the best to beat when the run did not beat it', () => {
    expect(newBestLine({ finished: true, timeS: 46, score: 650 }, { improved: false, previous: best() })).toEqual({ fresh: false, text: 'Your best with this robot: 43.6 s · 720 pts. This run: 2.4 s slower.' });
    expect(newBestLine({ finished: false, timeS: 20, score: 100 }, { improved: false, previous: best() })).toEqual({ fresh: false, text: 'Your best with this robot: 43.6 s · 720 pts.' });
  });

  it('has nothing to say about a first run that did not finish, or a result screen shown twice', () => {
    expect(newBestLine({ finished: false, timeS: 20, score: 100 }, { improved: false, previous: null })).toBeNull();
    expect(newBestLine(outcome, { improved: false, previous: null, repeat: true })).toBeNull();
  });
});
