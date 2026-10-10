import { describe, expect, it } from 'vitest';
import { parseHumans } from './humans';

const entry = { missionId: 'M1', nickname: 'Ada', finished: true, score: 799.4, timeS: 30.55, damagePct: 2.4, energyUsedPct: 11.8, seed: 1, build: {}, buildName: 'All-rounder', arenaBuild: true, inputs: 14, createdAt: '2026-10-10T03:28:00.676Z' };

describe('parseHumans', () => {
  it('reads the best verified run per mission, in mission order', () => {
    const humans = parseHumans({ verified: 2, rejected: 1, humans: [{ ...entry, missionId: 'M3', nickname: 'Bo', arenaBuild: false, buildName: 'custom', finished: false, score: 120 }, entry] })!;
    expect(humans.verified).toBe(2);
    expect(humans.rejected).toBe(1);
    expect(humans.rows).toEqual([
      { missionId: 'M1', nickname: 'Ada', result: '30.6 s', score: '799 pts', build: 'All-rounder', sameBuild: true },
      { missionId: 'M3', nickname: 'Bo', result: 'DNF', score: '120 pts', build: 'custom', sameBuild: false },
    ]);
  });

  it('skips an entry it cannot read and is null for anything that is not the list', () => {
    expect(parseHumans({ verified: 1, rejected: 0, humans: [entry, { missionId: 'M2' }, 'x'] })!.rows).toHaveLength(1);
    expect(parseHumans({ error: 'nope' })).toBeNull();
    expect(parseHumans(null)).toBeNull();
  });

  it('has no rows when nobody has a verified run yet', () => {
    expect(parseHumans({ verified: 0, rejected: 0, humans: [] })!.rows).toEqual([]);
  });
});
