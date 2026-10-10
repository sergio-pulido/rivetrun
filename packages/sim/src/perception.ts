import { GAMEPLAY_VERSION } from '@rivetrun/contracts';
import type {
  Action, BrainQuestion, Build, DecisionTrigger, LookaheadEntry, Observation, Obstacle, Perception, SensorSource, TerrainId, Trigger, TriggerCause,
} from '@rivetrun/contracts';
import { TUNING } from './data';
import { cameraFactor, capacityFactor, gustAt, headwindMps, rangerFactor } from './weather';
import { mixSeed, mulberry32 } from './rng';
import { ACTION_PROFILES, PHYSICS, SCAN_RULES, safeContactSpeedMps, step } from './physics';
import { deriveSpec } from './spec';
import type { RunState } from './types';
import { makeObstacle, waterDepthCmAt } from './world';
import type { World } from './world';

const NOISE = { droneDistanceM: 0.5, distanceM: 0.2, obstacleM: 0.1, slipPct: 3, tiltDeg: 0.5, depthCm: 1 } as const;
const ASSUMED_DEPTH_CM = 5;
const UNDERWATER_ULTRASONIC = { rangeFactor: 0.5, noiseFactor: 3 } as const;
/** Without an IMU, a robot that drives and does not move assumes it is on a hill this steep. */
// 6° is enough to rule out plain driving on soft or icy ground without ruling out climb mode, even for plain wheels on ice.
const STALL_INFERENCE = { afterS: 1, slopeDeg: 6, rememberS: 8 } as const;
const MIN_DECISION_GAP_S = 0.5;
const DAMAGE_DECISION_STEP_PCT = 5;
const ALL_ACTIONS: readonly Action[] = ['accelerate', 'cruise', 'slow_down', 'coast', 'brake_soft', 'brake', 'reverse', 'climb_mode', 'deploy_winch', 'jump'];
export const SCAN = SCAN_RULES;

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function cameraRangeM(state: RunState): number | undefined {
  const range = state.spec.sensorRangeM.camera;
  if (range === undefined) return undefined;
  return range * cameraFactor(state.environment);
}

/** The drone flies above the rain; fog, snow and darkness still shorten what its camera sees. */
function droneRangeM(state: RunState): number | undefined {
  const range = state.spec.sensorRangeM.scout_drone;
  return range === undefined ? undefined : range * cameraFactor(state.environment, { aboveRain: true });
}

/** The ranger's reach in this weather: lidar and ToF lose range in fog, heavy rain and snow; ultrasonic does not. */
function rangerRangeM(state: RunState): number | undefined {
  const range = state.spec.sensorRangeM.ultrasonic;
  return range === undefined ? undefined : range * rangerFactor(state.environment, state.spec.rangerSource);
}

/** How far ahead the build can make out ramps, gaps and drops: its longest forward sensor. 0 = blind. */
function featureSightM(state: RunState): number {
  return Math.max(droneRangeM(state) ?? 0, cameraRangeM(state) ?? 0, rangerRangeM(state) ?? 0);
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
  const droneRange = droneRangeM(state);
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
  const ultrasonicRange = rangerRangeM(state);
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

  // Gaps only exist on v2 tracks; older tracks keep the exact perception shape they had.
  let gap: Pick<Perception, 'gapAheadM' | 'gapWidthM'> = {};
  if (world.features.some((feature) => feature.type === 'gap')) {
    const sight = featureSightM(state);
    const next = world.features.find((feature) => feature.type === 'gap' && feature.endM > sim.x && feature.startM - sim.x <= sight);
    gap = sight === 0
      ? { gapAheadM: 'unknown' }
      : next
        ? { gapAheadM: round(Math.max(0, next.startM - sim.x + noise(NOISE.obstacleM)), 2), gapWidthM: round(next.endM - next.startM, 2) }
        : { gapAheadM: null };
  }

  return { terrainAhead, terrainAheadDistanceM, ...(terrainAheadSource ? { terrainAheadSource } : {}), ...gap, obstacleAheadM, slipPct, tiltDeg, depthAheadCm };
}

const SOURCE_LABEL: Readonly<Record<SensorSource, string>> = {
  core: 'CORE', imu: 'IMU', ultrasonic: 'ULTRASONIC', tof: 'TOF', lidar: 'LIDAR', camera: 'CAMERA', moisture_probe: 'PROBE', scout_drone: 'DRONE', bumper: 'BUMPER',
};

