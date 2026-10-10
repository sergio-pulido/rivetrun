import { describe, expect, it } from 'vitest';
import type { Brain, Build, Mission, RunEvent } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, createRun, driveController, driveSeed, heuristicBrain, heuristicDecide, observe, runController, runHeadless, senses, step, buildQuestion, START_TRIGGER } from './index';

const blind: Build = { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: [], extras: [] };
const withImu: Build = { ...blind, sensors: ['imu'] };
const sighted: Build = { ...blind, sensors: ['camera', 'ultrasonic'], extras: ['bumper'] };

const strip = (lengthM: number): Mission => ({
  id: 'M1', name: 'Uniform strip', description: '', weather: 'clear', starThreshold: 0, leaderboard: false, fixedSeed: 5,
  track: { segments: [{ terrain: 'asphalt', lengthM, slopeDeg: 0 }] },
});
const rockAhead: Mission = {
  ...strip(40),
  track: { segments: [{ terrain: 'asphalt', lengthM: 20, slopeDeg: 0 }, { terrain: 'asphalt', lengthM: 20, slopeDeg: 0, obstacle: 'rock' }] },
};

/** The heuristic, answering after a fixed delay. */
const slowBrain = (latencyMs: number): Brain => ({ decide: async (question) => ({ ...heuristicDecide(question), latencyMs }) });

describe('Brain v3: the brain knows only what its sensors report', () => {
  it('a blind build is told nothing about the track ahead, and hits the rock', async () => {
    const start = observe(createRun({ mission: rockAhead, seed: 1, build: blind, priority: 0.5 }));
    expect(start.sources).toEqual(['core']);
    expect(start.blind).toBe(true);
    expect([start.hazard, start.gap, start.terrainAhead, start.tiltDeg, start.slipPct, start.waterDepthCm, start.lastContact]).toEqual(Array(7).fill('unknown'));
    expect(senses(blind).cannot.join(' ')).toMatch(/no forward sensor/);

    const { episode } = await runHeadless(rockAhead, 1, blind, heuristicBrain);
    // No decision ever mentions the rock before contact: every one was asked with the hazard unknown.
    expect(episode.decisions.every((d) => d.log?.trigger.cause !== 'hazard_seen' && d.log?.trigger.cause !== 'hazard_reached')).toBe(true);
    expect(episode.outcome.damagePct).toBeGreaterThan(5);
    expect(episode.outcome.why).toMatch(/Hit the rock at 2 m\/s/);

    // The same robot with eyes slows down for it.
    const seen = await runHeadless(rockAhead, 1, sighted, heuristicBrain);
    expect(seen.episode.decisions.some((d) => d.log?.trigger.cause === 'hazard_seen')).toBe(true);
    expect(seen.episode.outcome.damagePct).toBeLessThan(episode.outcome.damagePct / 2);
  });

  it('the blind hit is reported as BLIND on the event stream', async () => {
    const events: RunEvent[] = [];
    const controller = runController({ mission: rockAhead, seed: 1, build: blind, priority: 0.5 }, heuristicBrain, { onEvent: (e) => events.push(e), timeScale: 60 });
    await controller.start();
    const hit = events.find((e) => e.type === 'damage' && e.obstacle === 'rock');
    expect(hit && hit.type === 'damage' && hit.blind).toBe(true);
    expect(hit && hit.type === 'damage' && hit.label).toMatch(/^BLIND · hit rock at \d+ m: no distance sensor$/);
  }, 20000);

  it('a build without an IMU never reports slip or tilt; one with an IMU does', async () => {
    // Ice slope and mud: plenty of real slip.
    for (const mission of [MISSIONS.M3, MISSIONS.M4]) {
      const { episode } = await runHeadless(mission, 1, sighted, heuristicBrain);
      expect(episode.decisions.length).toBeGreaterThan(3);
      for (const decision of episode.decisions) {
        expect(decision.log?.trigger.cause.startsWith('slip')).toBe(false);
        expect(decision.log?.trigger.cause.startsWith('tilt')).toBe(false);
        expect(decision.log?.knew.join(' ')).not.toMatch(/slip|tilt/i);
      }
    }
    let state = createRun({ mission: MISSIONS.M3, seed: 1, build: sighted, priority: 0.5 });
    for (let i = 0; i < 400 && !state.done; i += 1) {
      state = step(state, 'accelerate');
      const seen = observe(state);
      expect([seen.slipPct, seen.slipping, seen.tiltDeg]).toEqual(['unknown', 'unknown', 'unknown']);
    }
    const felt = await runHeadless(MISSIONS.M3, 1, withImu, heuristicBrain);
    expect(felt.episode.decisions.some((d) => d.log?.trigger.source === 'imu')).toBe(true);
  });
});

