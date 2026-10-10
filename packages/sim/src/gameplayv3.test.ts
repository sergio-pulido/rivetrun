import { describe, expect, it } from 'vitest';
import type { Action, Brain, Build, Mission, RunEvent } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, controlToAction, createRun, driveController, driveSeed, heuristicBrain, heuristicDecide, jumpChargePower, runHeadless, safeSpeedMps, step } from './index';

const allRounder = PRESETS.all_rounder.build;
/** The heuristic, with every throttle level replaced by one pace. */
const paced = (level: Action): Brain => ({
  decide: async (question) => {
    const decision = heuristicDecide(question);
    return { ...decision, selected: ['accelerate', 'cruise', 'slow_down'].includes(decision.selected) ? level : decision.selected };
  },
});

describe('gameplay v3: controls', () => {
  it('maps analog throttle and brake to the shared actions; a boolean still works', () => {
    const at = (throttle: boolean | number, brake: boolean | number = 0): Action => controlToAction({ throttle, brake }, allRounder);
    expect([at(1), at(0.9), at(0.6), at(0.3), at(0), at(true), at(false)]).toEqual(['accelerate', 'accelerate', 'cruise', 'slow_down', 'coast', 'accelerate', 'coast']);
    expect([at(1, 1), at(1, 0.3), at(0, true)]).toEqual(['brake', 'brake_soft', 'brake']);
  });

  it('coasting uses no drive energy and the ground slows the robot', () => {
    let state = createRun({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5 });
    for (let i = 0; i < 40; i += 1) state = step(state, 'accelerate');
    const speed = state.sim.v;
    for (let i = 0; i < 40; i += 1) state = step(state, 'coast');
    expect(state.sim.v).toBeLessThan(speed);
    expect(state.sim.v).toBeGreaterThan(0);
    expect(state.drawW).toBeCloseTo(state.spec.basePowerW, 5);
  });
});

describe('gameplay v3: speed costs damage on hazards', () => {
  const hitStepAt = (action: Action, build: Build): number => {
    let state = createRun({ mission: MISSIONS.M1, seed: 1, build, priority: 0.5, manual: true });
    for (let i = 0; i < 1200 && state.sim.x < 25 && !state.done; i += 1) state = step(state, state.sim.x < 22 ? 'accelerate' : action);
    return state.sim.damage;
  };

  it('is free at or below the safe speed and grows with the square above it', () => {
    const bare: Build = { ...allRounder, extras: [] };
    const state = createRun({ mission: MISSIONS.M1, seed: 1, build: bare, priority: 0.5 });
    expect(safeSpeedMps(state, 'step')).toBeCloseTo(0.6, 2);
    const eased = hitStepAt('slow_down', bare); // 0.7 m/s: just over the safe speed
    const steady = hitStepAt('cruise', bare); // 1.4 m/s
    const full = hitStepAt('accelerate', bare); // 2.0 m/s
    expect(eased).toBeLessThan(0.2);
    expect(full).toBeGreaterThan(steady * 2);
  });

  it('a bumper raises the safe speed', () => {
    const withBumper = createRun({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5 });
    const without = createRun({ mission: MISSIONS.M1, seed: 1, build: { ...allRounder, extras: [] }, priority: 0.5 });
    expect(safeSpeedMps(withBumper, 'rock')).toBeGreaterThan(safeSpeedMps(without, 'rock'));
  });
});

describe('gameplay v3: scan zones', () => {
  it('a build with the sensor stops and scans; one without it misses and pays 10 s', async () => {
    const seen = await runHeadless(MISSIONS.M1, driveSeed(MISSIONS.M1), allRounder, heuristicBrain);
    expect(seen.episode.outcome.breakdown).toMatchObject({ scansDone: 1, scansMissed: 0, scanPenaltyS: 0 });
    expect(seen.episode.decisions.some((d) => d.selected === 'scan')).toBe(true);
    expect(seen.ghost.frames.some((frame) => frame.scan !== undefined)).toBe(true);

    const blindToIt = await runHeadless(MISSIONS.M1, driveSeed(MISSIONS.M1), PRESETS.mud_crawler.build, heuristicBrain);
    expect(blindToIt.episode.outcome.breakdown).toMatchObject({ scansDone: 0, scansMissed: 1, scanPenaltyS: 10 });
    expect(blindToIt.episode.outcome.timeS).toBeCloseTo(blindToIt.ghost.frames.at(-1)!.t + 10, 1);
    expect(blindToIt.episode.decisions.every((d) => d.selected !== 'scan')).toBe(true);
  });
});

