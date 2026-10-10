import { describe, expect, it } from 'vitest';
import type { Episode, Outcome } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { shareCardData } from './shareCard';
import { shareText } from './share';

const outcome = (patch: Partial<Outcome> = {}): Outcome => ({ finished: true, timeS: 43.64, damagePct: 5, energyUsedPct: 20, costEur: 205, score: 720, progressFraction: 1, stars: 2, ...patch });
const episode = (patch: Partial<Outcome> = {}, policy: Episode['policy'] = 'human'): Episode =>
  ({ id: 'M1-x', missionId: 'M1', seed: 1, policy, build: PRESETS.all_rounder.build, environment: { weather: 'clear', frictionJitter: 1, sensorNoiseSeed: 1 }, priority: 0.5, decisions: [], outcome: outcome(patch) }) as Episode;

describe('shareCardData', () => {
  it('puts your time against Jev and says who won', () => {
    const card = shareCardData(episode(), [{ policy: 'jev', outcome: outcome({ timeS: 41.2, score: 760 }) }]);
    expect(card).toMatchObject({ mission: 'M1 · Garage Test', you: '43.6 s', rivalName: 'JEV', rival: '41.2 s', verdict: 'Jev wins by 2.4 s', stars: 2, robot: 'All-rounder', score: '720 pts' });
  });

  it('shows a DNF as how far the robot got', () => {
    const card = shareCardData(episode({ finished: false, progressFraction: 0.62, stars: 0, score: 310 }), [{ policy: 'jev', outcome: outcome({ timeS: 41.2 }) }]);
    expect(card).toMatchObject({ you: 'DNF · 62%', rival: '41.2 s', verdict: 'Jev finished. You did not' });
  });

  it('names your own ghost as your best run', () => {
    const card = shareCardData(episode({ timeS: 40 }), [{ policy: 'human', outcome: outcome({ timeS: 43.6 }) }]);
    expect(card).toMatchObject({ rivalName: 'YOUR BEST', rival: '43.6 s', verdict: 'You beat your best run by 3.6 s' });
  });

  it('ends on the line of the Home screen for who drove', () => {
    expect(shareCardData(episode(), [{ policy: 'jev', outcome: outcome({ timeS: 41.2 }) }]).tagline).toBe('Build the body. Brief the brain. Then race it.');
    expect(shareCardData(episode({}, 'jev'), []).tagline).toBe('Build the body. Brief the brain. Watch it drive.');
  });

  it('has no rival side when Jev drove your robot', () => {
    const card = shareCardData(episode({}, 'jev'), [{ policy: 'heuristic', outcome: outcome({ timeS: 50 }) }]);
    expect(card).toMatchObject({ rivalName: null, rival: null, verdict: 'Jev drove my robot' });
  });
});

describe('shareText', () => {
  it('adds the time against Jev when there is one to compare', () => {
    expect(shareText(episode(), [{ policy: 'jev', outcome: outcome({ timeS: 41.2 }) }])).toContain('43.6 s vs Jev 41.2 s');
    expect(shareText(episode())).not.toContain('vs Jev');
    // The last sentence says who drove.
    expect(shareText(episode())).toMatch(/I built the body and raced the AI\.$/);
    expect(shareText(episode({}, 'jev'))).toMatch(/I built the body, the AI drove it\.$/);
  });
});