describe('Brain v3: the brain decides when something changes', () => {
  it('asks once on a long uniform segment: there is no clock', async () => {
    const { episode } = await runHeadless(strip(100), 1, PRESETS.all_rounder.build, heuristicBrain);
    expect(episode.outcome.finished).toBe(true);
    expect(episode.outcome.timeS).toBeGreaterThan(40);
    expect(episode.decisions.map((d) => d.log?.trigger.cause)).toEqual(['start']);
  });

  it('holds the last command while a slow brain thinks, and the wait costs distance', async () => {
    const quick = await runHeadless(rockAhead, 1, sighted, slowBrain(0));
    const slow = await runHeadless(rockAhead, 1, sighted, slowBrain(900));
    const seenQuick = quick.episode.decisions.find((d) => d.log?.trigger.cause === 'hazard_seen')!.log!;
    const seenSlow = slow.episode.decisions.find((d) => d.log?.trigger.cause === 'hazard_seen')!.log!;
    expect(seenQuick.lostM).toBe(0);
    expect(seenSlow.appliedT - seenSlow.t).toBeCloseTo(0.9, 5);
    expect(seenSlow.lostM).toBeGreaterThan(1);
    expect(seenSlow.chip).toMatch(/· 900 ms$/);
    expect(slow.episode.outcome).not.toEqual(quick.episode.outcome);
  });

  it('is deterministic: the same seed and the same latencies give the same run', async () => {
    for (const mission of [MISSIONS.M4, MISSIONS.M7]) {
      const a = await runHeadless(mission, 9, PRESETS.all_rounder.build, slowBrain(350));
      const b = await runHeadless(mission, 9, PRESETS.all_rounder.build, slowBrain(350));
      expect(a.ghost).toEqual(b.ghost);
      expect(a.episode.decisions).toEqual(b.episode.decisions);
    }
  });

  it('every decision carries its log: trigger, what the brain knew, options, choice and latency', async () => {
    const { episode } = await runHeadless(MISSIONS.M5, 1, PRESETS.all_rounder.build, heuristicBrain);
    for (const decision of episode.decisions) {
      const log = decision.log!;
      expect(log.trigger.label.length).toBeGreaterThan(3);
      expect(log.knew[0]).toMatch(/^CORE · /);
      expect(log.options.map((o) => o.action)).toContain(log.choice);
      expect(log.options.every((o) => o.projectedFinishPct !== undefined)).toBe(true);
      expect(log.chip).toContain(' → ');
    }
    expect(new Set(episode.decisions.map((d) => d.log!.trigger.kind)).size).toBeGreaterThan(1);
  });
});

describe('Telemetry console and Brain Arena', () => {
  it('Drive mode: observations at 5 Hz with the control in force, an input log, and reactions paired by event id with the ghost', async () => {
    const mission = MISSIONS.M1;
    const events: RunEvent[] = [];
    // The player holds full throttle, then lifts off for good at 4 s of sim time.
    let simT = 0;
    const controller = driveController(
      { mission, seed: driveSeed(mission), build: PRESETS.all_rounder.build, priority: 0.5 },
      () => ({ throttle: simT < 4 ? 1 : 0.6, brake: 0 }),
      { onEvent: (event) => { if (event.type === 'frame') simT = event.state.t; events.push(event); }, timeScale: 60 },
    );
    const episode = await controller.start();
    const seen = events.filter((e) => e.type === 'observation');
    expect(seen.length).toBeGreaterThan(20);
    expect(seen.every((e) => e.type === 'observation' && e.control !== undefined && e.observation.sources.includes('camera'))).toBe(true);

    const breakdown = episode.outcome.breakdown!;
    expect(breakdown.inputLog!.map((entry) => entry.action).slice(0, 2)).toEqual(['accelerate', 'cruise']);
    expect(breakdown.inputLog![1]!.t).toBeGreaterThanOrEqual(4);
    const reactions = breakdown.reactions!;
    expect(reactions.length).toBeGreaterThan(2);
    expect(reactions.every((r) => typeof r.id === 'string' && (r.humanS === null || r.humanS <= 3))).toBe(true);

    // The ghost on the same build and seed meets the same events under the same ids.
    const { ghost } = await runHeadless(mission, driveSeed(mission), PRESETS.all_rounder.build, heuristicBrain);
    const ghostIds = new Set(ghost.log!.map((entry) => entry.trigger.eventId).filter(Boolean));
    const seenIds = reactions.filter((r) => r.cause.endsWith('_seen')).map((r) => r.id!);
    expect(seenIds.length).toBeGreaterThan(1);
    for (const id of seenIds) expect(ghostIds.has(id), id).toBe(true);
    expect(seenIds).toContain('hazard_seen:0:camera');
  }, 20000);

  it('no-fallback mode: a brain that fails gives no decision, the command holds, and the miss is counted', async () => {
    let calls = 0;
    // Answers the start, then fails every time.
    const flaky: Brain = { decide: async (question) => { calls += 1; if (calls > 1) throw new Error('down'); return { ...heuristicDecide(question), selected: 'cruise' }; } };
    const strict = await runHeadless(MISSIONS.M1, 1, PRESETS.all_rounder.build, flaky, { noFallback: true });
    expect(strict.episode.decisions).toHaveLength(1);
    expect(strict.missedDecisions).toBe(calls - 1);
    expect(strict.missedDecisions).toBeGreaterThan(2);
    expect(strict.episode.decisions.every((d) => !d.fallback)).toBe(true);

    calls = 0;
    const lenient = await runHeadless(MISSIONS.M1, 1, PRESETS.all_rounder.build, flaky);
    expect(lenient.missedDecisions).toBe(0);
    expect(lenient.episode.decisions.filter((d) => d.fallback).length).toBeGreaterThan(2);
  });
});