/** Speed the core kit projects the rest of the run at: the current pace, or a crawl when standing still. */
const paceMps = (state: RunState): number => Math.max(Math.abs(state.sim.v), ACTION_PROFILES.slow_down.speed * state.spec.topSpeedMps);

const capacityJoules = (state: RunState): number =>
  state.spec.capacityWh * capacityFactor(state.environment) * 3600;

/** Contact speed at or below which this build takes no damage from an obstacle. */
export function safeSpeedMps(state: RunState, kind: Obstacle): number {
  return safeContactSpeedMps(state.spec, kind);
}

/**
 * Brain v3: everything a brain may use, built only from the sensors the build carries plus the core kit
 * (encoders, charge, current, mission plan). 'unknown' = no sensor for it; null = fitted, nothing in range.
 */
export function observe(state: RunState): Observation {
  const { spec, sim, world } = state;
  const perceived = perceive(state);
  const has = (source: SensorSource): boolean => spec.sources.includes(source);
  const terrainSource: SensorSource | undefined = has('scout_drone') ? 'scout_drone' : has('camera') ? 'camera' : undefined;
  const terrainRangeM = Math.max(droneRangeM(state) ?? 0, cameraRangeM(state) ?? 0);
  const rangerReachM = rangerRangeM(state) ?? 0;
  const forwardRangeM = Math.max(terrainRangeM, rangerReachM);
  const blind = forwardRangeM === 0;
  const current = world.segments[state.segmentIndex]!;

  // Obstacles: a ranger gives distance only; the camera and the drone also name what they see.
  const named = terrainSource ? world.obstacles.find((o) => o.xM > sim.x && o.xM - sim.x <= terrainRangeM) : undefined;
  let hazard: Observation['hazard'] = blind ? 'unknown' : null;
  if (typeof perceived.obstacleAheadM === 'number' && spec.rangerSource) {
    const seenToo = named && Math.abs(named.xM - sim.x - perceived.obstacleAheadM) < 0.6;
    hazard = { source: spec.rangerSource, distanceM: perceived.obstacleAheadM, ...(seenToo ? { kind: named.kind, safeSpeedMps: safeSpeedMps(state, named.kind) } : {}) };
  } else if (named && terrainSource) {
    hazard = { source: terrainSource, distanceM: round(named.xM - sim.x, 1), kind: named.kind, safeSpeedMps: safeSpeedMps(state, named.kind) };
  }
  const forwardSource: SensorSource | undefined = rangerReachM >= terrainRangeM ? (spec.rangerSource ?? terrainSource) : terrainSource;
  const gap: Observation['gap'] = blind || !forwardSource ? 'unknown'
    : typeof perceived.gapAheadM === 'number' && perceived.gapWidthM !== undefined ? { source: forwardSource, distanceM: perceived.gapAheadM, widthM: perceived.gapWidthM }
    : null;
  const terrainAhead: Observation['terrainAhead'] = !terrainSource || perceived.terrainAhead === 'unknown' || perceived.terrainAheadDistanceM === 'unknown' ? 'unknown'
    : perceived.terrainAhead !== current.terrain ? { source: terrainSource, terrain: perceived.terrainAhead, distanceM: perceived.terrainAheadDistanceM }
    : null;

  const remainingM = Math.max(0, world.lengthM - sim.x);
  const projectedFinishPct = round(sim.battery - ((state.drawW * (remainingM / paceMps(state))) / capacityJoules(state)) * 100, 1);
  const contactSensor: SensorSource | undefined = has('bumper') ? 'bumper' : has('imu') ? 'imu' : undefined;
  const lastContact: Observation['lastContact'] = !contactSensor ? 'unknown'
    : state.lastContact ? { source: contactSensor, atM: round(state.lastContact.atM, 1), agoS: round(Math.max(0, sim.t - state.lastContact.t), 1) }
    : null;
  const scanZones = (state.config.mission.scanZones ?? []).map((zone) => ({
    id: zone.id, label: zone.label, distanceM: round(zone.atM - sim.x, 1),
    canScan: zone.needs.some((kind) => spec.sensorRangeM[kind] !== undefined),
    done: state.scans.done.includes(zone.id), missed: state.scans.missed.includes(zone.id),
  }));

  const unknown: string[] = [];
  if (blind) unknown.push('obstacles and gaps ahead: no forward sensor (learned on contact, or not at all)');
  if (!terrainSource) unknown.push('terrain type ahead and under the wheels: no camera or drone');
  if (!has('imu')) unknown.push('slope and slip: no IMU');
  if (!has('moisture_probe')) unknown.push('water and mud depth: no moisture probe');
  if (!contactSensor) unknown.push('contact: no bumper or IMU to feel an impact');
  if (typeof hazard === 'object' && hazard !== null && hazard.kind === undefined) unknown.push('what the obstacle is: a ranger measures distance only');

  const lines: string[] = [
    `CORE · ${round(Math.abs(sim.v), 1)} m/s · ${round(sim.x, 0)} of ${round(world.lengthM, 0)} m · charge ${Math.round(sim.battery)} % · finish at ${Math.round(projectedFinishPct)} %`,
  ];
  if (has('imu')) lines.push(`IMU · tilt ${perceived.tiltDeg}° · slip ${perceived.slipPct} %`);
  if (typeof hazard === 'object' && hazard !== null) lines.push(`${SOURCE_LABEL[hazard.source]} · ${hazard.kind ?? 'obstacle'} ${hazard.distanceM} m`);
  else if (!blind) lines.push(`${SOURCE_LABEL[forwardSource ?? 'camera']} · clear for ${round(forwardRangeM, 0)} m`);
  if (typeof gap === 'object' && gap !== null) lines.push(`${SOURCE_LABEL[gap.source]} · gap ${gap.widthM} m wide in ${gap.distanceM} m`);
  if (typeof terrainAhead === 'object' && terrainAhead !== null) lines.push(`${SOURCE_LABEL[terrainAhead.source]} · ${terrainAhead.terrain} in ${terrainAhead.distanceM} m`);
  if (typeof perceived.depthAheadCm === 'number' && perceived.depthAheadCm > 0) lines.push(`PROBE · ${perceived.depthAheadCm} cm deep ahead`);
  if (typeof lastContact === 'object' && lastContact !== null && lastContact.agoS < 3) lines.push(`${SOURCE_LABEL[lastContact.source]} · contact ${lastContact.agoS} s ago`);
  for (const zone of scanZones) if (!zone.done && !zone.missed && zone.distanceM > -1 && zone.distanceM < 10) lines.push(`PLAN · scan zone "${zone.label}" in ${zone.distanceM} m${zone.canScan ? '' : ' (no sensor for it)'}`);
  if (blind) lines.push('BLIND · no forward sensor');
  const conditions = state.environment.conditions;
  const gusty = (conditions?.gustMps ?? 0) > 0;
  const gusting = !gusty ? undefined : has('imu') ? gustAt(state.environment, sim.t) > 0 : ('unknown' as const);
  if (conditions?.windMps) lines.push(`PLAN · ${conditions.windMps > 0 ? 'headwind' : 'tailwind'} ${Math.abs(conditions.windMps)} m/s`);
  if (gusting === true) lines.push('IMU · gust pushing back');
  if (gusty && gusting === 'unknown') unknown.push('gusts: no IMU to feel them');

  return {
    sources: [...spec.sources],
    speedMps: round(sim.v, 2),
    odometerM: round(Math.max(0, sim.x), 1),
    missionLengthM: world.lengthM,
    remainingM: round(remainingM, 1),
    batteryPct: round(sim.battery, 1),
    drawW: round(state.drawW, 1),
    projectedFinishPct,
    damagePct: round(sim.damage, 1),
    scanZones,
    tiltDeg: perceived.tiltDeg,
    slipPct: perceived.slipPct,
    slipping: typeof perceived.slipPct === 'number' ? perceived.slipPct > TUNING.decision.slipThresholdPct : 'unknown',
    forwardRangeM: round(forwardRangeM, 1),
    blind,
    hazard,
    gap,
    terrainAhead,
    waterDepthCm: perceived.depthAheadCm,
    lastContact,
    actuators: {
      jumpReadyInS: spec.jumpImpulseMps > 0 ? round(Math.max(0, state.jumpReadyT - sim.t), 1) : 'unknown',
      winch: spec.extras.includes('winch'),
      climbMode: true,
    },
    ...(conditions ? { conditions } : {}),
    ...(gusting !== undefined ? { gusting } : {}),
    unknown,
    lines,
  };
}

