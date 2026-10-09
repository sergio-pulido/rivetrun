import type { Action, BrainQuestion, Build, DecisionTrigger, LookaheadEntry, Perception } from '@rivetrun/contracts';
import { TUNING } from './data';
import { mixSeed, mulberry32 } from './rng';
import { step } from './physics';
import { deriveSpec } from './spec';
import type { RunState } from './types';
import { waterDepthCmAt } from './world';
import type { World } from './world';

const NOISE = { droneDistanceM: 0.5, distanceM: 0.2, obstacleM: 0.1, slipPct: 3, tiltDeg: 0.5, depthCm: 1 } as const;
const ASSUMED_DEPTH_CM = 5;
const UNDERWATER_ULTRASONIC = { rangeFactor: 0.5, noiseFactor: 3 } as const;
/** Without an IMU, a robot that drives and does not move assumes it is on a hill this steep. */
// 8° is enough to rule out plain cruising on soft or icy ground without ruling out climb mode.
const STALL_INFERENCE = { afterS: 1, slopeDeg: 8 } as const;
const MIN_DECISION_GAP_S = 0.5;
const DAMAGE_DECISION_STEP_PCT = 5;
const ALL_ACTIONS: readonly Action[] = ['cruise', 'accelerate', 'slow_down', 'brake', 'reverse', 'climb_mode', 'deploy_winch'];

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function cameraRangeM(state: RunState): number | undefined {
  const range = state.spec.sensorRangeM.camera;
  if (range === undefined) return undefined;
  return state.environment.weather === 'rain' ? range * TUNING.weather.rain.cameraRangeFactor : range;
}

/** What the build's sensors report, with seeded noise. Never ground truth. */
export function perceive(state: RunState): Perception {
  const { world, spec, sim } = state;
  const random = mulberry32(mixSeed(state.environment.sensorNoiseSeed, state.stepCount));
  const noise = (amplitude: number): number => (random() * 2 - 1) * amplitude;
  const current = world.segments[state.segmentIndex]!;

  let terrainAhead: Perception['terrainAhead'] = 'unknown';
  let terrainAheadDistanceM: Perception['terrainAheadDistanceM'] = 'unknown';
  let terrainAheadSource: Perception['terrainAheadSource'];
  const droneRange = spec.sensorRangeM.scout_drone;
  // The drone flies above the rain; when both are fitted it wins on range.
  const cameraRange = droneRange ?? cameraRangeM(state);
  if (cameraRange !== undefined) {
    terrainAheadSource = droneRange !== undefined ? 'scout_drone' : 'camera';
    const change = world.segments.find(
      (segment) => segment.index > current.index && segment.terrain !== current.terrain && segment.startM - sim.x <= cameraRange,
    );
    const sameUntil = world.segments.slice(current.index).find((segment) => segment.terrain !== current.terrain);
    terrainAhead = change ? change.terrain : current.terrain;
    // Nothing different in range: the sensor only knows the current terrain goes on at least as far as it can see.
    const distance = change ? change.startM - sim.x : Math.min(cameraRange, (sameUntil ? sameUntil.startM : world.lengthM) - sim.x);
    terrainAheadDistanceM = round(Math.max(0, distance + noise(droneRange !== undefined ? NOISE.droneDistanceM : NOISE.distanceM)), 2);
  }

  let obstacleAheadM: Perception['obstacleAheadM'] = 'unknown';
  const ultrasonicRange = spec.sensorRangeM.ultrasonic;
  if (ultrasonicRange !== undefined) {
    // Under water the ultrasonic is degraded: shorter range, noisier echo.
    const submerged = (sim.submergedDepthM ?? 0) > 0;
    const range = submerged ? ultrasonicRange * UNDERWATER_ULTRASONIC.rangeFactor : ultrasonicRange;
    const jitter = submerged ? NOISE.obstacleM * UNDERWATER_ULTRASONIC.noiseFactor : NOISE.obstacleM;
    const obstacle = world.obstacles.find((o) => o.xM > sim.x && o.xM - sim.x <= range);
    obstacleAheadM = obstacle ? round(Math.max(0, obstacle.xM - sim.x + noise(jitter)), 2) : null;
  }

  const hasImu = spec.sensorRangeM.imu !== undefined;
  const slipPct = hasImu ? round(Math.min(100, Math.max(0, state.slipPct + noise(NOISE.slipPct))), 1) : 'unknown';
  const tiltDeg = hasImu ? round(current.slopeDeg + noise(NOISE.tiltDeg), 1) : 'unknown';

  let depthAheadCm: Perception['depthAheadCm'] = 'unknown';
  const moistureRange = spec.sensorRangeM.moisture;
  if (moistureRange !== undefined) {
    const deepest = world.segments
      .filter((segment) => segment.endM > sim.x && segment.startM - sim.x <= moistureRange)
      .reduce((max, segment) => Math.max(max, segment.depthCm), 0);
    depthAheadCm = deepest > 0 ? round(Math.max(0, deepest + noise(NOISE.depthCm)), 1) : 0;
  }

  return { terrainAhead, terrainAheadDistanceM, ...(terrainAheadSource ? { terrainAheadSource } : {}), obstacleAheadM, slipPct, tiltDeg, depthAheadCm };
}

