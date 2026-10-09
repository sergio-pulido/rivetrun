import type { Build, Mission } from '@rivetrun/contracts';
import { TERRAINS, TUNING } from './data';
import { ACTION_PROFILES, PHYSICS, createRun, step } from './physics';
import { deriveSpec } from './spec';

export interface PredictedStats {
  readonly topSpeedMps: number;
  /** Seconds from standstill to 95 % of top speed on flat asphalt. */
  readonly zeroToTopS: number;
  /** Steepest dry-asphalt slope the build can drive up without climb mode. */
  readonly maxClimbDeg: number;
  /** Distance on one charge at cruise on flat asphalt. */
  readonly rangeM: number;
  readonly massKg: number;
  readonly costEur: number;
}

const G = 9.81;
const DEG = Math.PI / 180;
const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;

const TEST_STRIP: Mission = {
  id: 'M1', name: 'Test strip', description: '', weather: 'clear', starThreshold: 0, leaderboard: false, fixedSeed: 1,
  track: { segments: [{ terrain: 'asphalt', lengthM: 500, slopeDeg: 0 }] },
};

/** What the Workshop shows while the player tunes the build. Pure; runs the real physics on a flat strip. */
export function predictStats(build: Build): PredictedStats {
  const spec = deriveSpec(build);
  const asphalt = TERRAINS.asphalt;
  const mu = asphalt.baseFriction * (spec.grip.asphalt ?? 1);

  let state = createRun({ mission: TEST_STRIP, seed: 1, build, priority: 0.5 });
  const target = spec.topSpeedMps * 0.95;
  const maxSteps = Math.round(20000 / TUNING.dtMs);
  for (let i = 0; i < maxSteps && state.sim.v < target; i += 1) state = step(state, 'accelerate');
  const reached = state.sim.v >= target;

  let maxClimbDeg = 0;
  for (let deg = 0.5; deg <= 45; deg += 0.5) {
    const need = Math.sin(deg * DEG) + asphalt.rollingResistance * Math.cos(deg * DEG);
    const traction = mu * Math.cos(deg * DEG) >= need;
    const torque = spec.motorForceN >= spec.massKg * G * need;
    if (!traction || !torque || deg > spec.maxSlopeDeg) break;
    maxClimbDeg = deg;
  }

  const cruiseMps = ACTION_PROFILES.cruise.speed * spec.topSpeedMps;
  const load = Math.min(1, (asphalt.rollingResistance * spec.massKg * G) / spec.motorForceN);
  const cruiseW = spec.basePowerW + spec.motorPowerW * (PHYSICS.idleLoad + (1 - PHYSICS.idleLoad) * load);
  const rangeM = cruiseW > 0 ? (cruiseMps * spec.capacityWh * 3600) / cruiseW : 0;

  return {
    topSpeedMps: round(spec.topSpeedMps, 2),
    zeroToTopS: reached ? round(state.sim.t, 2) : 20,
    maxClimbDeg,
    rangeM: Math.round(rangeM),
    massKg: round(spec.massKg, 2),
    costEur: spec.costEur,
  };
}