/** What a build can and cannot sense, without a run: the same wording the Observation uses. */
export function senses(build: Build): { sources: SensorSource[]; forwardRangeM: number; blind: boolean; can: string[]; cannot: string[] } {
  const spec = deriveSpec(build);
  const range = spec.sensorRangeM;
  const forwardRangeM = Math.max(range.scout_drone ?? 0, range.camera ?? 0, range.ultrasonic ?? 0);
  const can: string[] = ['speed and distance (encoders)', 'battery charge, current draw and the charge it will finish with', 'the mission plan: length and scan-zone positions'];
  const cannot: string[] = [];
  if (range.ultrasonic !== undefined) can.push(`obstacles and gap edges up to ${range.ultrasonic} m (${SOURCE_LABEL[spec.rangerSource ?? 'ultrasonic'].toLowerCase()})`);
  if (range.camera !== undefined) can.push(`terrain type, obstacles and gaps up to ${range.camera} m (camera)`);
  if (range.scout_drone !== undefined) can.push(`terrain and hazards up to ${range.scout_drone} m (scout drone)`);
  if (forwardRangeM === 0) cannot.push('obstacles and gaps ahead: no forward sensor (learned on contact, or not at all)');
  if (range.camera === undefined && range.scout_drone === undefined) cannot.push('terrain type ahead and under the wheels: no camera or drone');
  if (range.imu !== undefined) can.push('tilt, slope, slip and impacts (IMU)'); else cannot.push('slope and slip: no IMU');
  if (range.moisture !== undefined) can.push(`water and mud depth up to ${range.moisture} m ahead (moisture probe)`); else cannot.push('water and mud depth: no moisture probe');
  if (spec.sources.includes('bumper')) can.push('contact, after it happens (bumper)');
  else if (range.imu === undefined) cannot.push('contact: no bumper or IMU to feel an impact');
  return { sources: [...spec.sources], forwardRangeM, blind: forwardRangeM === 0, can, cannot };
}