describe('Brain v3: a change of ground seen from far is told again close up', () => {
  it('the camera build is asked again about 2 m before the rock field, and no longer slams onto it on M4', async () => {
    const { episode } = await runHeadless(MISSIONS.M4, 7, PRESETS.all_rounder.build, heuristicBrain);
    const told = episode.decisions.map((d) => d.log?.trigger).filter((trigger) => trigger?.cause === 'terrain_seen');
    const near = told.filter((trigger) => trigger?.eventId?.includes(':near'));
    expect(near.length).toBeGreaterThan(1);
    expect(near.every((trigger) => / now \d/.test(trigger!.label))).toBe(true);
    // Each near telling follows a far one for the same segment.
    for (const trigger of near) expect(told.some((far) => far!.eventId === trigger!.eventId!.replace(':near', ''))).toBe(true);
    expect(episode.outcome.finished).toBe(true);
    expect(episode.outcome.damagePct).toBeLessThan(10);
  });
});

describe('heuristic: more sight must not mean more damage (M4)', () => {
  const meanDamage = async (mission: typeof MISSIONS.M4, build: typeof PRESETS.all_rounder.build): Promise<number> => {
    const seeds = [1, 2, 3, 4, 5, 7];
    const runs = await Promise.all(seeds.map((seed) => runHeadless(mission, seed, build, heuristicBrain)));
    return runs.reduce((sum, run) => sum + run.episode.outcome.damagePct, 0) / seeds.length;
  };
  const foggy = { ...MISSIONS.M4, conditions: { visibility: 'fog' as const } };

  it('the All-rounder and the Speedster take no more damage in clear air than in fog', async () => {
    for (const build of [PRESETS.all_rounder.build, PRESETS.speedster.build]) {
      expect(await meanDamage(MISSIONS.M4, build)).toBeLessThanOrEqual(await meanDamage(foggy, build));
    }
    // It used to be 44 % for the All-rounder: seen from 6 m, decided once, never asked again.
    expect(await meanDamage(MISSIONS.M4, PRESETS.all_rounder.build)).toBeLessThan(5);
  }, 30000);
});

