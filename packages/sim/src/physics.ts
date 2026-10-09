import type { Action, Environment, Obstacle, SimEffect, SimState, TerrainId } from '@rivetrun/contracts';
import { TERRAINS, TUNING } from './data';
import { mixSeed, nextRandom } from './rng';
import { WHEEL_RADIUS_M, deriveSpec } from './spec';
import type { RunConfig, RunState, RunStats, StepDamage } from './types';
import { compileTrack, segmentIndexAt, waterDepthCmAt } from './world';

const G = 9.81;
const DT_S = TUNING.dtMs / 1000;
const DEG = Math.PI / 180;

/** Physics constants. v0 values. */
export const PHYSICS = {
  /** Speed controller time constant, seconds. */
  throttleTauS: 0.4,
  refMassKg: 3,
  sinkageDrag: 0.3,
  /** Impacts below this speed do no damage. */
  safeImpactSpeedMps: 0.6,
  impactDamagePerMps: 7,
  obstacleHardness: { step: 1, log: 1.5, rock: 1.6 } satisfies Record<Obstacle, number>,
  tipDamagePerDegS: 1.5,
  stuckAfterS: 8,
  winchSpeedMps: 0.6,
  slipEffectPct: 25,
  smokeAboveDamagePct: 50,
  sparksS: 0.4,
  idleLoad: 0.15,
  stallSpeedMps: 0.15,
  swimSpeedMps: 1.5,
  swimTauS: 0.6,
  /** A flooded hull takes this many times the normal water damage. */
  floodedDamageFactor: 1.5,
  hullHeightM: 0.25,
  /** Speed lost per unit of sin(slope) when swimming up a rising bed, m/s. */
  swimSlopeDragMps: 3,
  /** Climb mode feels this fraction of slope and current drag. */
  swimClimbRelief: 0.3,
  /** Debris hits a swimming hull harder than a bump hits a wheeled one. */
  submergedImpactFactor: 4,
  /** Driving onto rough ground (impactRisk at or above this) faster than the safe speed is an impact. */
  roughTerrainRisk: 0.7,
  roughEntrySafeMps: 1,
  roughEntryDamagePerMps: 60,
} as const;

interface ActionProfile {
  /** Target speed as a fraction of top speed. */
  readonly speed: number;
  readonly force: number;
  readonly grip: number;
  readonly power: number;
  readonly impact: number;
  /** Multiplier on sinkage drag (climb mode crawls on top of soft ground). */
  readonly drag: number;
}