/**
 * The world as the robot believes it is, from its Observation only. Beyond what the sensors report,
 * the track is assumed to continue like the last known ground.
 */
function perceivedWorld(state: RunState, seen: Observation): World {
  const x = state.sim.x;
  const terrainKnown = seen.terrainAhead !== 'unknown';
  // Driving and not moving (encoders + current): assume soft ground on a hill.
  // The lesson lasts a while after it gets moving again, or it would floor it straight back into the same stall.
  const stalled = state.stallS >= STALL_INFERENCE.afterS || (state.lastStallT >= 0 && state.sim.t - state.lastStallT < STALL_INFERENCE.rememberS);
  // Its own thrusters running is the one way a build without a probe knows it is in deep water.
  const swimming = state.sim.thrusting === true;
  const here = state.world.segments[state.segmentIndex]!;
  const currentTerrain: TerrainId = swimming ? 'water' : terrainKnown ? here.terrain : stalled ? 'mud' : 'asphalt';
  const wet = (terrain: TerrainId): boolean => terrain === 'water' || terrain === 'mud';
  const depthFor = (terrain: TerrainId): number =>
    !wet(terrain) ? 0 : seen.waterDepthCm !== 'unknown' ? seen.waterDepthCm : ASSUMED_DEPTH_CM;
  const slopeDeg = seen.tiltDeg !== 'unknown' ? seen.tiltDeg : stalled ? STALL_INFERENCE.slopeDeg : 0;
  const far = x + 1000;
  const ahead = typeof seen.terrainAhead === 'object' && seen.terrainAhead !== null ? seen.terrainAhead : null;
  const boundary = ahead ? x + ahead.distanceM : far;
  const segments = [
    {
      index: 0, startM: 0, endM: Math.max(boundary, x + 0.01), terrain: currentTerrain, slopeDeg,
      depthCm: swimming ? Math.max(depthFor('water'), state.spec.maxWadingDepthCm + 10) : depthFor(currentTerrain),
    },
  ];
  if (ahead) segments.push({ index: 1, startM: segments[0]!.endM, endM: far, terrain: ahead.terrain, slopeDeg: 0, depthCm: depthFor(ahead.terrain) });
  // A seen obstacle of unknown kind is assumed to be a log. One just felt by the bumper or the IMU is assumed to be
  // the tallest kind: something stopped the robot.
  const felt = typeof seen.lastContact === 'object' && seen.lastContact !== null && state.blockedBy !== undefined;
  const hazard = typeof seen.hazard === 'object' && seen.hazard !== null ? seen.hazard : null;
  const obstacles = felt ? [makeObstacle('rock', x + 0.01, 0)]
    : hazard ? [makeObstacle(hazard.kind ?? 'log', x + hazard.distanceM, 0)]
    : [];
  // Ramps, gaps and drops within forward sensor range. The ramp under the wheels is known through the IMU.
  const features = state.world.features.filter((feature) =>
    feature.startM > x ? feature.startM - x <= seen.forwardRangeM : feature.endM >= x - 0.01 && (seen.forwardRangeM > 0 || seen.tiltDeg !== 'unknown'));
  return { segments, obstacles, features, lengthM: far };
}