describe('facts, no verdict: what each option does about a scan zone and a hazard (OVN-SIM-24)', () => {
  const at = (xM: number, cruise: 'accelerate' | 'slow_down' = 'accelerate') => {
    let state = createRun({ mission: MISSIONS.M1, seed: 7, build: PRESETS.all_rounder.build, priority: 0.5 });
    for (let i = 0; i < 2000 && state.sim.x < xM; i += 1) state = step(state, cruise);
    return state;
  };
  const entry = (state: ReturnType<typeof at>, action: string) => buildQuestion(state, START_TRIGGER).lookahead.find((l) => l.action === action)!;

  it('before the pad: full throttle will pass it, braking can still stop on it, and passing costs 10 s', () => {
    const zone = MISSIONS.M1.scanZones![0]!;
    const state = at(zone.atM - 2.5);
    const full = entry(state, 'accelerate').scan!;
    const brake = entry(state, 'brake').scan!;
    expect(full.zoneId).toBe(zone.id);
    expect(full.missCostS).toBe(10);
    expect(['will_pass', 'passed']).toContain(full.outcome);
    expect(['can_stop', 'holding']).toContain(brake.outcome);
    expect(brake.padEndInM).toBeGreaterThan(0);
    expect(full.stopDistanceM).toBeGreaterThan(brake.stopDistanceM);
    // Facts only: no option carries a word about which one is right.
    expect(Object.keys(full).sort()).toEqual(['label', 'missCostS', 'outcome', 'padEndInM', 'stopDistanceM', 'zoneId']);
  });

  it('stopped on the pad: the scan option completes the scan inside the window', () => {
    const zone = MISSIONS.M1.scanZones![0]!;
    let state = at(zone.atM - 1, 'slow_down');
    for (let i = 0; i < 200 && Math.abs(state.sim.v) > 0.05; i += 1) state = step(state, 'brake');
    expect(Math.abs(state.sim.x - zone.atM)).toBeLessThan(zone.halfLengthM + 0.3);
    const question = buildQuestion(state, START_TRIGGER);
    expect(question.options).toContain('scan');
    expect(question.lookahead.find((l) => l.action === 'scan')!.scan!.outcome).toBe('scanned');
    expect(['passed', 'will_pass']).toContain(question.lookahead.find((l) => l.action === 'accelerate')!.scan!.outcome);
  });

  it('a build that cannot scan the zone gets no scan fact, and after the last zone there is none', () => {
    const noCamera = { ...PRESETS.all_rounder.build, sensors: ['imu'] };
    const state = createRun({ mission: MISSIONS.M1, seed: 7, build: noCamera, priority: 0.5 });
    expect(buildQuestion(state, START_TRIGGER).lookahead.every((l) => l.scan === undefined)).toBe(true);
    expect(buildQuestion(at(MISSIONS.M1.scanZones![0]!.atM + 3), START_TRIGGER).lookahead.every((l) => l.scan === undefined)).toBe(true);
  });

  it('a hazard inside the window: contact speed against the safe speed, with the damage it costs', () => {
    // M1's step, about 1 m ahead, at full speed.
    const step1 = createRun({ mission: MISSIONS.M1, seed: 7, build: PRESETS.all_rounder.build, priority: 0.5 }).world.obstacles[0]!;
    const state = at(step1.xM - 1.2);
    const full = entry(state, 'accelerate');
    const eased = entry(state, 'brake');
    expect(full.contact).toBeDefined();
    expect(full.contact!.kind).toBe('step');
    expect(full.contact!.speedMps).toBeGreaterThan(full.contact!.safeSpeedMps);
    expect(full.contact!.damagePct).toBeGreaterThan(0);
    expect(full.damagePct).toBeGreaterThanOrEqual(full.contact!.damagePct);
    // Braking either stops short of it or meets it at a speed that costs less.
    expect(eased.contact?.damagePct ?? 0).toBeLessThan(full.contact!.damagePct);
    expect(full.endSpeedMps).toBeDefined();
  });
});

describe('facts, no verdict: the time line and falls (OVN-SIM-24)', () => {
  it('each option that moves says how long the rest of the track takes at its pace; a faster pace takes less', () => {
    let state = createRun({ mission: MISSIONS.M1, seed: 7, build: PRESETS.all_rounder.build, priority: 0.5 });
    for (let i = 0; i < 60; i += 1) state = step(state, 'cruise');
    const look = buildQuestion(state, START_TRIGGER).lookahead;
    const of = (action: string) => look.find((l) => l.action === action)!;
    expect(of('accelerate').projectedFinishS!).toBeLessThan(of('cruise').projectedFinishS!);
    expect(of('cruise').projectedFinishS!).toBeLessThan(of('slow_down').projectedFinishS!);
    expect(of('accelerate').projectedFinishS!).toBeGreaterThan(5);
    expect(of('accelerate').fallsIntoGap).toBeUndefined();
  });

  it('an option that drives into a gap it can see says so', () => {
    // M7's second gap has no ramp: without the piston every forward option falls in.
    const build = { ...PRESETS.all_rounder.build, sensors: ['camera', 'ultrasonic'] };
    let state = createRun({ mission: MISSIONS.M7, seed: 7, build, priority: 0.5 });
    const gap = state.world.features.filter((f) => f.type === 'gap')[1]!;
    state = { ...state, sim: { ...state.sim, x: gap.startM - 1.2, v: 1.6 }, segmentIndex: state.world.segments.findIndex((seg) => seg.endM > gap.startM - 1.2), bestX: gap.startM - 1.2 };
    const look = buildQuestion(state, START_TRIGGER).lookahead;
    expect(look.find((l) => l.action === 'accelerate')!.fallsIntoGap).toBe(true);
    expect(look.find((l) => l.action === 'accelerate')!.projectedFinishS).toBeUndefined();
    expect(look.find((l) => l.action === 'brake')!.fallsIntoGap).toBeUndefined();
  });
});
