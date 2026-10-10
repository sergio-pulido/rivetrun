import { beforeEach, describe, expect, it } from 'vitest';
import type { Episode } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { bestFor, bestOnMission, buildKey, usePersonalBestsStore } from './personalBests';

const store = () => usePersonalBestsStore.getState();
const { all_rounder, speedster } = PRESETS;

let serial = 0;
const run = (overrides: { missionId?: Episode['missionId']; build?: Episode['build']; finished?: boolean; timeS?: number; score?: number; stars?: number; id?: string } = {}): Episode =>
  ({
    id: overrides.id ?? `run-${(serial += 1)}`,
    missionId: overrides.missionId ?? 'M1',
    seed: 1,
    policy: 'human',
    build: overrides.build ?? all_rounder.build,
    environment: { weather: 'clear', frictionJitter: 1, sensorNoiseSeed: 1 },
    priority: 0.5,
    decisions: [],
    outcome: { finished: overrides.finished ?? true, timeS: overrides.timeS ?? 40, damagePct: 5, energyUsedPct: 20, costEur: 200, score: overrides.score ?? 700, progressFraction: 1, stars: overrides.stars ?? 2 },
  }) as Episode;

beforeEach(() => usePersonalBestsStore.setState({ bests: [], seen: [] }));

describe('buildKey', () => {
  it('is the same for the same robot whatever the order its sensors were fitted in', () => {
    const build = all_rounder.build;
    expect(buildKey({ ...build, sensors: [...build.sensors].reverse() })).toBe(buildKey(build));
    expect(buildKey(speedster.build)).not.toBe(buildKey(build));
  });

  it('tells two tunings of one robot apart, and reads the old large wheel as today\'s', () => {
    const build = all_rounder.build;
    expect(buildKey({ ...build, gearStep: 5 })).not.toBe(buildKey({ ...build, gearStep: 1 }));
    expect(buildKey({ ...build, wheelSizeMm: 100 })).toBe(buildKey({ ...build, wheelSizeMm: 90 }));
  });
});

describe('personal bests', () => {
  it('keeps the first finished run as the best and says there was none before', () => {
    expect(store().record(run({ timeS: 44, score: 690 }), 'All-rounder')).toEqual({ improved: true, previous: null });
    expect(bestFor(store().bests, 'M1', all_rounder.build)).toMatchObject({ timeS: 44, score: 690, runs: 1, buildName: 'All-rounder' });
  });

  it('replaces it only with a better score, counts every run, and hands back what it beat', () => {
    store().record(run({ timeS: 44, score: 690 }), 'All-rounder');
    const worse = store().record(run({ timeS: 47, score: 650 }), 'All-rounder');
    expect(worse.improved).toBe(false);
    expect(worse.previous).toMatchObject({ timeS: 44 });
    const better = store().record(run({ timeS: 41, score: 730, stars: 3 }), 'All-rounder');
    expect(better).toMatchObject({ improved: true, previous: { timeS: 44, score: 690 } });
    expect(bestFor(store().bests, 'M1', all_rounder.build)).toMatchObject({ timeS: 41, score: 730, stars: 3, runs: 3 });
  });

  it('on equal score the faster run is the best', () => {
    store().record(run({ timeS: 44, score: 700 }), 'All-rounder');
    expect(store().record(run({ timeS: 43, score: 700 }), 'All-rounder').improved).toBe(true);
  });

  it('never lets a run that did not finish be a best, but counts it', () => {
    expect(store().record(run({ finished: false, score: 900 }), 'All-rounder').improved).toBe(false);
    expect(bestFor(store().bests, 'M1', all_rounder.build)).toMatchObject({ timeS: null, runs: 1 });
    store().record(run({ timeS: 50, score: 500 }), 'All-rounder');
    expect(bestFor(store().bests, 'M1', all_rounder.build)).toMatchObject({ timeS: 50, score: 500, runs: 2 });
  });

  it('keeps bests apart per mission and per build, and finds the best build on a mission', () => {
    store().record(run({ timeS: 44, score: 690 }), 'All-rounder');
    store().record(run({ build: speedster.build, timeS: 38, score: 760 }), 'Speedster');
    store().record(run({ missionId: 'M2', timeS: 60, score: 400 }), 'All-rounder');
    expect(bestFor(store().bests, 'M1', all_rounder.build)?.score).toBe(690);
    expect(bestOnMission(store().bests, 'M1')).toMatchObject({ buildName: 'Speedster', score: 760 });
    expect(bestOnMission(store().bests, 'M3')).toBeNull();
  });

  it('records an episode once, however often the result screen mounts', () => {
    const episode = run({ id: 'same', timeS: 44, score: 690 });
    store().record(episode, 'All-rounder');
    expect(store().record(episode, 'All-rounder')).toEqual({ improved: false, previous: null, repeat: true });
    expect(bestFor(store().bests, 'M1', all_rounder.build)?.runs).toBe(1);
  });
});