describe('gameplay v3: energy makes pace matter', () => {
  const heavyM5: Build = { locomotion: 'tracks', motor: 'motor_torque', battery: 'battery_small', sensors: ['camera', 'ultrasonic'], extras: ['waterproof_case', 'bumper'] };
  const heavyM6: Build = { locomotion: 'wheels', motor: 'motor_torque', battery: 'battery_small', sensors: ['ultrasonic', 'camera'], extras: ['waterproof_case', 'thruster_kit'] };

  it('a heavy build on the small battery runs out at full throttle and finishes at an eased pace, on M5 and M6', async () => {
    for (const [mission, build] of [[MISSIONS.M5, heavyM5], [MISSIONS.M6, heavyM6]] as const) {
      const full = await runHeadless(mission, driveSeed(mission), build, paced('accelerate'));
      const steady = await runHeadless(mission, driveSeed(mission), build, paced('cruise'));
      expect(full.episode.outcome.dnfReason, mission.id).toBe('battery');
      expect(steady.episode.outcome.finished, mission.id).toBe(true);
      // The heuristic reads the energy line and eases off in time.
      const own = await runHeadless(mission, driveSeed(mission), build, heuristicBrain);
      expect(own.episode.outcome.finished, mission.id).toBe(true);
      expect(own.episode.decisions.some((d) => d.log?.trigger.kind === 'energy'), mission.id).toBe(true);
    }
  });
});

describe('gameplay v3: traction', () => {
  /** Crosses M3's flat deep mud (22–32 m) at one pace after a clean climb. Returns the crossing time, or null when it bogs down. */
  const crossDeepMud = (pace: Action): { timeS: number | null; meanSlipPct: number } => {
    let state = createRun({ mission: MISSIONS.M3, seed: 1, build: allRounder, priority: 0.5, manual: true });
    let enteredAt = -1;
    let slip = 0;
    let steps = 0;
    for (let i = 0; i < 4000 && !state.done && state.sim.x < 31.5; i += 1) {
      state = step(state, state.sim.x < 9.5 ? 'cruise' : state.sim.x < 20.5 ? 'climb_mode' : pace);
      if (state.sim.x < 21) continue;
      if (enteredAt < 0) enteredAt = state.sim.t;
      slip += state.slipPct;
      steps += 1;
    }
    return { timeS: state.sim.x >= 31.5 ? state.sim.t - enteredAt : null, meanSlipPct: slip / Math.max(1, steps) };
  };

  it('full throttle in deep mud spins the wheels and bogs down; a feathered throttle gets through', () => {
    const full = crossDeepMud('accelerate');
    const eased = crossDeepMud('slow_down');
    expect(full.timeS).toBeNull();
    expect(full.meanSlipPct).toBeGreaterThan(25);
    expect(eased.timeS).not.toBeNull();
    expect(eased.meanSlipPct).toBeLessThan(1);
    // Traction control (climb mode) is quicker still.
    expect(crossDeepMud('climb_mode').timeS!).toBeLessThan(eased.timeS!);
  });

  /** Metres needed to stop from a rolling start on a flat strip of one terrain. */
  const stoppingDistance = (terrain: 'asphalt' | 'ice', brake: Action): number => {
    const strip = { ...MISSIONS.M1, scanZones: [], track: { segments: [{ terrain: 'asphalt' as const, lengthM: 10, slopeDeg: 0 }, { terrain, lengthM: 40, slopeDeg: 0 }] } };
    let state = createRun({ mission: strip, seed: 1, build: allRounder, priority: 0.5, manual: true });
    for (let i = 0; i < 2000 && state.sim.x < 10.5; i += 1) state = step(state, 'accelerate');
    const from = state.sim.x;
    for (let i = 0; i < 2000 && state.sim.v > 1e-3 && !state.done; i += 1) state = step(state, brake);
    return state.sim.x - from;
  };

  it('braking is limited by grip: ice takes longer to stop than asphalt, and a soft brake longer than a hard one', () => {
    const asphalt = stoppingDistance('asphalt', 'brake');
    const ice = stoppingDistance('ice', 'brake');
    expect(asphalt).toBeGreaterThan(0);
    expect(ice).toBeGreaterThan(asphalt * 1.5);
    expect(stoppingDistance('asphalt', 'brake_soft')).toBeGreaterThan(asphalt);
  });
});