/** How far ahead the Brain simulates: further when a scout drone is fitted. */
export function lookaheadSeconds(state: RunState): number {
  const { sensorRangeM } = state.spec;
  if (sensorRangeM.scout_drone !== undefined) return TUNING.decision.droneLookaheadS;
  return TUNING.decision.lookaheadS;
}

/** Forward-simulates each action for the lookahead window on what the robot believes, never on the true track. */
export function lookahead(state: RunState, actions: readonly Action[], seen: Observation = observe(state)): LookaheadEntry[] {
  const steps = Math.round((lookaheadSeconds(state) * 1000) / TUNING.dtMs);
  const felt = typeof seen.lastContact === 'object' && seen.lastContact !== null;
  const believed: RunState = {
    ...state,
    world: perceivedWorld(state, seen),
    // The plan gives the steady wind. A gust is believed only while the IMU feels it, and then as if it stays.
    environment: {
      ...state.environment, frictionJitter: 1,
      ...(state.environment.conditions
        ? { conditions: { ...state.environment.conditions, gustMps: 0, windMps: (state.environment.conditions.windMps ?? 0) + (seen.gusting === true ? gustAt(state.environment, state.sim.t) : 0) } }
        : {}),
    },
    segmentIndex: 0,
    done: false,
    lastProgressT: state.sim.t,
    // Hidden truth does not ride into the simulation: slip needs an IMU, and what blocked it needs a contact sensor.
    slipPct: 0,
    blockedBy: felt ? state.blockedBy : undefined,
  };
  const remainingM = Math.max(0, state.world.lengthM - state.sim.x);
  return actions.map((action) => {
    let future = believed;
    for (let i = 0; i < steps && !future.done; i += 1) future = step(future, action);
    const progressM = future.sim.x - state.sim.x;
    const energyPct = Math.max(0, state.sim.battery - future.sim.battery);
    // Energy line: what is left at the finish if this option's pace and draw held for the rest of the run.
    const projectedFinishPct = progressM > 0.05 ? future.sim.battery - (energyPct / progressM) * Math.max(0, remainingM - progressM) : -100;
    return {
      action,
      progressM: round(progressM, 2),
      damagePct: round(Math.max(0, future.sim.damage - state.sim.damage), 2),
      energyPct: round(energyPct, 2),
      projectedFinishPct: round(Math.max(-100, Math.min(100, projectedFinishPct)), 1),
      assumed: progressM > seen.forwardRangeM,
    };
  });
}

/** v2 detector, kept for callers that still import it. There is no clock tick any more; the controllers use `advanceBrain`. */
export function detectDecisionPoint(prev: RunState, next: RunState): DecisionTrigger | null {
  if (next.done || next.airborne) return null;
  if (next.lastAir?.type === 'fell' || next.lastAir?.type === 'landed') return 'damage';
  const sinceLast = next.sim.t - next.lastDecisionT;
  if (next.lastDamage?.cause === 'impact') return 'damage';
  if (sinceLast < MIN_DECISION_GAP_S) return null;
  const step5 = (damage: number): number => Math.floor(damage / DAMAGE_DECISION_STEP_PCT);
  if (step5(next.sim.damage) > step5(prev.sim.damage)) return 'damage';

  const before = perceive(prev);
  const after = perceive(next);
  if (typeof after.obstacleAheadM === 'number' && typeof before.obstacleAheadM !== 'number') return 'obstacle';
  if (typeof after.gapAheadM === 'number' && typeof before.gapAheadM !== 'number') return 'obstacle';
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
  return null;
}

const HAZARD_REACH_M = 1;
const ZONE_NOTICE_M = 3;
const ENERGY = { lowPct: 10, okPct: 30 } as const;
const SLIP_OFF_PCT = 15;
const TOLD_AFTER_S = 1;
const STALL_RETELL_S = 2;

const LEGACY_TRIGGER: Readonly<Record<TriggerCause, DecisionTrigger>> = {
  start: 'start',
  hazard_seen: 'obstacle', hazard_reached: 'obstacle', gap_seen: 'obstacle', gap_reached: 'obstacle',
  terrain_seen: 'terrain_ahead', terrain_reached: 'terrain_enter', zone_seen: 'obstacle', zone_reached: 'obstacle',
  gust_start: 'slip', gust_stop: 'slip', slip_start: 'slip', slip_stop: 'slip', tilt_10: 'slip', tilt_20: 'slip', tilt_level: 'slip',
  impact: 'damage', damage: 'damage', landing: 'damage', blocked: 'damage', fell: 'damage',
  energy_low: 'energy', energy_ok: 'energy',
  jump_ready: 'actuator', winch_done: 'actuator', scan_done: 'actuator', stopped: 'actuator',
};

