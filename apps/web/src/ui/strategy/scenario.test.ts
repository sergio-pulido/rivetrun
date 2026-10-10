import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { MISSIONS, PRESETS } from '@rivetrun/sim';
import { blindReasons, fixesFor, scenarioSegments, segmentFacts, testRunReport } from './scenario';
import { assessBuild, type BuildAssessment, type SegmentAssessment } from './sim';

const PLAIN: Build = { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: ['camera', 'ultrasonic'], extras: [] };

const segment = (verdict: SegmentAssessment['verdict'], startM: number, extra: Partial<SegmentAssessment> = {}): SegmentAssessment => ({
  segmentIndex: 0,
  startM,
  endM: startM + 10,
  terrain: 'asphalt',
  verdict,
  timeS: 4,
  damagePct: 0,
  missing: [],
  ...extra,
});

const finished = (segments: readonly SegmentAssessment[], extra: Partial<BuildAssessment> = {}): BuildAssessment => ({
  finished: true,
  timeS: 17.05,
  damagePct: 12,
  energyLeftPct: 80,
  score: 700,
  stars: 2,
  segments: [...segments],
  computeMs: 10,
  ...extra,
});

describe('segmentFacts', () => {
  it('names slope, obstacle, depth, feature and current, and nothing on plain ground', () => {
    expect(segmentFacts({ terrain: 'asphalt', lengthM: 10, slopeDeg: 0 })).toEqual([]);
    expect(segmentFacts({ terrain: 'mud', lengthM: 10, slopeDeg: 15, depthCm: 6 })).toEqual(['15° climb', '6 cm deep']);
    expect(segmentFacts({ terrain: 'rock', lengthM: 8, slopeDeg: -4, obstacle: 'rock' })).toEqual(['4° descent', 'rock']);
    expect(segmentFacts({ terrain: 'water', lengthM: 15, slopeDeg: 0, depthCm: 90, currentMps: 0.4 })).toEqual(['90 cm deep', 'current 0.4 m/s']);
    expect(segmentFacts({ terrain: 'grass', lengthM: 8, slopeDeg: 0, feature: { type: 'gap', widthM: 0.9 } })).toEqual(['0.9 m gap']);
    expect(segmentFacts({ terrain: 'grass', lengthM: 8, slopeDeg: 0, feature: { type: 'ramp', launchDeg: 20, lengthM: 2 } })).toEqual(['20° ramp']);
    expect(segmentFacts({ terrain: 'grass', lengthM: 8, slopeDeg: 0, feature: { type: 'drop', heightM: 0.3 } })).toEqual(['0.3 m drop']);
  });
});

describe('scenarioSegments', () => {
  it('lines up each segment with what it demands and how the build does there', () => {
    const rows = scenarioSegments(MISSIONS.M6, PLAIN);
    expect(rows).toHaveLength(MISSIONS.M6.track.segments.length);
    const water = rows[2]!;
    expect(water).toMatchObject({ startM: 20, endM: 35, terrain: 'water', verdict: 'fail' });
    expect(water.facts).toEqual(['5° descent', '60 cm deep']);
    expect(water.demands.map((demand) => [demand.label, demand.met])).toEqual([
      ['Water 60 cm: sealed hull', false],
      ['Swim 60 cm', false],
    ]);
    expect(rows[3]!.verdict).toBe('not_reached');
    expect(rows[0]).toMatchObject({ verdict: 'ok', demands: [] });
  });

  it('gives every mission a row per segment for every preset', () => {
    for (const mission of Object.values(MISSIONS)) {
      for (const preset of Object.values(PRESETS)) expect(scenarioSegments(mission, preset.build)).toHaveLength(mission.track.segments.length);
    }
    // 45 headless runs: seconds on a busy machine, so the default 5 s limit is too tight.
  }, 30_000);
});

describe('testRunReport', () => {
  it('says where a build fails and why', () => {
    const report = testRunReport(assessBuild(PLAIN, MISSIONS.M6)!);
    expect(report.tone).toBe('bad');
    // The exact metre moves with the sim's tuning; that it fails in the first water stretch (20–35 m) does not.
    expect(report.title).toMatch(/^DNF at (2\d|3[0-5]) m$/);
    expect(report.detail).toBe('Flooded in 60 cm of water — no waterproof case');
    expect(report.missing).toEqual(['waterproof', 'thrust']);
  });

  it('says how a finishing build does, and where it takes damage', () => {
    const report = testRunReport(finished([segment('ok', 0), segment('damage', 24, { note: 'Water got in: no sealed hull', missing: ['waterproof'], damagePct: 12 }), segment('ok', 34)]));
    expect(report.tone).toBe('warn');
    expect(report.title).toBe('Finishes in 17.1 s · 2 of 3 stars');
    expect(report.detail).toBe('12% damage · 80% battery left');
    expect(report.trouble).toEqual([{ atM: 24, verdict: 'damage', note: 'Water got in: no sealed hull' }]);
    expect(report.missing).toEqual(['waterproof']);
  });

  it('is clean when nothing went wrong', () => {
    const report = testRunReport(finished([segment('ok', 0, { missing: ['protection'] })], { damagePct: 0, stars: 3 }));
    expect(report).toMatchObject({ tone: 'ok', title: 'Finishes in 17.1 s · 3 of 3 stars', trouble: [], missing: [] });
  });
});