/** The world as the robot believes it is: only what the sensors reported. */
function perceivedWorld(state: RunState, perceived: Perception): World {
  const current = state.world.segments[state.segmentIndex]!;
  const x = state.sim.x;
  const wet = (terrain: string): boolean => terrain === 'water' || terrain === 'mud';
  const depthFor = (terrain: string): number =>
    !wet(terrain) ? 0 : perceived.depthAheadCm === 'unknown' ? ASSUMED_DEPTH_CM : perceived.depthAheadCm;
  const blindSlopeDeg = state.stallS >= STALL_INFERENCE.afterS ? STALL_INFERENCE.slopeDeg : 0;
  const slopeDeg = perceived.tiltDeg === 'unknown' ? blindSlopeDeg : perceived.tiltDeg;
  const trueDepthCm = waterDepthCmAt(current, x);
  const afloat = current.terrain === 'water' && trueDepthCm > state.spec.maxWadingDepthCm;
  const far = x + 1000;
  const sees = perceived.terrainAhead !== 'unknown' && perceived.terrainAheadDistanceM !== 'unknown' && perceived.terrainAhead !== current.terrain;
  const boundary = sees ? x + (perceived.terrainAheadDistanceM as number) : far;
  const segments = [
    {
      index: 0, startM: 0, endM: Math.max(boundary, x + 0.01), terrain: current.terrain, slopeDeg,
      // A robot that is afloat knows it: the hull it is in is the one thing it does not need a probe for.
      depthCm: afloat ? trueDepthCm : depthFor(current.terrain),
      ...(afloat && current.currentMps ? { currentMps: current.currentMps } : {}),
    },
  ];
  if (sees && perceived.terrainAhead !== 'unknown') {
    segments.push({ index: 1, startM: segments[0]!.endM, endM: far, terrain: perceived.terrainAhead, slopeDeg: 0, depthCm: depthFor(perceived.terrainAhead) });
  }
  const obstacles =
    typeof perceived.obstacleAheadM === 'number'
      ? [{ xM: x + perceived.obstacleAheadM, kind: 'log' as const, segmentIndex: 0 }]
      : [];
  return { segments, obstacles, lengthM: far };
}

/** How far ahead the Brain simulates: further when a scout drone is fitted. */
export function lookaheadSeconds(state: RunState): number {
  return state.spec.sensorRangeM.scout_drone !== undefined ? TUNING.decision.droneLookaheadS : TUNING.decision.lookaheadS;
}

/** Forward-simulates each action for TUNING.decision.lookaheadS on the perceived state. */
export function lookahead(state: RunState, actions: readonly Action[]): LookaheadEntry[] {
  const steps = Math.round((lookaheadSeconds(state) * 1000) / TUNING.dtMs);
  const believed: RunState = {
    ...state,
    world: perceivedWorld(state, perceive(state)),
    environment: { ...state.environment, frictionJitter: 1 },
    segmentIndex: 0,
    done: false,
    lastProgressT: state.sim.t,
  };
  return actions.map((action) => {
    let future = believed;
    for (let i = 0; i < steps && !future.done; i += 1) future = step(future, action);
    return {
      action,
      progressM: round(future.sim.x - state.sim.x, 2),
      damagePct: round(Math.max(0, future.sim.damage - state.sim.damage), 2),
      energyPct: round(Math.max(0, state.sim.battery - future.sim.battery), 2),
    };
  });
}

/** Returns the trigger when `next` is a decision point, otherwise null. */
export function detectDecisionPoint(prev: RunState, next: RunState): DecisionTrigger | null {
  if (next.done) return null;
  const sinceLast = next.sim.t - next.lastDecisionT;
  if (next.lastDamage?.cause === 'impact') return 'damage';
  if (sinceLast < MIN_DECISION_GAP_S) return null;
  const step5 = (damage: number): number => Math.floor(damage / DAMAGE_DECISION_STEP_PCT);
  if (step5(next.sim.damage) > step5(prev.sim.damage)) return 'damage';

  const before = perceive(prev);
  const after = perceive(next);
  if (typeof after.obstacleAheadM === 'number' && typeof before.obstacleAheadM !== 'number') return 'obstacle';
  const threshold = TUNING.decision.slipThresholdPct;
  if (typeof after.slipPct === 'number' && after.slipPct > threshold && typeof before.slipPct === 'number' && before.slipPct <= threshold) {
    return 'slip';
  }
  if (after.terrainAhead === 'unknown') {
    if (next.segmentIndex !== prev.segmentIndex) return 'terrain_enter';
  } else if (after.terrainAhead !== before.terrainAhead && after.terrainAhead !== next.sim.terrain) {
    return 'terrain_ahead';
  } else if (next.segmentIndex !== prev.segmentIndex && next.sim.terrain !== prev.sim.terrain) {
    return 'terrain_enter';
  }
  return sinceLast >= TUNING.decision.intervalS ? 'interval' : null;
}

/** Actions the build can perform (e.g. deploy_winch needs a winch). */
export function availableActions(build: Build): Action[] {
  const hasWinch = deriveSpec(build).extras.includes('winch');
  return ALL_ACTIONS.filter((action) => action !== 'deploy_winch' || hasWinch);
}

/** The question any Brain answers at a decision point. Perceived data only. */
export function buildQuestion(state: RunState, trigger: DecisionTrigger, briefing?: string): BrainQuestion {
  const options = availableActions(state.config.build);
  return {
    missionId: state.config.mission.id,
    t: state.sim.t,
    trigger,
    perceived: perceive(state),
    status: {
      speedMps: round(state.sim.v, 2),
      batteryPct: round(state.sim.battery, 1),
      damagePct: round(state.sim.damage, 1),
    },
    priority: state.config.priority,
    options,
    lookahead: lookahead(state, options),
    ...(lookaheadSeconds(state) !== TUNING.decision.lookaheadS ? { lookaheadS: lookaheadSeconds(state) } : {}),
    ...(briefing ? { briefing } : {}),
  };
}