export const START_TRIGGER: Trigger = { kind: 'start', cause: 'start', label: 'START · run begins' };

const fire = (kind: Trigger['kind'], cause: TriggerCause, label: string, source?: SensorSource, thing?: number | string): Trigger =>
  ({
    kind, cause, label, ...(source ? { source } : {}),
    // The thing on the track (its index, or a zone's id) and the sensor: the same in every run of this build and seed.
    ...(thing !== undefined ? { eventId: `${cause}:${thing}${source && source !== 'core' ? `:${source}` : ''}` } : {}),
  });

/**
 * Brain v3 trigger detector. Call once per step with the new state: it returns the trigger that asks for a
 * decision, if any, and the state with its memory updated. No trigger, no decision: there is no clock.
 * Order when several fire at once: body, then perception, then actuator, then energy.
 */
export function advanceBrain(next: RunState): { readonly trigger: Trigger | null; readonly state: RunState } {
  if (next.done) return { trigger: null, state: next };
  const memory = next.brain;
  const seen = observe(next);
  const x = next.sim.x;
  const fired: Trigger[] = [];
  let brain = memory;
  const remember = (patch: Partial<typeof memory>): void => {
    brain = { ...brain, ...patch };
  };

  // ---- body
  if (next.lastAir?.type === 'fell') fired.push(fire('body', 'fell', `CORE · fell into the gap (${next.falls} of ${PHYSICS.maxFalls})`, 'core'));
  else if (next.lastAir?.type === 'landed') fired.push(fire('body', 'landing', `CORE · landed at ${round(next.lastAir.impactMps, 1)} m/s`, 'core'));
  const contact = typeof seen.lastContact === 'object' && seen.lastContact !== null && seen.lastContact.agoS === 0 ? seen.lastContact : null;
  if (contact && next.lastDamage?.cause === 'impact') {
    fired.push(fire('body', next.blockedBy ? 'blocked' : 'impact', `${SOURCE_LABEL[contact.source]} · ${next.blockedBy ? 'stopped by' : 'hit'} something at ${round(x, 0)} m`, contact.source));
  }
  const damageStep = Math.floor(next.sim.damage / DAMAGE_DECISION_STEP_PCT);
  if (damageStep > memory.damageStep) {
    remember({ damageStep });
    if (fired.length === 0) fired.push(fire('body', 'damage', `CORE · damage ${Math.round(next.sim.damage)} %`, 'core'));
  }
  if (typeof seen.gusting === 'boolean' && seen.gusting !== memory.gusting) {
    remember({ gusting: seen.gusting });
    fired.push(seen.gusting
      ? fire('body', 'gust_start', `IMU · gust, headwind ${Math.round(headwindMps(next.environment, next.sim.t))} m/s`, 'imu')
      : fire('body', 'gust_stop', 'IMU · gust over', 'imu'));
  }
  if (seen.slipping !== 'unknown' && typeof seen.slipPct === 'number') {
    if (!memory.slipping && seen.slipping) {
      remember({ slipping: true });
      fired.push(fire('body', 'slip_start', `IMU · slipping ${Math.round(seen.slipPct)} %`, 'imu'));
    } else if (memory.slipping && seen.slipPct < SLIP_OFF_PCT) {
      remember({ slipping: false });
      fired.push(fire('body', 'slip_stop', 'IMU · grip is back', 'imu'));
    }
  }
  if (typeof seen.tiltDeg === 'number') {
    const tilt = Math.abs(seen.tiltDeg);
    const band = tilt >= 20 ? 2 : tilt >= 10 ? 1 : tilt < 8 ? 0 : memory.tiltBand;
    if (band !== memory.tiltBand) {
      remember({ tiltBand: band });
      fired.push(fire('body', band === 2 ? 'tilt_20' : band === 1 ? 'tilt_10' : 'tilt_level', `IMU · tilt ${seen.tiltDeg}°`, 'imu'));
    }
  }
  // Encoders: driving and not moving for a second.
  // Told after a second, and again each time the last answer has had two more seconds and still nothing moves.
  const stallMark = next.stallS < TOLD_AFTER_S ? 0 : 1 + Math.floor((next.stallS - TOLD_AFTER_S) / STALL_RETELL_S);
  if (stallMark > memory.stallMark && !next.airborne) {
    remember({ stallMark });
    const what = next.sim.v < -PHYSICS.rollbackMps ? 'rolling backwards' : 'driving but not moving';
    fired.push(fire('body', 'blocked', stallMark === 1 ? `CORE · ${what}` : `CORE · still ${what} after ${Math.round(next.stallS)} s`, 'core'));
  } else if (next.stallS === 0 && memory.stallMark !== 0) {
    remember({ stallMark: 0 });
  }

  // ---- perception
  const hazard = typeof seen.hazard === 'object' && seen.hazard !== null ? seen.hazard : null;
  if (hazard) {
    const index = next.world.obstacles.findIndex((o) => o.xM > x);
    const at = next.world.obstacles[index]?.xM ?? x + hazard.distanceM;
    const name = hazard.kind ?? 'obstacle';
    if (Math.abs(at - memory.hazardSeenX) > 0.5) {
      remember({ hazardSeenX: at });
      fired.push(fire('perception', 'hazard_seen', `${SOURCE_LABEL[hazard.source]} · ${name} ${hazard.distanceM} m`, hazard.source, index));
    } else if (hazard.distanceM <= HAZARD_REACH_M && Math.abs(at - memory.hazardReachedX) > 0.5) {
      remember({ hazardReachedX: at });
      fired.push(fire('perception', 'hazard_reached', `${SOURCE_LABEL[hazard.source]} · ${name} now ${hazard.distanceM} m`, hazard.source, index));
    }
  }
  const gap = typeof seen.gap === 'object' && seen.gap !== null ? seen.gap : null;
  if (gap) {
    const gaps = next.world.features.filter((f) => f.type === 'gap');
    const gapIndex = gaps.findIndex((f) => f.endM > x);
    const at = gaps[gapIndex]?.startM ?? x + gap.distanceM;
    if (Math.abs(at - memory.gapSeenX) > 0.5) {
      remember({ gapSeenX: at });
      fired.push(fire('perception', 'gap_seen', `${SOURCE_LABEL[gap.source]} · gap ${gap.widthM} m wide in ${gap.distanceM} m`, gap.source, gapIndex));
    } else if (gap.distanceM <= HAZARD_REACH_M * 2 && Math.abs(at - memory.gapReachedX) > 0.5) {
      remember({ gapReachedX: at });
      fired.push(fire('perception', 'gap_reached', `${SOURCE_LABEL[gap.source]} · gap now ${gap.distanceM} m`, gap.source, gapIndex));
    }
  }
  const terrain = typeof seen.terrainAhead === 'object' && seen.terrainAhead !== null ? seen.terrainAhead : null;
  if (terrain) {
    const ahead = next.world.segments.find((segment) => segment.startM > x && segment.terrain === terrain.terrain);
    const boundary = ahead?.startM ?? x + terrain.distanceM;
    if (Math.abs(boundary - memory.terrainSeenX) > 0.5) {
      remember({ terrainSeenX: boundary });
      fired.push(fire('perception', 'terrain_seen', `${SOURCE_LABEL[terrain.source]} · ${terrain.terrain} in ${terrain.distanceM} m`, terrain.source, ahead?.index ?? next.segmentIndex + 1));
    }
  }
  // Driving onto ground the build had seen coming: it knows the moment it gets there.
  if (seen.terrainAhead !== 'unknown' && memory.terrainSeenX >= 0 && x >= memory.terrainSeenX && x - next.sim.v * (TUNING.dtMs / 1000) < memory.terrainSeenX) {
    const eye: SensorSource = next.spec.sources.includes('scout_drone') ? 'scout_drone' : 'camera';
    fired.push(fire('perception', 'terrain_reached', `${SOURCE_LABEL[eye]} · now on ${next.sim.terrain}`, eye, next.segmentIndex));
  }
  for (const zone of seen.scanZones) {
    if (zone.done || zone.missed || !zone.canScan) continue;
    if (zone.distanceM > 0 && zone.distanceM <= ZONE_NOTICE_M && !brain.zonesSeen.includes(zone.id)) {
      remember({ zonesSeen: [...brain.zonesSeen, zone.id] });
      fired.push(fire('perception', 'zone_seen', `PLAN · scan zone "${zone.label}" in ${zone.distanceM} m`, 'core', zone.id));
    } else if (Math.abs(zone.distanceM) <= SCAN.reachM && !brain.zonesReached.includes(zone.id)) {
      remember({ zonesReached: [...brain.zonesReached, zone.id] });
      fired.push(fire('perception', 'zone_reached', `PLAN · on scan zone "${zone.label}"`, 'core', zone.id));
    }
  }

  // ---- actuator
  const jumpReady = next.spec.jumpImpulseMps > 0 && next.sim.t >= next.jumpReadyT;
  if (next.spec.jumpImpulseMps > 0 && jumpReady !== memory.jumpReady) {
    remember({ jumpReady });
    if (jumpReady && !next.airborne) fired.push(fire('actuator', 'jump_ready', 'PISTON · re-armed', 'core'));
  }
  if (next.scans.justDone) fired.push(fire('actuator', 'scan_done', `SCAN · "${next.scans.justDone}" done`, 'core'));
  // Encoders: at rest for a second under a command to stand still.
  if (next.stoppedS >= TOLD_AFTER_S && !memory.stopTold) {
    remember({ stopTold: true });
    fired.push(fire('actuator', 'stopped', 'CORE · stopped', 'core'));
  } else if (next.stoppedS === 0 && memory.stopTold) {
    remember({ stopTold: false });
  }

  // ---- energy, with hysteresis
  if (!memory.energyLow && seen.projectedFinishPct < ENERGY.lowPct && next.sim.t > 1) {
    remember({ energyLow: true });
    fired.push(fire('energy', 'energy_low', `ENERGY · finish at ${Math.round(seen.projectedFinishPct)} % at this pace`, 'core'));
  } else if (memory.energyLow && seen.projectedFinishPct > ENERGY.okPct) {
    remember({ energyLow: false });
    fired.push(fire('energy', 'energy_ok', `ENERGY · finish at ${Math.round(seen.projectedFinishPct)} % again`, 'core'));
  }

  const trigger = next.airborne ? fired.find((t) => t.cause === 'fell') ?? null : fired[0] ?? null;
  return { trigger, state: brain === memory ? next : { ...next, brain } };
}