describe('gameplay v3 P2: air control', () => {
  // A 20° ramp onto flat ground: the body leaves nose-up and has to be levelled in the air.
  const rampTrack: Mission = { ...MISSIONS.M1, scanZones: [], track: { segments: [{ terrain: 'asphalt', lengthM: 8, slopeDeg: 0, feature: { type: 'ramp', launchDeg: 20, lengthM: 1.5 } }, { terrain: 'asphalt', lengthM: 20, slopeDeg: 0 }] } };
  const fly = (inAir: Action, manual: boolean) => {
    let state = createRun({ mission: rampTrack, seed: 1, build: allRounder, priority: 0.5, manual });
    let pitchInAir: number | undefined;
    for (let i = 0; i < 600 && !state.done; i += 1) {
      state = step(state, state.airborne ? inAir : 'accelerate');
      if (state.airborne) pitchInAir = state.sim.pitch;
      if (state.lastAir?.type === 'landed') return { landed: state.lastAir, pitchInAir, v: state.sim.v, t: state.sim.t };
    }
    throw new Error('never landed');
  };

  it('throttle in the air pitches the nose up, brake pitches it down, and the landing is graded', () => {
    const coasted = fly('coast', true);
    expect(coasted.landed.grade).toBe('hard');
    expect(coasted.landed.pitchErrorDeg).toBe(20);

    const levelled = fly('brake_soft', true);
    expect(levelled.pitchInAir!).toBeLessThan(coasted.pitchInAir!);
    expect(levelled.landed.grade).toBe('clean');
    expect(levelled.landed.damagePct).toBeLessThan(coasted.landed.damagePct);

    const noseUp = fly('accelerate', true);
    expect(noseUp.landed.pitchErrorDeg!).toBeGreaterThan(coasted.landed.pitchErrorDeg!);
    expect(noseUp.landed.damagePct).toBeGreaterThan(coasted.landed.damagePct);
  });

  it('over 30° nose-first is a crash: damage, a dead stop and a second lost', () => {
    const dropTrack: Mission = { ...MISSIONS.M1, scanZones: [], track: { segments: [{ terrain: 'asphalt', lengthM: 8, slopeDeg: 0 }, { terrain: 'asphalt', lengthM: 20, slopeDeg: 0, feature: { type: 'drop', heightM: 1.6 } }] } };
    const land = (inAir: Action) => {
      let state = createRun({ mission: dropTrack, seed: 1, build: allRounder, priority: 0.5, manual: true });
      for (let i = 0; i < 600 && !state.done; i += 1) {
        const before = state.sim.t;
        state = step(state, state.airborne ? inAir : 'accelerate');
        if (state.lastAir?.type === 'landed') return { landed: state.lastAir, v: state.sim.v, stepS: state.sim.t - before };
      }
      throw new Error('never landed');
    };
    const flat = land('coast');
    const dive = land('brake');
    expect(flat.landed.grade).toBe('clean');
    expect(dive.landed.grade).toBe('crash');
    // 10 % for the crash, halved by this build's bumper.
    expect(dive.landed.damagePct).toBeCloseTo(flat.landed.damagePct + 5, 5);
    expect(dive.v).toBe(0);
    expect(dive.stepS).toBeCloseTo(1.05, 5);
  });

  it('a brain\'s robot is always level: no grade, the same landing as before', () => {
    const auto = fly('coast', false);
    expect(auto.landed.grade).toBeUndefined();
    expect(auto.landed.damagePct).toBeLessThanOrEqual(fly('brake_soft', true).landed.damagePct + 1e-9);
  });
});

describe('gameplay v3 P2: charged piston jump', () => {
  const jumper: Build = { ...allRounder, extras: ['piston_jump'] };
  const flat: Mission = { ...MISSIONS.M1, scanZones: [], track: { segments: [{ terrain: 'asphalt', lengthM: 60, slopeDeg: 0 }] } };

  it('0.3–1.0 s of hold gives 40–100 % of the impulse', () => {
    expect([0, 0.3, 0.65, 1, 2].map((heldS) => Math.round(jumpChargePower(heldS) * 100))).toEqual([40, 40, 70, 100, 100]);
  });

  /** Holds the jump button from 2 s of sim time for `holdS`, then lets go. Returns the peak height and charge shown. */
  const hop = async (holdS: number, how: 'charge' | 'instant' = 'charge'): Promise<{ peakM: number; charge: number; airborneAt: number }> => {
    let t = 0;
    let peakM = 0;
    let charge = 0;
    let airborneAt = -1;
    const events: RunEvent[] = [];
    const controller = driveController(
      { mission: flat, seed: 1, build: jumper, priority: 0.5 },
      () => ({ throttle: 0.6, brake: 0, ...(t >= 2 && t < 2 + holdS ? (how === 'charge' ? { jumpHeld: true } : { special: 'jump' as const }) : {}) }),
      { hints: false, timeScale: 200, onEvent: (event) => {
        events.push(event);
        if (event.type !== 'frame') return;
        t = event.state.t;
        peakM = Math.max(peakM, event.state.heightM ?? 0);
        charge = Math.max(charge, event.state.jumpCharge ?? 0);
        if (airborneAt < 0 && event.state.airborne) airborneAt = t;
        if (t > 6) controller.stop();
      } },
    );
    await controller.start().catch(() => undefined);
    return { peakM, charge, airborneAt };
  };

  it('the piston fires on release, higher the longer it was held; a plain jump still fires at once at full power', async () => {
    const tap = await hop(0.1);
    const half = await hop(0.65);
    const full = await hop(1.2);
    expect(tap.airborneAt).toBeGreaterThan(2);
    expect(full.airborneAt).toBeGreaterThanOrEqual(3.2);
    expect(tap.peakM).toBeGreaterThan(0);
    expect(half.peakM).toBeGreaterThan(tap.peakM * 2);
    expect(full.peakM).toBeGreaterThan(half.peakM * 1.5);
    expect(full.charge).toBe(1);
    const instant = await hop(0.1, 'instant');
    expect(instant.airborneAt).toBeLessThan(2.2);
    expect(instant.peakM).toBeCloseTo(full.peakM, 2);
  }, 20000);
});