const DEFAULT_PROFILE = { force: 1, grip: 1, power: 1, impact: 1, drag: 1 };
export const ACTION_PROFILES: Readonly<Record<Action, ActionProfile>> = {
  cruise: { ...DEFAULT_PROFILE, speed: 0.7 },
  accelerate: { ...DEFAULT_PROFILE, speed: 1 },
  slow_down: { ...DEFAULT_PROFILE, speed: 0.35 },
  brake: { ...DEFAULT_PROFILE, speed: 0 },
  reverse: { ...DEFAULT_PROFILE, speed: -0.35 },
  climb_mode: { speed: 0.45, force: 1.6, grip: 1.5, power: 1.4, impact: 0.3, drag: 0.6 },
  deploy_winch: { speed: 0, force: 1, grip: 1, power: 0.3, impact: 0.1, drag: 1 },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function createEnvironment(config: RunConfig, seed: number): Environment {
  const jitterRoll = nextRandom(mixSeed(seed, 1)).value;
  const jitter = TUNING.practice.frictionJitter;
  return {
    weather: config.mission.weather,
    frictionJitter: config.mission.fixedSeed === undefined ? 1 + (jitterRoll * 2 - 1) * jitter : 1,
    sensorNoiseSeed: mixSeed(seed, 2),
  };
}

export function createRun(config: RunConfig): RunState {
  const seed = (config.mission.fixedSeed ?? config.seed) >>> 0;
  const world = compileTrack(config.mission.track);
  const first = world.segments[0]!;
  const sim: SimState = {
    t: 0, x: 0, v: 0, slopeDeg: first.slopeDeg, pitch: first.slopeDeg, wheelSpin: 0,
    terrain: first.terrain, battery: 100, damage: 0, effects: [],
  };
  return {
    config: { ...config, seed },
    environment: createEnvironment(config, seed),
    sim,
    action: 'cruise',
    segmentIndex: 0,
    rngState: seed,
    done: false,
    world,
    spec: deriveSpec(config.build),
    stepCount: 0,
    slipPct: 0,
    lastDecisionT: 0,
    bestX: 0,
    lastProgressT: 0,
    sparksUntilT: 0,
    stallS: 0,
    finished: false,
    stats: { slipSByTerrain: {}, damageByCause: {}, lastTerrain: first.terrain },
  };
}

function frictionCoefficient(state: RunState, terrain: TerrainId, gripBoost: number): number {
  const { environment, spec } = state;
  const weather = environment.weather;
  let mu = TERRAINS[terrain].baseFriction * (spec.grip[terrain] ?? 1) * environment.frictionJitter * gripBoost;
  if (weather === 'rain') mu *= TUNING.weather.rain.frictionFactor;
  if (weather === 'cold' && terrain === 'ice') mu *= TUNING.weather.cold.iceFrictionFactor;
  return mu;
}

interface Motion {
  readonly v: number;
  readonly slipPct: number;
  /** Motor load 0–1. */
  readonly load: number;
  readonly accel: number;
  readonly swimming?: boolean;
}

function driveMotion(state: RunState, action: Action, terrain: TerrainId, slopeDeg: number): Motion {
  const { spec, sim } = state;
  const profile = ACTION_PROFILES[action];
  const m = spec.massKg;
  const v = sim.v;
  const here = state.world.segments[state.segmentIndex]!;
  const depthCm = waterDepthCmAt(here, sim.x);
  if (terrain === 'water' && depthCm > spec.maxWadingDepthCm) {
    // Too deep to drive: thrusters swim, anything else sinks to a stop.
    const canSwim = spec.maxSwimDepthCm >= depthCm;
    if (!canSwim) {
      const stopped = v - (v * DT_S) / PHYSICS.swimTauS;
      return { v: Math.abs(stopped) < 1e-3 ? 0 : stopped, slipPct: 0, load: 0, accel: (stopped - v) / DT_S };
    }
    // Climbing the bed and fighting the current both cost speed; climb mode trades top speed for thrust.
    const relief = action === 'climb_mode' ? PHYSICS.swimClimbRelief : 1;
    const drag = (Math.max(0, Math.sin(slopeDeg * DEG)) * PHYSICS.swimSlopeDragMps + (here.currentMps ?? 0)) * relief;
    const thrust = profile.speed * PHYSICS.swimSpeedMps;
    const swimTarget = thrust - drag - Math.min(0, Math.sin(slopeDeg * DEG)) * PHYSICS.swimSlopeDragMps * 0.5;
    const next = v + ((swimTarget - v) * DT_S) / PHYSICS.swimTauS;
    const load = Math.min(1.5, Math.abs(profile.speed) + drag / PHYSICS.swimSpeedMps);
    return { v: Math.abs(next) < 1e-3 ? 0 : next, slipPct: 0, load, accel: (next - v) / DT_S, swimming: true };
  }
  if (action === 'deploy_winch') {
    const next = v + ((PHYSICS.winchSpeedMps - v) * DT_S) / 0.3;
    return { v: next, slipPct: 0, load: 1, accel: (next - v) / DT_S };
  }
  const normal = m * G * Math.cos(slopeDeg * DEG);
  const gravity = m * G * Math.sin(slopeDeg * DEG);
  const traction = frictionCoefficient(state, terrain, profile.grip) * normal;
  const mudFactor = state.environment.weather === 'rain' && terrain === 'mud' ? TUNING.weather.rain.mudSinkageFactor : 1;
  const sink = TERRAINS[terrain].sinkage * spec.sinkageFactor * (m / PHYSICS.refMassKg) * mudFactor;
  const resistance = (TERRAINS[terrain].rollingResistance + PHYSICS.sinkageDrag * sink * profile.drag) * normal;
  const target = profile.speed * spec.topSpeedMps;
  const motorMax = spec.motorForceN * profile.force;
  const direction = target !== 0 ? Math.sign(target) : Math.sign(v);
  const requested = clamp((m * (target - v)) / PHYSICS.throttleTauS + gravity + direction * resistance, -motorMax, motorMax);
  const drive = clamp(requested, -traction, traction);
  const slipPct = Math.abs(requested) > traction && Math.abs(requested) > 1e-6 ? (1 - traction / Math.abs(requested)) * 100 : 0;
  const push = drive - gravity;
  let next: number;
  if (Math.abs(v) < 1e-3) {
    next = Math.abs(push) <= resistance ? 0 : ((push - Math.sign(push) * resistance) / m) * DT_S;
  } else {
    next = v + ((push - Math.sign(v) * resistance) / m) * DT_S;
    if (Math.sign(next) !== Math.sign(v) && Math.abs(push) <= resistance) next = 0;
  }
  const cap = spec.topSpeedMps * 1.2;
  next = clamp(next, -cap, cap);
  const load = action === 'brake' ? 0 : Math.min(1, Math.abs(requested) / spec.motorForceN);
  return { v: next, slipPct, load, accel: (next - v) / DT_S };
}

function powerW(state: RunState, action: Action, load: number, swimming: boolean): number {
  const { spec } = state;
  if (swimming) return spec.basePowerW + spec.thrusterPowerW * load;
  if (action === 'brake') return spec.basePowerW;
  const motor = spec.motorPowerW * (PHYSICS.idleLoad + (1 - PHYSICS.idleLoad) * load) * ACTION_PROFILES[action].power;
  return spec.basePowerW + motor + (action === 'deploy_winch' ? spec.winchPowerW : 0);
}

function addDamage(stats: RunStats, damage: StepDamage): RunStats {
  const byCause = { ...stats.damageByCause, [damage.cause]: (stats.damageByCause[damage.cause] ?? 0) + damage.amountPct };
  const worst = stats.worstImpact;
  const isWorst = damage.cause === 'impact' && (damage.obstacle !== undefined || damage.roughEntry !== undefined) && (!worst || damage.amountPct > worst.amountPct);
  return {
    ...stats,
    damageByCause: byCause,
    worstImpact: isWorst
      ? { obstacle: damage.obstacle, roughEntry: damage.roughEntry, speedMps: damage.speedMps ?? 0, amountPct: damage.amountPct }
      : worst,
  };
}

function effectsFor(terrain: TerrainId, v: number, slipPct: number, damage: number, action: Action, sparks: boolean, submergedM: number): SimEffect[] {
  const moving = Math.abs(v) > 0.3;
  const effects: SimEffect[] = [];
  if (terrain === 'sand' && moving) effects.push('dust');
  if (terrain === 'water' && moving && submergedM < 0.1) effects.push('splash');
  if (submergedM >= 0.1) effects.push('bubbles');
  if (terrain === 'mud' && moving) effects.push('mud_spray');
  if (sparks) effects.push('sparks');
  if (slipPct > PHYSICS.slipEffectPct) effects.push('slip');
  if (damage > PHYSICS.smokeAboveDamagePct) effects.push('smoke');
  if (action === 'deploy_winch') effects.push('winch');
  return effects;
}

/** Advances one fixed timestep (TUNING.dtMs) under the given action. Pure. */
export function step(state: RunState, action: Action): RunState {
  if (state.done) return state;
  const { world, spec, sim } = state;
  const segment = world.segments[state.segmentIndex]!;
  const terrainId = segment.terrain;
  const profile = ACTION_PROFILES[action];
  const motion = driveMotion(state, action, terrainId, segment.slopeDeg);

  let v = motion.v;
  let x = sim.x + v * DT_S;
  if (x <= 0) {
    x = 0;
    v = Math.max(v, 0);
  }

  // Damage: one cause per step (the largest), so events stay simple.
  let hit: StepDamage | undefined;
  for (const obstacle of world.obstacles) {
    if (sim.x < obstacle.xM && x >= obstacle.xM) {
      const speed = Math.abs(v);
      const amountPct =
        Math.max(0, speed - PHYSICS.safeImpactSpeedMps) * PHYSICS.obstacleHardness[obstacle.kind] * PHYSICS.impactDamagePerMps *
        (0.5 + TERRAINS[terrainId].impactRisk) * spec.impactDamageFactor * profile.impact *
        (terrainId === 'water' && segment.depthCm > spec.maxWadingDepthCm ? PHYSICS.submergedImpactFactor : 1);
      hit = { cause: 'impact', amountPct, obstacle: obstacle.kind, speedMps: speed };
      v *= profile.impact < 1 ? 0.9 : 0.5;
    }
  }
  const entered = world.segments[segmentIndexAt(world, x, state.segmentIndex)]!;
  if (!hit && entered.index > segment.index && entered.terrain !== terrainId && TERRAINS[entered.terrain].impactRisk >= PHYSICS.roughTerrainRisk) {
    const speed = Math.abs(v);
    const amountPct = Math.max(0, speed - PHYSICS.roughEntrySafeMps) * PHYSICS.roughEntryDamagePerMps * spec.roughGroundFactor * spec.impactDamageFactor * profile.impact;
    if (amountPct > 0) {
      hit = { cause: 'impact', amountPct, roughEntry: entered.terrain, speedMps: speed };
      v *= 0.7;
    }
  }
  let stats = state.stats;
  let damage = sim.damage;
  let lastDamage: StepDamage | undefined;
  const apply = (entry: StepDamage): void => {
    if (entry.amountPct <= 0) return;
    damage += entry.amountPct;
    stats = addDamage(stats, entry);
    if (!lastDamage || entry.amountPct > lastDamage.amountPct) lastDamage = entry;
  };
  if (hit) apply(hit);
  const depthCm = waterDepthCmAt(segment, sim.x);
  if (!spec.waterproof && depthCm > 0) {
    const flooded = terrainId === 'water' && depthCm > PHYSICS.hullHeightM * 100 ? PHYSICS.floodedDamageFactor : 1;
    apply({ cause: 'water', amountPct: TERRAINS[terrainId].waterDamage * (depthCm / 10) * flooded * DT_S });
  }
  const overSlope = Math.abs(segment.slopeDeg) - spec.maxSlopeDeg;
  if (overSlope > 0 && action !== 'climb_mode' && action !== 'deploy_winch') {
    apply({ cause: 'tip_over', amountPct: overSlope * PHYSICS.tipDamagePerDegS * (0.5 + Math.abs(v)) * DT_S });
  }
  damage = Math.min(100, damage);

  const capacityFactor = state.environment.weather === 'cold' ? TUNING.weather.cold.batteryCapacityFactor : 1;
  const capacityJ = spec.capacityWh * capacityFactor * 3600;
  const battery = Math.max(0, sim.battery - ((powerW(state, action, motion.load, motion.swimming === true) * DT_S) / capacityJ) * 100);

  const stepCount = state.stepCount + 1;
  const t = Math.round(stepCount * TUNING.dtMs) / 1000;
  if (motion.slipPct > PHYSICS.slipEffectPct) {
    stats = { ...stats, slipSByTerrain: { ...stats.slipSByTerrain, [terrainId]: (stats.slipSByTerrain[terrainId] ?? 0) + DT_S } };
  }
  if (stats.lastTerrain !== terrainId) stats = { ...stats, lastTerrain: terrainId };

  const progressed = x > state.bestX + 0.02;
  const bestX = progressed ? x : state.bestX;
  const lastProgressT = progressed ? t : state.lastProgressT;

  const finished = x >= world.lengthM;
  const dnfReason = finished
    ? undefined
    : damage >= 100 ? 'damage'
    : battery <= 0 ? 'battery'
    : t - lastProgressT >= PHYSICS.stuckAfterS ? 'stuck'
    : t >= TUNING.maxRunS ? 'timeout'
    : undefined;

  const segmentIndex = segmentIndexAt(world, x, state.segmentIndex);
  const nextSegment = world.segments[segmentIndex]!;
  const sparksUntilT = hit && hit.amountPct > 0 ? t + PHYSICS.sparksS : state.sparksUntilT;
  const spinSpeed = motion.slipPct > 0 ? profile.speed * spec.topSpeedMps : v;
  const nextDepthM = nextSegment.terrain === 'water' ? waterDepthCmAt(nextSegment, x) / 100 : 0;
  // The hull is about this tall: it is under water once the depth passes it.
  const submergedDepthM = Math.max(0, nextDepthM - PHYSICS.hullHeightM);

  return {
    ...state,
    sim: {
      t,
      x: finished ? world.lengthM : x,
      v,
      slopeDeg: nextSegment.slopeDeg,
      pitch: nextSegment.slopeDeg + clamp(-motion.accel * 1.5, -8, 8),
      wheelSpin: spinSpeed / WHEEL_RADIUS_M,
      terrain: nextSegment.terrain,
      battery,
      damage,
      effects: effectsFor(nextSegment.terrain, v, motion.slipPct, damage, action, t < sparksUntilT, submergedDepthM),
      ...(nextDepthM > 0 ? { waterDepthM: nextDepthM, submergedDepthM, thrusting: motion.swimming === true && Math.abs(v) > 0.05, ...(nextSegment.currentMps ? { waterCurrentMps: nextSegment.currentMps } : {}) } : {}),
    },
    action,
    segmentIndex,
    done: finished || dnfReason !== undefined,
    stepCount,
    slipPct: motion.slipPct,
    bestX,
    lastProgressT,
    sparksUntilT,
    stallS: profile.speed > 0 && Math.abs(v) < PHYSICS.stallSpeedMps ? state.stallS + DT_S : 0,
    finished,
    dnfReason,
    lastDamage,
    stats,
  };
}

/** Sets the action the following steps run under and marks the decision time. */
export function withAction(state: RunState, action: Action): RunState {
  return { ...state, action };
}

export function markDecision(state: RunState): RunState {
  return { ...state, lastDecisionT: state.sim.t };
}
