import { describe, expect, it } from 'vitest';
import type { Outcome } from '@rivetrun/contracts';
import { driveVerdict } from './DuelTable';

const outcome = (patch: Partial<Outcome>): Outcome => ({
  finished: true,
  timeS: 30,
  damagePct: 0,
  energyUsedPct: 10,
  costEur: 205,
  score: 800,
  progressFraction: 1,
  stars: 2,
  ...patch,
});

describe('driveVerdict', () => {
  it('names the winner and the margin on the clock', () => {
    expect(driveVerdict(outcome({ timeS: 27.4 }), outcome({ timeS: 29.7 }), 'jev')).toBe('You beat Jev by 2.3 s');
    expect(driveVerdict(outcome({ timeS: 28.5 }), outcome({ timeS: 27.4 }), 'jev')).toBe('Jev wins by 1.1 s');
  });

  it('uses the times as displayed, so the margin never disagrees with the table', () => {
    // 43.65 shows as 43.6 and 43.7 as 43.7: the margin shown is 0.1, not 0.0.
    expect(driveVerdict(outcome({ timeS: 43.65 }), outcome({ timeS: 43.7 }), 'jev')).toBe('You beat Jev by 0.1 s');
    expect(driveVerdict(outcome({ timeS: 30.04 }), outcome({ timeS: 30.01 }), 'jev')).toBe('A dead heat with Jev');
  });

  it('handles a DNF on either side, or both', () => {
    const dnf = (progressFraction: number): Outcome => outcome({ finished: false, progressFraction, score: 50, stars: 0 });
    expect(driveVerdict(outcome({}), dnf(0.4), 'jev')).toBe('You finished. Jev did not');
    expect(driveVerdict(dnf(0.4), outcome({}), 'jev')).toBe('Jev finished. You did not');
    expect(driveVerdict(dnf(0.62), dnf(0.48), 'jev')).toBe('Neither finished, but you got further: 62 % to 48 %');
    expect(driveVerdict(dnf(0.3), dnf(0.48), 'jev')).toBe('Neither finished, and Jev got further: 48 % to 30 %');
  });

  it('names the heuristic when it stood in for Jev', () => {
    expect(driveVerdict(outcome({ timeS: 20 }), outcome({ timeS: 25 }), 'heuristic')).toBe('You beat HEURISTIC by 5.0 s');
  });

  it('speaks of your best run when the ghost is your own', () => {
    expect(driveVerdict(outcome({ timeS: 27.4 }), outcome({ timeS: 29.7 }), 'human')).toBe('You beat your best run by 2.3 s');
    expect(driveVerdict(outcome({ timeS: 30.2 }), outcome({ timeS: 29.7 }), 'human')).toBe('Your best run wins by 0.5 s');
    expect(driveVerdict(outcome({ finished: false, progressFraction: 0.4 }), outcome({ timeS: 29.7 }), 'human')).toBe('Your best run finished. You did not');
  });
});
