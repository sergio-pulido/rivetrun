import { describe, expect, it } from 'vitest';
import type { Build, Mission } from '@rivetrun/contracts';
import {
  DUCTED_FAN, DUCTED_FAN_ENABLED, MISSIONS, PARTS_BY_ID, PRESETS, START_TRIGGER, buildIssues, buildQuestion, capabilities, createRun, deriveSpec, fanHoldFor, fanHop,
  heuristicBrain, jumpAirtimeS, replayDrive, runHeadless, step,
} from './index';
import type { RunState } from './index';

const G = 9.81;
// The Speedster as it ships with the fan, whatever the off switch says.
const speedster: Build = { ...PRESETS.speedster.build, extras: ['ducted_fan'] };
const fanPower = PARTS_BY_ID.get('ducted_fan')!.powerW;
/** 12 m of asphalt, then a 0.9 m gap with no ramp (M7's), then asphalt. */
const gapTrack: Mission = {
  ...MISSIONS.M1, scanZones: undefined,
  track: { segments: [{ terrain: 'asphalt', lengthM: 12, slopeDeg: 0 }, { terrain: 'asphalt', lengthM: 12, slopeDeg: 0, feature: { type: 'gap', widthM: 0.9 } }] },
};
const GAP_START_M = 12;
const GAP_END_M = 12.9;

/** A player at steady throttle who holds the fan from 0.3 m before the gap for `holdS`. */
function cross(build: Build, holdS: number, pedal: 'cruise' | 'slow_down' = 'cruise'): { state: RunState; fell: boolean; burnedS: number } {
  let state = createRun({ mission: gapTrack, seed: 1, build, priority: 0.5, manual: true });
  let heldS = 0;
  let burnedS = 0;
  let fell = false;
  while (!state.done && state.sim.x < GAP_END_M + 3 && !fell) {
    const hold = state.sim.x >= GAP_START_M - 0.3 && heldS < holdS - 1e-9;
    if (hold) heldS += 0.05;
    state = step({ ...state, ...(hold ? { fanHeld: true } : {}) }, pedal);
    if (state.drawW >= fanPower) burnedS += 0.05;
    if (state.lastAir?.type === 'fell') fell = true;
  }
  return { state, fell, burnedS };
}

describe('RR-THRUST: the part', () => {
  it('lifts less than the weight of any build that can carry it, and 0.6–0.8 of the Speedster\'s', () => {
    const spec = deriveSpec(speedster);
    expect(spec.fan).toEqual({ liftN: DUCTED_FAN.liftN, pushN: DUCTED_FAN.pushN, burnS: 2, powerW: fanPower });
    const share = spec.fan!.liftN / (spec.massKg * G);
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.8);
    // The lightest legal build: small wheels, light motor, a 1S small pack.
    const lightest = deriveSpec({ locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: [], extras: ['ducted_fan'], batteryCells: 1, wheelSizeMm: 60 });
    // There the raw figure would be 0.85 of the weight: the sim caps it there, so no build flies.
    expect(lightest.massKg).toBeCloseTo(2.1, 6);
    expect(fanHop(lightest, 1, 2).airtimeS).toBeLessThan(2);
    expect(fanPower).toBeGreaterThanOrEqual(200);
    expect(spec.massKg).toBeCloseTo(deriveSpec({ ...speedster, extras: [] }).massKg + 0.35, 6);
    expect(spec.jumpCooldownS).toBe(4);
  });

  it('shares the jump button with the piston: both fitted is an issue, and the piston is the one that works', () => {
    const both: Build = { ...speedster, extras: ['piston_jump', 'ducted_fan'] };
    expect(buildIssues(both)).toEqual(['Piston jump and Ducted fan (EDF) share the jump button: fit one']);
    expect(deriveSpec(both).fan).toBeUndefined();
    expect(deriveSpec(both).jumpImpulseMps).toBe(4);
    expect(buildIssues(speedster)).toEqual([]);
  });

  it('is on the Speedster only, behind one switch; the other three presets are untouched', () => {
    expect(PRESETS.speedster.build).toEqual({ locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: ['camera', 'ultrasonic'], extras: DUCTED_FAN_ENABLED ? ['ducted_fan'] : [] });
    expect(PARTS_BY_ID.get('ducted_fan')!.comingSoon === true).toBe(!DUCTED_FAN_ENABLED);
    expect(PRESETS.mud_crawler.build.extras).toEqual(['waterproof_case']);
    expect(PRESETS.all_rounder.build).toEqual({ locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['bumper'] });
    expect(PRESETS.deep_diver.build.extras).toEqual(['waterproof_case', 'thruster_kit']);
    expect(capabilities(speedster).jump).toMatchObject({ cooldownS: 4 });
    expect(capabilities(speedster).jump!.reachM).toBeGreaterThan(0.9);
  });
});