/** Actions the build can perform (e.g. deploy_winch needs a winch). */
export function availableActions(build: Build): Action[] {
  const hasWinch = deriveSpec(build).extras.includes('winch');
  const hasPiston = deriveSpec(build).jumpImpulseMps > 0;
  return ALL_ACTIONS.filter((action) => (action !== 'deploy_winch' || hasWinch) && (action !== 'jump' || hasPiston));
}

/** The actions this build can take right now: its commands, plus `scan` when a zone it can scan is under it. */
export function optionsNow(state: RunState): Action[] {
  const actions = availableActions(state.config.build);
  const zone = scannableZone(state);
  return zone ? [...actions, 'scan'] : actions;
}

/** The zone the robot could scan from where it is, if any. */
export function scannableZone(state: RunState): { readonly id: string; readonly label: string } | undefined {
  return (state.config.mission.scanZones ?? []).find((zone) =>
    Math.abs(zone.atM - state.sim.x) <= zone.halfLengthM + SCAN.reachM &&
    !state.scans.done.includes(zone.id) && !state.scans.missed.includes(zone.id) &&
    zone.needs.some((kind) => state.spec.sensorRangeM[kind] !== undefined));
}

/**
 * The question any Brain answers. Brain v3: `observation` is everything the brain may use, `cause` is why it is
 * asked. The v2 fields (`trigger`, `perceived`, `status`) stay filled for older readers.
 */
export function buildQuestion(state: RunState, trigger: DecisionTrigger | Trigger, briefing?: string): BrainQuestion {
  const cause: Trigger = typeof trigger === 'string' ? { kind: trigger === 'start' ? 'start' : 'perception', cause: trigger === 'start' ? 'start' : 'hazard_seen', label: trigger } : trigger;
  const options = optionsNow(state);
  const observation = observe(state);
  return {
    missionId: state.config.mission.id,
    t: state.sim.t,
    trigger: typeof trigger === 'string' ? trigger : LEGACY_TRIGGER[trigger.cause],
    perceived: perceive(state),
    status: {
      speedMps: round(state.sim.v, 2),
      batteryPct: round(state.sim.battery, 1),
      damagePct: round(state.sim.damage, 1),
    },
    priority: state.config.priority,
    options,
    lookahead: lookahead(state, options, observation),
    observation,
    cause,
    gameplayVersion: GAMEPLAY_VERSION,
    ...(lookaheadSeconds(state) !== TUNING.decision.lookaheadS ? { lookaheadS: lookaheadSeconds(state) } : {}),
    ...(briefing ? { briefing } : {}),
  };
}
