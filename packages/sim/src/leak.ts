import type { Action, BrainQuestion, Build, Conditions, Mission, Segment } from '@rivetrun/contracts';
import { MISSIONS, PRESETS } from './data';
import { START_TRIGGER, buildQuestion, observe } from './perception';
import { createRun, step } from './physics';

// Leak test kit (OVN-SIM-21): "the brain knows only what its sensors report".
// Pairs of tracks that are identical up to a point and different beyond it. While the difference is further away than
// the build can sense, everything a brain is given must be identical on both. Used by leak.test.ts here and by the
// brain package's test of the question text.

/** Where the two tracks of a pair start to differ, metres. */
export const LEAK_DIVERGE_M = 40;
const TOTAL_M = 70;

const shared: Segment[] = [
  { terrain: 'asphalt', lengthM: 12, slopeDeg: 0 },
  { terrain: 'grass', lengthM: 14, slopeDeg: 3 },
  { terrain: 'asphalt', lengthM: LEAK_DIVERGE_M - 26, slopeDeg: 0 },
];
const rest = TOTAL_M - LEAK_DIVERGE_M;

/** What lies beyond the point. The total length is the same in every variant: the mission plan gives it to every build. */
export const LEAK_VARIANTS: Readonly<Record<string, Segment[]>> = {
  plain: [{ terrain: 'asphalt', lengthM: rest, slopeDeg: 0 }],
  mud: [{ terrain: 'mud', lengthM: rest, slopeDeg: 0, depthCm: 12 }],
  ice_downhill: [{ terrain: 'ice', lengthM: rest, slopeDeg: -8 }],
  rock_at_once: [{ terrain: 'rock', lengthM: 0.8, slopeDeg: 0, obstacle: 'rock' }, { terrain: 'asphalt', lengthM: rest - 0.8, slopeDeg: 0 }],
  gap: [{ terrain: 'asphalt', lengthM: rest, slopeDeg: 0, feature: { type: 'gap', widthM: 0.8 } }],
  drop: [{ terrain: 'asphalt', lengthM: rest, slopeDeg: 0, feature: { type: 'drop', heightM: 0.8 } }],
  deep_water: [{ terrain: 'water', lengthM: rest, slopeDeg: 0, depthCm: 90, currentMps: 0.5 }],
  steep_snow: [{ terrain: 'snow', lengthM: rest, slopeDeg: 12 }],
};

/** One sensor set per way of seeing ahead, plus the instruments that feel the ground under the robot. */
export const LEAK_BUILDS: Readonly<Record<string, Build>> = {
  blind: { ...PRESETS.all_rounder.build, sensors: [], extras: [] },
  ultrasonic: { ...PRESETS.all_rounder.build, sensors: ['ultrasonic'], extras: [] },
  tof: { ...PRESETS.all_rounder.build, sensors: ['tof_vl53l1x_pololu'], extras: [] },
  camera: { ...PRESETS.all_rounder.build, sensors: ['camera'], extras: [] },
  lidar: { ...PRESETS.all_rounder.build, sensors: ['lidar_rplidar_c1'], extras: [] },
  drone: { ...PRESETS.all_rounder.build, sensors: ['scout_drone'], extras: [] },
  camera_imu_bumper: { ...PRESETS.all_rounder.build, sensors: ['camera', 'imu'], extras: ['bumper'] },
  probe_lidar: { ...PRESETS.all_rounder.build, sensors: ['moisture_probe', 'lidar_rplidar_c1'], extras: ['piston_jump'] },
};

export const leakMission = (variant: string, conditions?: Conditions): Mission => ({
  ...MISSIONS.M1,
  ...(conditions ? { conditions } : {}),
  // The scan zone is in the shared part: the plan gives its position to every build.
  scanZones: [{ id: 'leak-zone', label: 'marker', atM: 20, halfLengthM: 0.5, needs: ['camera', 'ultrasonic'] }],
  track: { segments: [...shared, ...LEAK_VARIANTS[variant]!] },
});

export interface LeakSample {
  readonly x: number;
  /** Metres from the robot to the point where the tracks differ. */
  readonly toDivergenceM: number;
  /** The furthest this build can sense ahead right now, metres. */
  readonly rangeM: number;
  readonly question: BrainQuestion;
}

/**
 * Drives the build down one variant with a fixed command script and returns what a brain would be given at every
 * fifth step, for as long as the robot is before the point of divergence.
 */
export function leakSamples(build: Build, variant: string, seed = 7, conditions?: Conditions): LeakSample[] {
  let state = createRun({ mission: leakMission(variant, conditions), seed, build, priority: 0.5 });
  const script: Action[] = ['accelerate', 'cruise', 'slow_down', 'climb_mode', 'cruise', 'brake_soft', 'accelerate'];
  const samples: LeakSample[] = [];
  for (let i = 0; i < 4000 && !state.done && state.sim.x < LEAK_DIVERGE_M; i += 1) {
    state = step(state, script[Math.floor(i / 40) % script.length]!);
    if (i % 5 !== 0) continue;
    const question = buildQuestion(state, START_TRIGGER);
    samples.push({ x: state.sim.x, toDivergenceM: LEAK_DIVERGE_M - state.sim.x, rangeM: observe(state).forwardRangeM, question });
  }
  return samples;
}