describe('RR-THRUST: holding the fan', () => {
  it('clears the gap with a good hold and falls short with a tap', () => {
    const good = cross(speedster, 0.6);
    expect(good.fell).toBe(false);
    expect(good.state.sim.x).toBeGreaterThan(GAP_END_M);
    const tap = cross(speedster, 0.05);
    expect(tap.fell).toBe(true);
    expect(tap.state.falls).toBe(1);
  });

  it('works from low speed: at ease-off pace (about 1 m/s) the held fan clears the gap, where the piston\'s arc would not', () => {
    const spec = deriveSpec(speedster);
    const easeMps = 0.35 * spec.topSpeedMps;
    expect(cross(speedster, 1, 'slow_down').fell).toBe(false);
    expect(fanHop(spec, easeMps, 2).reachM).toBeGreaterThan(1.1);
    // The piston's reach is speed × 0.82 s of airtime: short of 0.9 m at that pace.
    expect(easeMps * jumpAirtimeS(4)).toBeLessThan(0.9);
    // Without the hold the fan's hop is a few centimetres.
    expect(fanHop(spec, easeMps, 0.05).reachM).toBeLessThan(0.3);
    expect(fanHoldFor(spec, 2.1, 1.2)!).toBeLessThan(fanHoldFor(spec, 1, 1.2)!);
    expect(fanHoldFor(spec, 2.1, 50)).toBeNull();
  });

  it('burns for 2 s at most, then stays dark for 4 s', () => {
    let state = createRun({ mission: gapTrack, seed: 1, build: speedster, priority: 0.5, manual: true });
    // High in the air with the button held all the way down.
    state = { ...state, airborne: true, heightM: 60, vy: 0, sim: { ...state.sim, v: 1 } };
    let burnedS = 0;
    let lastBurnT = 0;
    const startV = state.sim.v;
    for (let i = 0; i < 70 && state.airborne; i += 1) {
      state = step({ ...state, fanHeld: true }, 'coast');
      if (state.drawW >= fanPower) {
        burnedS += 0.05;
        lastBurnT = state.sim.t;
      }
    }
    expect(burnedS).toBeCloseTo(2, 6);
    expect(lastBurnT).toBeCloseTo(2, 6);
    // It can be steered in the air: the push added forward speed while it burned.
    expect(state.sim.v).toBeGreaterThan(startV + 1);
    expect(state.jumpReadyT).toBeCloseTo(lastBurnT - 0.05 + 4, 6);
    // On the ground, inside the cool-down, the button does nothing.
    let ground: RunState = { ...state, airborne: false, heightM: 0, vy: 0 };
    ground = step({ ...ground, fanHeld: true }, 'cruise');
    expect(ground.airborne).toBe(false);
    expect(ground.drawW).toBeLessThan(fanPower);
  });

  it('draws its power while it is on and nothing after', () => {
    const run = cross(speedster, 0.6);
    const plain = cross({ ...speedster, extras: ['ducted_fan'] }, 0);
    expect(plain.burnedS).toBe(0);
    expect(run.burnedS).toBeCloseTo(0.6, 6);
    const capacityJ = deriveSpec(speedster).capacityWh * 3600;
    // 0.6 s at 300 W out of a 0.3 Wh pack: about 17 % of it.
    expect((fanPower * run.burnedS) / capacityJ).toBeCloseTo(0.1667, 3);
    expect(run.state.sim.battery).toBeLessThan(100 - 16);
  });

  it('is deterministic: the same log replays to the same run, a held button and all', () => {
    const log = [
      { t: 0, throttle: 0.6, brake: 0, action: 'cruise' as const },
      { t: 3, throttle: 0.6, brake: 0, jumpHeld: true, action: 'cruise' as const },
      { t: 3.7, throttle: 0.6, brake: 0, action: 'cruise' as const },
    ];
    const config = { mission: gapTrack, seed: 3, build: speedster, priority: 0.5 };
    const a = replayDrive(config, log);
    const b = replayDrive(config, log);
    expect(a.episode.outcome).toEqual(b.episode.outcome);
    expect(a.ghost.frames).toEqual(b.ghost.frames);
    expect(a.ghost.frames.some((frame) => frame.airborne === true)).toBe(true);
  });
});