describe('blindReasons', () => {
  const BLIND = { obstacleM: 0, terrainM: 0, waterDepthM: 0, tilt: false };
  const rock = { terrain: 'rock', lengthM: 8, slopeDeg: 0, obstacle: 'rock' } as const;

  it('cites the distance sensor a build lacks where it met an obstacle', () => {
    expect(blindReasons(rock, [], BLIND)).toEqual(['no distance sensor']);
    expect(blindReasons(rock, [], { ...BLIND, obstacleM: 4 })).toEqual([]);
  });

  it('cites the camera and the IMU when the sim says the segment needed them', () => {
    expect(blindReasons({ terrain: 'mud', lengthM: 10, slopeDeg: 15 }, ['traction:mud', 'sense_tilt', 'lookahead_terrain'], BLIND)).toEqual(['no camera to read the ground ahead', 'no IMU to feel the slope']);
  });

  it('puts the missing sensor on the line of a test run', () => {
    const blind: Build = { ...PLAIN, sensors: [] };
    const report = testRunReport(finished([segment('damage', 22, { segmentIndex: 0, note: 'Hit the rock at 2 m/s' })]), { segments: [rock], senses: BLIND });
    expect(report.trouble).toEqual([{ atM: 22, verdict: 'damage', note: 'Hit the rock at 2 m/s: no distance sensor' }]);
    const real = testRunReport(assessBuild(blind, MISSIONS.M1)!, { segments: MISSIONS.M1.track.segments, senses: BLIND });
    expect(real.trouble.map((entry) => entry.note.replace(/at [\d.]+ m\/s/, 'at speed'))).toEqual(['Hit the step at speed: no distance sensor']);
  });

  it('adds the distance sensor to a DNF on an obstacle, and leaves a reason the sim gave alone', () => {
    const dnf = (why: string) => ({ ...finished([segment('fail', 20, { segmentIndex: 0 })]), finished: false, dnf: { reason: 'stuck' as const, atM: 22, why, missing: [] } });
    expect(testRunReport(dnf('Stopped by the rock'), { segments: [rock], senses: BLIND }).detail).toBe('Stopped by the rock: no distance sensor');
    expect(testRunReport(dnf('Stopped by the rock'), { segments: [rock], senses: { ...BLIND, obstacleM: 3 } }).detail).toBe('Stopped by the rock');
    expect(testRunReport(dnf('Wrecked: slammed onto rock at 2.2 m/s — no scout drone to see it in time'), { segments: [rock], senses: BLIND }).detail).toBe('Wrecked: slammed onto rock at 2.2 m/s — no scout drone to see it in time');
    expect(testRunReport(finished([segment('damage', 24, { segmentIndex: 0, note: 'Water got in: no sealed hull' })]), { segments: [rock], senses: BLIND }).trouble[0]!.note).toBe('Water got in: no sealed hull');
  });

  it('does not repeat a sensor the sim already named', () => {
    const report = testRunReport(
      { ...finished([segment('fail', 10, { segmentIndex: 0, missing: ['sense_tilt'] })]), finished: false, dnf: { reason: 'stuck', atM: 11.6, why: 'Stuck on a 15° mud slope — no IMU to feel the tilt', missing: ['sense_tilt'] } },
      { segments: [{ terrain: 'mud', lengthM: 10, slopeDeg: 15 }], senses: BLIND },
    );
    expect(report.detail).toBe('Stuck on a 15° mud slope — no IMU to feel the tilt');
  });
});

describe('fixesFor', () => {
  const providers = (capability: string): readonly string[] => ({ waterproof: ['waterproof_case'], thrust: ['thruster_kit'], 'traction:mud': ['tracks', 'offroad_wheels'], jump: ['piston_jump'] })[capability] ?? [];

  it('lists, per missing capability, the parts that provide it and are not fitted', () => {
    expect(fixesFor(['waterproof', 'thrust'], PLAIN, providers)).toEqual([
      { capability: 'waterproof', name: 'sealed hull', partIds: ['waterproof_case'] },
      { capability: 'thrust', name: 'thrust to swim', partIds: ['thruster_kit'] },
    ]);
  });

  it('lists a part that helps with two capabilities once, where it is the best answer', () => {
    const overlapping = (capability: string): readonly string[] => (capability === 'waterproof' ? ['waterproof_case', 'thruster_kit'] : providers(capability));
    expect(fixesFor(['waterproof', 'thrust'], PLAIN, overlapping).map((fix) => fix.partIds)).toEqual([['waterproof_case'], ['thruster_kit']]);
  });

  it('skips what is already fitted and capabilities no part provides', () => {
    const sealed: Build = { ...PLAIN, locomotion: 'tracks', extras: ['waterproof_case'] };
    expect(fixesFor(['waterproof', 'traction:mud', 'protection'], sealed, providers)).toEqual([{ capability: 'traction:mud', name: 'grip on mud', partIds: ['offroad_wheels'] }]);
  });
});
