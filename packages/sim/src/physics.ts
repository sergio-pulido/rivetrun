import type { Action, Environment, Obstacle, SimEffect, SimState, TerrainId } from '@rivetrun/contracts';
import { TERRAINS, TUNING } from './data';
import { mixSeed, nextRandom } from './rng';
import { WHEEL_RADIUS_M, deriveSpec } from './spec';
import type { AirEvent, RunConfig, RunState, RunStats, StepDamage } from './types';
import { DROP_APPROACH_M, compileTrack, obstacleHeightAt, segmentIndexAt, waterDepthCmAt } from './world';
import type { World, WorldFeature } from './world';
import { airDragN, canScan, capacityFactor, gustAt, hasWind, headwindMps } from './weather';

const G = 9.81;
const DT_S = TUNING.dtMs / 1000;
const DEG = Math.PI / 180;

/** Scan zones: how close the nose must be to the zone, how slow, for how long; what a miss costs and a centred stop earns. */
export const SCAN_RULES = { reachM: 0.3, maxSpeedMps: 0.1, holdS: 1.5, missPenaltyS: 10, centredM: 0.25, centredBonus: 15 } as const;

/** Physics constants. v0 values. */
export const PHYSICS = {
  /** Speed controller time constant, seconds. */
  throttleTauS: 0.4,
  refMassKg: 3,
  sinkageDrag: 0.3,
  /** Impacts below this speed do no damage. */
  /** Gameplay v3: contact at or below the safe speed is free; above it damage grows with (v − v_safe)². */
  safeImpactSpeedMps: 0.6,
  impactDamagePerMps2: 5,
  /** A bumper raises the safe speed; so does ground clearance, for obstacles the wheels roll over. */
  bumperSafeSpeedFactor: 1.5,
  refClearanceCm: 7.5,
  /** Wheelspin: once the drive asks for more than the ground gives, only this share of the grip is left. */
  kineticGripFactor: 0.7,
  /** The drive has to ask for this much more than the grip before the wheels break loose. */
  spinMargin: 1.1,
  /** Scales what the drive draws (wheels, thrusters, winch), so that pace decides whether a small battery reaches the finish. */
  /** Thrusters, tuned apart from the wheels: M6 is a 65 m swim. */
  thrustEnergyScale: 1.2,
  driveEnergyScale: 3.5,
  obstacleHardness: { step: 1, log: 1.5, rock: 1.6 } satisfies Record<Obstacle, number>,
  tipDamagePerDegS: 1.5,
  stuckAfterS: 8,
  winchSpeedMps: 0.6,
  slipEffectPct: 25,
  smokeAboveDamagePct: 50,
  sparksS: 0.4,
  idleLoad: 0.15,
  stallSpeedMps: 0.15,
  /** Rolling backwards faster than this without asking to reverse counts as not getting anywhere. */
  rollbackMps: 0.2,
  // Height (gameplay v2).
  /** Slower than this at a ramp lip and the robot just drops off it. */
  minLaunchMps: 0.3,
  /** Landings softer than this are free. */
  safeLandingMps: 4.5,
  landingDamagePerMps2: 10,
  /** Margin above an obstacle's top at which an airborne robot passes over it. */
  obstacleClearM: 0.02,
  /** Wheels roll straight over gaps this narrow. */
  gapRollOverM: 0.15,
  fallDamagePct: 15,
  fallPenaltyS: 5,
  maxFalls: 3,
  respawnRunUpM: 3,
  /** An armed piston waits for a gap or obstacle this far beyond its reach. */
  jumpArmRangeM: 2,
  /** Climb mode lifts the nose: this much more clearance over an obstacle. */
  climbClearanceFactor: 1.3,
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
  roughEntryDamagePerMps2: 45,
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
  // Throttle levels. `power` is the motor's draw at that level: full throttle pushes the motor past its efficient
  // range, so per metre steady costs about 70 % of full and ease about 57 %. Brakes and coast draw nothing.
  cruise: { ...DEFAULT_PROFILE, speed: 0.7, power: 0.5 },
  accelerate: { ...DEFAULT_PROFILE, speed: 1 },
  slow_down: { ...DEFAULT_PROFILE, speed: 0.35, power: 0.2 },
  brake: { ...DEFAULT_PROFILE, speed: 0, power: 0 },
  reverse: { ...DEFAULT_PROFILE, speed: -0.35 },
  climb_mode: { speed: 0.45, force: 1.6, grip: 1.5, power: 0.7, impact: 0.3, drag: 0.6 },
  deploy_winch: { speed: 0, force: 1, grip: 1, power: 0.3, impact: 0.1, drag: 1 },
  // Drives like cruise; the piston fires from step() (timed to the next gap unless a player drives).
  jump: { ...DEFAULT_PROFILE, speed: 0.7 },
  // Gameplay v3. Coast: no drive force, the ground slows the robot. Soft brake: 40 % of the braking force.
  coast: { ...DEFAULT_PROFILE, speed: 0, force: 0, power: 0 },
  brake_soft: { ...DEFAULT_PROFILE, speed: 0, force: 0.4, power: 0 },
  // Scan: hold still on the zone (the scan itself is timed in step()).
  scan: { ...DEFAULT_PROFILE, speed: 0, power: 0 },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function createEnvironment(config: RunConfig, seed: number): Environment {
  const jitterRoll = nextRandom(mixSeed(seed, 1)).value;
  const jitter = TUNING.practice.frictionJitter;
  return {
    weather: config.mission.weather,
    frictionJitter: config.mission.fixedSeed === undefined ? 1 + (jitterRoll * 2 - 1) * jitter : 1,
    sensorNoiseSeed: mixSeed(seed, 2),
    ...(config.mission.conditions ? { conditions: config.mission.conditions } : {}),
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
    heightM: 0,
    vy: 0,
    airborne: false,
    airStartT: 0,
    falls: 0,
    jumpReadyT: 0,
    drawW: 0,
    lastStallT: -1,
    stoppedS: 0,
    scans: { done: [], missed: [], holdS: 0, centred: 0 },
    brain: {
      hazardSeenX: -1, hazardReachedX: -1, gapSeenX: -1, gapReachedX: -1, terrainSeenX: -1, zonesSeen: [], zonesReached: [],
      slipping: false, gusting: false, tiltBand: 0, energyLow: false, stallMark: 0, stopTold: false, jumpReady: true, damageStep: 0,
    },
    finished: false,
    stats: { slipSByTerrain: {}, slipLostS: 0, landingDamage: 0, fallDamage: 0, damageByCause: {}, lastTerrain: first.terrain },
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
  // Wind: drag on the air speed over the body. Zero on missions without wind.
  const air = airDragN(state.environment, state.sim.t, v);
  const requested = clamp((m * (target - v)) / (PHYSICS.throttleTauS * spec.throttleLag) + gravity + air + direction * resistance, -motorMax, motorMax);
  // Past the limit the wheels spin: the ground gives back only the kinetic share of its grip.
  // Climb mode is the crawl gear with traction control: it never asks for more than the ground gives.
  const spinning = Math.abs(requested) > traction * PHYSICS.spinMargin && action !== 'climb_mode';
  const limit = spinning ? traction * PHYSICS.kineticGripFactor : traction;
  const drive = clamp(requested, -limit, limit);
  const slipPct = Math.abs(requested) > traction && Math.abs(requested) > 1e-6 ? (1 - traction / Math.abs(requested)) * 100 : 0;
  const push = drive - gravity - air;
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
  // Thrusters have the same efficiency curve as the wheels: easing off costs less per metre swum.
  if (swimming) return spec.basePowerW + spec.thrusterPowerW * load * (ACTION_PROFILES[action].power || 1) * PHYSICS.thrustEnergyScale;
  if (ACTION_PROFILES[action].power === 0) return spec.basePowerW;
  const motor = spec.motorPowerW * (PHYSICS.idleLoad + (1 - PHYSICS.idleLoad) * load) * ACTION_PROFILES[action].power;
  return spec.basePowerW + (motor + (action === 'deploy_winch' ? spec.winchPowerW : 0)) * PHYSICS.driveEnergyScale;
}

function addDamage(stats: RunStats, damage: StepDamage): RunStats {
  const byCause = { ...stats.damageByCause, [damage.cause]: (stats.damageByCause[damage.cause] ?? 0) + damage.amountPct };
  const worst = stats.worstImpact;
  const isWorst = damage.cause === 'impact' && (damage.obstacle !== undefined || damage.roughEntry !== undefined || damage.air !== undefined) && (!worst || damage.amountPct > worst.amountPct);
  return {
    ...stats,
    landingDamage: stats.landingDamage + (damage.air === 'landing' ? damage.amountPct : 0),
    fallDamage: stats.fallDamage + (damage.air === 'fall' ? damage.amountPct : 0),
    damageByCause: byCause,
    worstImpact: isWorst
      ? { obstacle: damage.obstacle, roughEntry: damage.roughEntry, air: damage.air, blocked: damage.blocked, speedMps: damage.speedMps ?? 0, amountPct: damage.amountPct }
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

/** Contact speed at or below which this build takes no damage from an obstacle: the bumper and the clearance raise it. */
export function safeContactSpeedMps(spec: RunState['spec'], _kind?: Obstacle): number {
  const bumper = spec.impactDamageFactor < 1 ? PHYSICS.bumperSafeSpeedFactor : 1;
  const clearance = clamp(spec.clearanceCm / PHYSICS.refClearanceCm, 0.8, 1.3);
  return Math.round(PHYSICS.safeImpactSpeedMps * bumper * clearance * 100) / 100;
}

/** How close to an obstacle's face a stopped robot sits. */
const BLOCK_GAP_M = 0.005;

const rampAt = (world: World, xM: number): Extract<WorldFeature, { type: 'ramp' }> | undefined =>
  world.features.find((f): f is Extract<WorldFeature, { type: 'ramp' }> => f.type === 'ramp' && xM >= f.startM && xM < f.endM);

/** The gap x is over, ignoring a sliver at the near edge that wheels simply roll across. */
const gapAt = (world: World, xM: number): WorldFeature | undefined =>
  world.features.find((f) => f.type === 'gap' && f.endM - f.startM > PHYSICS.gapRollOverM && xM > f.startM + PHYSICS.gapRollOverM && xM < f.endM);

/** Airtime of a piston jump from flat ground, seconds. */
export const jumpAirtimeS = (impulseMps: number): number => (2 * impulseMps) / G;

/**
 * How far before the next gap (or obstacle) an armed piston should fire so the arc is centred on it.
 * null = nothing worth timing for: fire now.
 */
function jumpLeadM(state: RunState, v: number): { readonly targetM: number; readonly leadM: number } | null {
  const reach = Math.abs(v) * jumpAirtimeS(state.spec.jumpImpulseMps);
  const x = state.sim.x;
  // A gap comes first: the piston is saved for it if it would not have re-armed in time after a hop over an obstacle.
  const saveFor = reach + PHYSICS.jumpArmRangeM + Math.abs(v) * state.spec.jumpCooldownS;
  const gap = state.world.features.find((f) => f.type === 'gap' && f.endM > x && f.startM - x <= saveFor);
  if (gap) return { targetM: gap.startM, leadM: Math.max(0.05, (reach - (gap.endM - gap.startM)) / 2) };
  const obstacle = state.world.obstacles.find((o) => o.xM > x && o.xM - x <= reach + PHYSICS.jumpArmRangeM);
  if (obstacle) return { targetM: obstacle.xM, leadM: reach / 2 };
  return null;
}

/** Advances one fixed timestep (TUNING.dtMs) under the given action. Pure. */
export function step(state: RunState, action: Action): RunState {
  if (state.done) return state;
  const { world, spec, sim } = state;
  const segment = world.segments[state.segmentIndex]!;
  const terrainId = segment.terrain;
  const profile = ACTION_PROFILES[action];
  const wasAirborne = state.airborne;
  const ramp = wasAirborne ? undefined : rampAt(world, sim.x);
  const slopeDeg = segment.slopeDeg + (ramp ? ramp.launchDeg : 0);
  const motion: Motion = wasAirborne
    ? { v: sim.v, slipPct: 0, load: 0, accel: 0 }
    : driveMotion(state, action, terrainId, slopeDeg);

  let v = motion.v;
  let x = sim.x + v * DT_S;
  if (x <= 0) {
    x = 0;
    v = Math.max(v, 0);
  }

  // Height: ballistic while airborne, otherwise ramps, drops, gaps and the piston decide whether we leave the ground.
  let airborne = wasAirborne;
  let heightM = state.heightM;
  let vy = state.vy;
  let airStartT = state.airStartT;
  let jumpReadyT = state.jumpReadyT;
  let falls = state.falls;
  let lastAir: AirEvent | undefined;
  let landing: StepDamage | undefined;
  let fell: Extract<WorldFeature, { type: 'gap' }> | undefined;
  let jumpJ = 0;
  const takeOff = (cause: 'ramp' | 'jump' | 'drop', fromHeightM: number, verticalMps: number): void => {
    airborne = true;
    heightM = fromHeightM;
    vy = verticalMps;
    airStartT = sim.t;
    lastAir = { type: 'airborne', cause };
  };
  const afloat = terrainId === 'water' && waterDepthCmAt(segment, sim.x) > spec.maxWadingDepthCm;
  if (wasAirborne) {
    vy -= G * DT_S;
    heightM += vy * DT_S;
  } else if (ramp && x >= ramp.endM) {
    const launchRad = ramp.launchDeg * DEG;
    if (Math.abs(v) >= PHYSICS.minLaunchMps) {
      takeOff('ramp', ramp.heightM, v * Math.sin(launchRad));
      v *= Math.cos(launchRad);
    } else {
      takeOff('drop', ramp.heightM, 0);
    }
  } else {
    const drop = world.features.find((f) => f.type === 'drop' && sim.x < f.startM && x >= f.startM);
    if (drop && drop.type === 'drop') takeOff('drop', drop.heightM, 0);
  }
  if (!airborne && action === 'jump' && spec.jumpImpulseMps > 0 && sim.t >= jumpReadyT && !afloat) {
    const timing = state.config.manual ? null : jumpLeadM(state, v);
    if (!timing || timing.targetM - x <= timing.leadM) {
      takeOff('jump', ramp ? (x - ramp.startM) * Math.tan(ramp.launchDeg * DEG) : 0, spec.jumpImpulseMps);
      jumpReadyT = sim.t + spec.jumpCooldownS;
      jumpJ = spec.jumpPowerW;
    }
  }
  if (airborne && wasAirborne && heightM <= 0) {
    const gap = gapAt(world, x);
    if (gap && gap.type === 'gap') {
      fell = gap;
    } else {
      const impactMps = Math.abs(vy);
      const amountPct = Math.max(0, impactMps - PHYSICS.safeLandingMps) ** 2 * PHYSICS.landingDamagePerMps2 * spec.impactDamageFactor;
      landing = { cause: 'impact', amountPct, air: 'landing', speedMps: impactMps };
      lastAir = { type: 'landed', impactMps, airtimeS: Math.max(0, sim.t + DT_S - airStartT), damagePct: amountPct };
    }
    airborne = false;
    heightM = 0;
    vy = 0;
  } else if (!airborne) {
    const gap = gapAt(world, x);
    if (gap && gap.type === 'gap') fell = gap;
  }

  // Damage: one cause per step (the largest), so events stay simple.
  let hit: StepDamage | undefined;
  let blockedBy: RunState['blockedBy'];
  const reachCm = spec.clearanceCm * (action === 'climb_mode' ? PHYSICS.climbClearanceFactor : 1);
  for (const obstacle of world.obstacles) {
    // In the air an obstacle is cleared when the robot is above its top, not above a fixed height.
    const cleared = (wasAirborne || airborne) && Math.min(state.heightM, heightM) >= obstacle.heightM + PHYSICS.obstacleClearM;
    if (sim.x < obstacle.xM && x >= obstacle.xM && !cleared) {
      const speed = Math.abs(v);
      // Too tall to roll over: the robot stops against its near face. The winch hauls it over anything.
      const stopped = obstacle.heightM * 100 > reachCm && action !== 'deploy_winch';
      const amountPct =
        Math.max(0, speed - safeContactSpeedMps(spec, obstacle.kind)) ** 2 * PHYSICS.obstacleHardness[obstacle.kind] * PHYSICS.impactDamagePerMps2 *
        (0.5 + TERRAINS[terrainId].impactRisk) * spec.impactDamageFactor * spec.obstacleImpactFactor * profile.impact *
        (terrainId === 'water' && segment.depthCm > spec.maxWadingDepthCm ? PHYSICS.submergedImpactFactor : 1);
      hit = { cause: 'impact', amountPct, obstacle: obstacle.kind, speedMps: speed, ...(stopped ? { blocked: true } : {}) };
      if (stopped) {
        x = obstacle.xM - BLOCK_GAP_M;
        v = 0;
        blockedBy = obstacle.kind;
      } else {
        v *= profile.impact < 1 ? 0.9 : 0.5;
      }
    }
  }
  const entered = world.segments[segmentIndexAt(world, x, state.segmentIndex)]!;
  if (!hit && !airborne && !wasAirborne && entered.index > segment.index && entered.terrain !== terrainId && TERRAINS[entered.terrain].impactRisk >= PHYSICS.roughTerrainRisk) {
    const speed = Math.abs(v);
    const amountPct =
      Math.max(0, speed - PHYSICS.roughEntrySafeMps) ** 2 * PHYSICS.roughEntryDamagePerMps2 * spec.roughGroundFactor * spec.impactDamageFactor *
      spec.obstacleImpactFactor * profile.impact;
    if (amountPct > 0) {
      hit = { cause: 'impact', amountPct, roughEntry: entered.terrain, speedMps: speed };
      v *= 0.7;
    }
  }
  // Still pressed against the obstacle that stopped it, and still unable to get over it.
  if (!blockedBy && state.blockedBy && !airborne && profile.speed > 0) {
    const face = world.obstacles.find((o) => o.xM > x && o.xM - x <= BLOCK_GAP_M * 4);
    if (face && face.heightM * 100 > reachCm && action !== 'deploy_winch') blockedBy = face.kind;
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
  if (landing) apply(landing);
  const depthCm = waterDepthCmAt(segment, sim.x);
  const overWater = (wasAirborne || airborne) && heightM > PHYSICS.hullHeightM;
  if (!spec.waterproof && depthCm > 0 && !overWater) {
    const flooded = terrainId === 'water' && depthCm > PHYSICS.hullHeightM * 100 ? PHYSICS.floodedDamageFactor : 1;
    apply({ cause: 'water', amountPct: TERRAINS[terrainId].waterDamage * (depthCm / 10) * flooded * DT_S });
  }
  const overSlope = Math.abs(segment.slopeDeg) - spec.maxSlopeDeg;
  if (overSlope > 0 && !wasAirborne && action !== 'climb_mode' && action !== 'deploy_winch') {
    apply({ cause: 'tip_over', amountPct: overSlope * PHYSICS.tipDamagePerDegS * (0.5 + Math.abs(v)) * DT_S });
  }

  // A fall costs hull and time, and puts the robot back with a run-up. The third one ends the run.
  let stepCount = state.stepCount + 1;
  if (fell) {
    falls += 1;
    const fromX = x;
    const lip = world.features.find((f) => f.type === 'ramp' && Math.abs(f.endM - fell!.startM) < 1e-6);
    const respawnX = Math.max(0, (lip ? lip.startM : fell.startM) - PHYSICS.respawnRunUpM);
    apply({ cause: 'impact', amountPct: PHYSICS.fallDamagePct, air: 'fall', speedMps: Math.abs(v) });
    x = respawnX;
    v = 0;
    airborne = false;
    heightM = 0;
    vy = 0;
    stepCount += Math.round((PHYSICS.fallPenaltyS * 1000) / TUNING.dtMs);
    lastAir = { type: 'fell', falls, respawnX, fromX };
  }
  damage = Math.min(100, damage);

  const capacityJ = spec.capacityWh * capacityFactor(state.environment) * 3600;
  const drawJ = (wasAirborne ? spec.basePowerW : powerW(state, action, motion.load, motion.swimming === true)) * DT_S + jumpJ;
  const battery = Math.max(0, sim.battery - (drawJ / capacityJ) * 100);
  const touched = world.obstacles.find((o) => hit?.obstacle !== undefined && sim.x < o.xM && o.xM - sim.x < 1);

  const t = Math.round(stepCount * TUNING.dtMs) / 1000;
  if (motion.slipPct > PHYSICS.slipEffectPct) {
    stats = { ...stats, slipLostS: stats.slipLostS + DT_S * (motion.slipPct / 100), slipSByTerrain: { ...stats.slipSByTerrain, [terrainId]: (stats.slipSByTerrain[terrainId] ?? 0) + DT_S } };
  }

  // Scan zones: hold still on the zone for the hold time with a sensor it accepts. Driving past it is a miss.
  let scans = state.scans.justDone ? { ...state.scans, justDone: undefined } : state.scans;
  let scanning: { zoneId: string; progress: number } | undefined;
  for (const zone of state.config.mission.scanZones ?? []) {
    if (scans.done.includes(zone.id) || scans.missed.includes(zone.id)) continue;
    const offset = x - zone.atM;
    const able = canScan(spec, state.environment, zone);
    if (offset > zone.halfLengthM + SCAN_RULES.reachM) {
      scans = { ...scans, missed: [...scans.missed, zone.id], holdS: 0 };
    } else if (able && !airborne && Math.abs(offset) <= zone.halfLengthM + SCAN_RULES.reachM && Math.abs(v) < SCAN_RULES.maxSpeedMps) {
      const holdS = scans.holdS + DT_S;
      if (holdS >= SCAN_RULES.holdS) {
        scans = { ...scans, done: [...scans.done, zone.id], holdS: 0, justDone: zone.label, centred: scans.centred + (Math.abs(offset) <= SCAN_RULES.centredM ? 1 : 0) };
      } else {
        scans = { ...scans, holdS };
        scanning = { zoneId: zone.id, progress: holdS / SCAN_RULES.holdS };
      }
    } else if (scans.holdS > 0 && Math.abs(offset) <= zone.halfLengthM + SCAN_RULES.reachM) {
      scans = { ...scans, holdS: 0 };
    }
  }
  if (stats.lastTerrain !== terrainId) stats = { ...stats, lastTerrain: terrainId };

  const progressed = x > state.bestX + 0.02;
  const bestX = progressed ? x : state.bestX;
  // Stuck means not getting anywhere: a robot climbing back after a slide is moving forward, so it is not stuck.
  const lastProgressT = progressed || fell || airborne || v >= PHYSICS.rollbackMps ? t : state.lastProgressT;

  const finished = x >= world.lengthM;
  const dnfReason = finished
    ? undefined
    : damage >= 100 ? 'damage'
    : battery <= 0 ? 'battery'
    : falls >= PHYSICS.maxFalls ? 'stuck'
    : t - lastProgressT >= PHYSICS.stuckAfterS ? 'stuck'
    : t >= TUNING.maxRunS ? 'timeout'
    : undefined;

  const segmentIndex = segmentIndexAt(world, x, fell ? 0 : state.segmentIndex);
  const nextSegment = world.segments[segmentIndex]!;
  const sparksUntilT = (hit && hit.amountPct > 0) || (landing && landing.amountPct > 0) || fell ? t + PHYSICS.sparksS : state.sparksUntilT;
  const spinSpeed = motion.slipPct > 0 ? profile.speed * spec.topSpeedMps : v;
  const nextDepthM = nextSegment.terrain === 'water' ? waterDepthCmAt(nextSegment, x) / 100 : 0;
  // The hull is about this tall: it is under water once the depth passes it.
  const submergedDepthM = airborne ? 0 : Math.max(0, nextDepthM - PHYSICS.hullHeightM);
  const nextRamp = airborne ? undefined : rampAt(world, x);
  // The ground the wheels stand on: a ramp, the deck before a drop, or the back of an obstacle.
  const bump = airborne ? { heightM: 0, slopeDeg: 0 } : obstacleHeightAt(world.obstacles, x);
  const deck = airborne ? undefined : world.features.find((f) => f.type === 'drop' && x < f.startM && f.startM - x <= DROP_APPROACH_M);
  const deckHeightM = deck && deck.type === 'drop' ? deck.heightM * (1 - (deck.startM - x) / DROP_APPROACH_M) : 0;
  const rampHeightM = nextRamp ? (x - nextRamp.startM) * Math.tan(nextRamp.launchDeg * DEG) : 0;
  const groundHeightM = Math.max(rampHeightM, deckHeightM, bump.heightM);
  const shownHeightM = airborne ? Math.max(0, heightM) : groundHeightM;
  const surfaceSlopeDeg = nextSegment.slopeDeg + (nextRamp ? nextRamp.launchDeg : 0) + bump.slopeDeg;
  const pitch = airborne
    ? clamp(Math.atan2(vy, Math.max(0.2, Math.abs(v))) / DEG, -35, 35)
    : surfaceSlopeDeg + clamp(-motion.accel * 1.5, -8, 8);

  return {
    ...state,
    sim: {
      t,
      x: finished ? world.lengthM : x,
      v,
      slopeDeg: surfaceSlopeDeg,
      pitch,
      wheelSpin: spinSpeed / WHEEL_RADIUS_M,
      terrain: nextSegment.terrain,
      battery,
      damage,
      effects: effectsFor(nextSegment.terrain, airborne ? 0 : v, motion.slipPct, damage, action, t < sparksUntilT, submergedDepthM),
      ...(shownHeightM > 0 || airborne ? { heightM: shownHeightM, vy: airborne ? vy : 0, airborne } : {}),
      ...(blockedBy ? { blockedBy } : {}),
      ...(hasWind(state.environment) ? { windMps: Math.round(headwindMps(state.environment, t) * 10) / 10, gust: gustAt(state.environment, t) > 0 } : {}),
      ...(scanning ? { scan: scanning } : {}),
      ...((state.config.mission.scanZones ?? []).length > 0 ? { scansDone: scans.done.length, scansMissed: scans.missed.length } : {}),
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
    // Commanded forward and not getting anywhere: standing still or sliding back.
    stallS: !airborne && ((profile.speed > 0 && v < PHYSICS.stallSpeedMps) || (action !== 'reverse' && v < -PHYSICS.rollbackMps)) ? state.stallS + DT_S : 0,
    heightM: airborne ? heightM : 0,
    vy: airborne ? vy : 0,
    airborne,
    airStartT,
    falls,
    jumpReadyT,
    lastAir,
    blockedBy,
    scans,
    drawW: drawJ / DT_S,
    lastStallT: state.stallS >= 1 ? t : state.lastStallT,
    stoppedS: !airborne && profile.speed === 0 && Math.abs(v) < PHYSICS.stallSpeedMps ? state.stoppedS + DT_S : 0,
    ...(hit?.obstacle && touched ? { lastContact: { atM: touched.xM, t, kind: hit.obstacle } } : {}),
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