describe('RR-THRUST: the heuristic on M7', () => {
  const piston: Build = { ...PRESETS.all_rounder.build, extras: ['bumper', 'piston_jump'] };
  const run = async (build: Build, seed = 7) => (await runHeadless(MISSIONS.M7, seed, build, heuristicBrain)).episode.outcome;

  it('the fan and the piston both clear the gap with no ramp; no jump part falls in', async () => {
    const fan = await run(speedster);
    expect(fan.finished).toBe(true);
    expect(fan.breakdown!.damageByCause.fall).toBe(0);
    const jumped = await run(piston);
    expect(jumped.finished).toBe(true);
    expect(jumped.breakdown!.damageByCause.fall).toBe(0);
    // The Mud Crawler has no forward sensor and no jump part: it meets the gap blind.
    const none = await run(PRESETS.mud_crawler.build);
    expect(none.finished).toBe(false);
    expect(none.breakdown!.damageByCause.fall).toBeGreaterThanOrEqual(15);
  });

  it('the fan run ends with visibly less battery than the same robot with the piston', async () => {
    const fan = await run(speedster);
    const same = await run({ ...speedster, extras: ['piston_jump'] });
    expect(same.finished).toBe(true);
    expect(fan.energyUsedPct - same.energyUsedPct).toBeGreaterThan(8);
    expect(fan.energyUsedPct).toBeLessThan(90);
  });

  it('is the same run twice', async () => {
    expect(await run(speedster, 1001)).toEqual(await run(speedster, 1001));
  });

  it('predicts the jump: clears for the Speedster, falls short for a build too heavy for the fan', () => {
    const at = (build: Build) => {
      let state = createRun({ mission: MISSIONS.M7, seed: 7, build, priority: 0.5 });
      const gap = state.world.features.filter((f) => f.type === 'gap')[1]!;
      const x = gap.startM - 1.2;
      state = { ...state, sim: { ...state.sim, x, v: 1.4 }, segmentIndex: state.world.segments.findIndex((seg) => seg.endM > x), bestX: x };
      const look = buildQuestion(state, START_TRIGGER).lookahead;
      return { jump: look.find((l) => l.action === 'jump')!, cruise: look.find((l) => l.action === 'cruise')! };
    };
    const light = at(speedster);
    expect(light.cruise.fallsIntoGap).toBe(true);
    expect(light.jump.fallsIntoGap).toBeUndefined();
    expect(light.jump.energyPct).toBeGreaterThan(light.cruise.energyPct);
    const heavy = at({ locomotion: 'tracks', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['ducted_fan'] });
    expect(heavy.jump.fallsIntoGap).toBe(true);
  });
});
