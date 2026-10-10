// Strategy layer: what a build can do, what a mission asks for, and a headless test run.
// Every number comes from the same data and physics the run uses; nothing here is a separate model.
import type { Build, DnfReason, Mission, Part, PartId, TerrainId } from '@rivetrun/contracts';
import { runHeuristicSync } from './controller';
import { PARTS, TERRAINS, TERRAIN_IDS, TUNING, driveSeed } from './data';
import { ACTION_PROFILES, PHYSICS, jumpAirtimeS } from './physics';
import { score } from './score';
import { deriveSpec } from './spec';
import { predictStats } from './stats';
import type { RunState } from './types';
import { OBSTACLE_SIZE_M, compileTrack } from './world';

declare const performance: { now(): number } | undefined;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const G = 9.81;
const DEG = Math.PI / 180;
const round = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;

// ---------------------------------------------------------------- capabilities

export interface Capabilities {
  /** Friction coefficient on each terrain in clear weather. */
  readonly tractionByTerrain: Readonly<Record<TerrainId, number>>;
  /** Tallest obstacle it gets over while driving normally. */
  readonly clearanceCm: number;
  readonly topSpeedMps: number;
  /** Drive force at the wheels: what pulls the mass up a slope and through soft ground. */
  readonly pullN: number;
  /** Steepest dry-asphalt slope without climb mode. */
  readonly maxClimbDeg: number;
  /** Deepest water it can drive through. */
  readonly wadingDepthCm: number;
  readonly waterproof: boolean;
  /** Deepest water it can cross under thrust; 0 = cannot swim. */
  readonly swimDepthCm: number;
  readonly underwaterSpeedMps: number;
  /** reachM is the ground covered by one jump at cruise speed. */
  readonly jump: { readonly airtimeS: number; readonly reachM: number; readonly cooldownS: number } | null;
  /** Share of impact damage absorbed, 0–1. */
  readonly impactProtection: number;
  /** Winch fitted: hauls the robot up any slope and over any obstacle, slowly. */
  readonly winch: boolean;
  /** IMU fitted: the driver feels slope and slip at once instead of finding out by stalling. */
  readonly sensesTilt: boolean;
  /** How far ahead the sensors report each thing; 0 = blind. */
  readonly lookahead: { readonly obstacleM: number; readonly terrainM: number; readonly waterDepthM: number };
  /** On one charge, at cruise on flat asphalt. */
  readonly rangeM: number;
  readonly massKg: number;
  readonly costEur: number;
}

export function capabilities(build: Build): Capabilities {
  const spec = deriveSpec(build);
  const stats = predictStats(build);
  const traction = {} as Record<TerrainId, number>;
  for (const terrain of TERRAIN_IDS) traction[terrain] = round(TERRAINS[terrain].baseFriction * (spec.grip[terrain] ?? 1));
  const swims = spec.maxSwimDepthCm > 0;
  const cruiseMps = ACTION_PROFILES.cruise.speed * spec.topSpeedMps;
  const sensors = spec.sensorRangeM;
  return {
    tractionByTerrain: traction,
    clearanceCm: round(spec.clearanceCm, 1),
    topSpeedMps: stats.topSpeedMps,
    pullN: round(spec.motorForceN, 1),
    maxClimbDeg: stats.maxClimbDeg,
    wadingDepthCm: round(spec.maxWadingDepthCm, 0),
    waterproof: spec.waterproof,
    swimDepthCm: spec.maxSwimDepthCm,
    underwaterSpeedMps: swims ? PHYSICS.swimSpeedMps : 0,
    jump: spec.jumpImpulseMps > 0
      ? { airtimeS: round(jumpAirtimeS(spec.jumpImpulseMps)), reachM: round(cruiseMps * jumpAirtimeS(spec.jumpImpulseMps)), cooldownS: spec.jumpCooldownS }
      : null,
    impactProtection: round(1 - spec.impactDamageFactor),
    winch: spec.extras.includes('winch'),
    sensesTilt: sensors.imu !== undefined,
    lookahead: {
      obstacleM: sensors.ultrasonic ?? 0,
      terrainM: Math.max(sensors.camera ?? 0, sensors.scout_drone ?? 0),
      waterDepthM: sensors.moisture ?? 0,
    },
    rangeM: stats.rangeM,
    massKg: stats.massKg,
    costEur: stats.costEur,
  };
}

/** Stable ids for one capability each. Traction is per terrain: `traction:mud`. */
export type CapabilityId =
  | `traction:${TerrainId}`
  | 'clearance' | 'top_speed' | 'pull' | 'winch' | 'sense_tilt' | 'climb' | 'wading' | 'waterproof' | 'thrust' | 'jump' | 'ramp_speed'
  | 'protection' | 'lookahead_obstacle' | 'lookahead_terrain' | 'lookahead_depth' | 'range';

export interface CapabilityItem {
  readonly id: CapabilityId;
  /** Short display text with the value, e.g. "Wades 35 cm". */
  readonly label: string;
  readonly value: number;
  readonly unit: string;
}

/** The same capabilities as a flat list, for showing and for diffing two builds. Absent abilities are left out. */
export function capabilityList(build: Build): CapabilityItem[] {
  const c = capabilities(build);
  const items: CapabilityItem[] = [
    { id: 'top_speed', label: `Top speed ${c.topSpeedMps} m/s`, value: c.topSpeedMps, unit: 'm/s' },
    { id: 'pull', label: `Pulls ${c.pullN} N`, value: c.pullN, unit: 'N' },
    { id: 'climb', label: `Climbs ${c.maxClimbDeg}°`, value: c.maxClimbDeg, unit: '°' },
    { id: 'clearance', label: `Clears ${c.clearanceCm} cm obstacles`, value: c.clearanceCm, unit: 'cm' },
    { id: 'wading', label: `Wades ${c.wadingDepthCm} cm`, value: c.wadingDepthCm, unit: 'cm' },
    { id: 'range', label: `Range ${c.rangeM} m`, value: c.rangeM, unit: 'm' },
    ...TERRAIN_IDS.map((terrain): CapabilityItem => ({
      id: `traction:${terrain}`, label: `Grip on ${TERRAINS[terrain].name.toLowerCase()} ${c.tractionByTerrain[terrain]}`, value: c.tractionByTerrain[terrain], unit: 'μ',
    })),
  ];
  if (c.waterproof) items.push({ id: 'waterproof', label: 'Sealed against water', value: 1, unit: '' });
  if (c.swimDepthCm > 0) items.push({ id: 'thrust', label: `Swims to ${c.swimDepthCm} cm at ${c.underwaterSpeedMps} m/s`, value: c.swimDepthCm, unit: 'cm' });
  if (c.winch) items.push({ id: 'winch', label: 'Winch: hauls it up any slope or over any obstacle', value: 1, unit: '' });
  if (c.sensesTilt) items.push({ id: 'sense_tilt', label: 'Feels slope and slip at once', value: 1, unit: '' });
  if (c.jump) items.push({ id: 'jump', label: `Jumps ${c.jump.reachM} m`, value: c.jump.reachM, unit: 'm' });
  if (c.impactProtection > 0) items.push({ id: 'protection', label: `Absorbs ${Math.round(c.impactProtection * 100)}% of impacts`, value: c.impactProtection, unit: '' });
  if (c.lookahead.obstacleM > 0) items.push({ id: 'lookahead_obstacle', label: `Sees obstacles ${c.lookahead.obstacleM} m ahead`, value: c.lookahead.obstacleM, unit: 'm' });
  if (c.lookahead.terrainM > 0) items.push({ id: 'lookahead_terrain', label: `Reads terrain ${c.lookahead.terrainM} m ahead`, value: c.lookahead.terrainM, unit: 'm' });
  if (c.lookahead.waterDepthM > 0) items.push({ id: 'lookahead_depth', label: `Measures water depth ${c.lookahead.waterDepthM} m ahead`, value: c.lookahead.waterDepthM, unit: 'm' });
  return items;
}

const slotOf = (part: Part): 'locomotion' | 'motor' | 'battery' | 'sensors' | 'extras' =>
  part.slot === 'sensor' ? 'sensors' : part.slot === 'extra' ? 'extras' : part.slot;

/** The build without one part: a sensor or extra is removed, a drive / motor / battery is swapped for the plainest one. */
function without(build: Build, partId: PartId): Build {
  const part = PARTS.find((p) => p.id === partId);
  if (!part) return build;
  const slot = slotOf(part);
  if (slot === 'sensors' || slot === 'extras') return { ...build, [slot]: build[slot].filter((id) => id !== partId) };
  const plainest = PARTS.filter((p) => p.slot === part.slot && p.id !== partId).sort((a, b) => a.costEur - b.costEur)[0];
  return plainest ? { ...build, [slot]: plainest.id } : build;
}

/** What one fitted part gives this build: the capabilities that are better with it than without it. */
export function partGives(build: Build, partId: PartId): CapabilityItem[] {
  const base = new Map(capabilityList(without(build, partId)).map((item) => [item.id, item.value]));
  return capabilityList(build).filter((item) => item.value > (base.get(item.id) ?? 0) + 1e-9);
}

const PROBE: Build = { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: [], extras: [] };

/** Probe build carrying one part (and whatever that part needs to work). */
function probeWith(part: Part): Build {
  const slot = slotOf(part);
  if (slot === 'sensors') return { ...PROBE, sensors: [part.id] };
  if (slot === 'extras') {
    const needs = part.effects.requiresExtra;
    const helper = needs ? PARTS.find((p) => p.effects.extra === needs) : undefined;
    return { ...PROBE, extras: helper ? [helper.id, part.id] : [part.id] };
  }
  return { ...PROBE, [slot]: part.id };
}

let providers: Map<CapabilityId, PartId[]> | undefined;

/** Parts that provide or improve a capability, best first. For "fit one of these" hints. */
export function partsProviding(capability: CapabilityId): PartId[] {
  if (!providers) {
    const gains = new Map<CapabilityId, { id: PartId; gain: number }[]>();
    for (const part of PARTS) {
      if (part.comingSoon) continue;
      // Measured against the same probe without the part, so a helper it needs is not credited to it.
      const probe = probeWith(part);
      const base = new Map(capabilityList(without(probe, part.id)).map((item) => [item.id, item.value]));
      for (const item of capabilityList(probe)) {
        const gain = item.value - (base.get(item.id) ?? 0);
        if (gain > 1e-9) gains.set(item.id, [...(gains.get(item.id) ?? []), { id: part.id, gain }]);
      }
    }
    providers = new Map([...gains].map(([id, list]) => [id, list.sort((a, b) => b.gain - a.gain).map((entry) => entry.id)]));
  }
  // A ramp needs speed at the lip: the parts that raise top speed.
  return providers.get(capability === 'ramp_speed' ? 'top_speed' : capability) ?? [];
}

// ---------------------------------------------------------------- mission demands

export interface DemandTest {
  readonly capability: CapabilityId;
  /** The value the capability must reach, in `unit`. */
  readonly need: number;
  readonly unit: string;
  /** Display text, e.g. "Swim 90 cm". */
  readonly label: string;
}

export interface SegmentDemand {
  readonly segmentIndex: number;
  readonly startM: number;
  readonly endM: number;
  readonly terrain: TerrainId;
  readonly tests: readonly DemandTest[];
}

/** Slowest lip speed that carries a robot across a gap from a ramp, m/s. */
function rampSpeedFor(launchDeg: number, rampHeightM: number, gapM: number): number {
  for (let v = 0.2; v <= 8; v += 0.05) {
    const vy = v * Math.sin(launchDeg * DEG);
    const airtime = (vy + Math.sqrt(vy * vy + 2 * G * rampHeightM)) / G;
    if (v * Math.cos(launchDeg * DEG) * airtime >= gapM) return round(v, 1);
  }
  return 8;
}

const SLIPPERY_FRICTION = 0.45;

const WEATHER_FRICTION = (mission: Mission, terrain: TerrainId): number =>
  (mission.weather === 'rain' ? TUNING.weather.rain.frictionFactor : 1) * (mission.weather === 'cold' && terrain === 'ice' ? TUNING.weather.cold.iceFrictionFactor : 1);

/** What each segment of the track tests, in track order. */
export function missionDemands(mission: Mission): SegmentDemand[] {
  const world = compileTrack(mission.track);
  const deepestWadeCm = Math.max(...PARTS.map((p) => p.effects.maxWadingDepthCm ?? 0));
  return world.segments.map((segment) => {
    const terrain = TERRAINS[segment.terrain];
    const name = terrain.name.toLowerCase();
    const tests: DemandTest[] = [];
    const slope = Math.max(0, segment.slopeDeg);
    // Friction needed to keep moving: the slope, the rolling resistance and the drag of sinking in, at reference mass.
    const pull = Math.tan(slope * DEG) + terrain.rollingResistance + PHYSICS.sinkageDrag * terrain.sinkage * (mission.weather === 'rain' && segment.terrain === 'mud' ? TUNING.weather.rain.mudSinkageFactor : 1);
    const needGrip = round(pull / WEATHER_FRICTION(mission, segment.terrain));
    const deep = segment.terrain === 'water' && segment.depthCm > deepestWadeCm;
    // Asked wherever the ground is soft, slippery or steep enough for grip to decide the outcome.
    if (!deep && (needGrip >= 0.25 || terrain.baseFriction <= SLIPPERY_FRICTION)) tests.push({ capability: `traction:${segment.terrain}`, need: needGrip, unit: 'μ', label: `Grip on ${name} ≥ ${needGrip}` });
    if (slope >= 5) tests.push({ capability: 'climb', need: slope, unit: '°', label: `Climb ${slope}°` });
    // Force per kilogram to keep moving here, quoted for a reference-mass robot; meetsDemand scales it by the build's mass.
    const pullPerKg = (Math.sin(slope * DEG) + (pull - Math.tan(slope * DEG)) * Math.cos(slope * DEG)) * G;
    if (!deep && (slope >= 10 || terrain.sinkage >= 0.3)) {
      const needN = round(pullPerKg * PHYSICS.refMassKg, 0);
      tests.push({ capability: 'pull', need: needN, unit: 'N', label: `Pull ≥ ${needN} N per ${PHYSICS.refMassKg} kg` });
    }
    if (slope >= 10) tests.push({ capability: 'sense_tilt', need: 1, unit: '', label: `Feel the ${slope}° slope` });
    if (segment.depthCm > 0) {
      tests.push({ capability: 'waterproof', need: 1, unit: '', label: `${segment.terrain === 'water' ? 'Water' : 'Mud'} ${segment.depthCm} cm: sealed hull` });
      if (segment.terrain === 'water') {
        tests.push(deep
          ? { capability: 'thrust', need: segment.depthCm, unit: 'cm', label: `Swim ${segment.depthCm} cm` }
          : { capability: 'wading', need: segment.depthCm, unit: 'cm', label: `Wade ${segment.depthCm} cm` });
      }
    }
    for (const obstacle of world.obstacles.filter((o) => o.segmentIndex === segment.index)) {
      const heightCm = round(OBSTACLE_SIZE_M[obstacle.kind].heightM * 100, 1);
      tests.push({ capability: 'clearance', need: heightCm, unit: 'cm', label: `Clear a ${heightCm} cm ${obstacle.kind}` });
      tests.push({ capability: 'protection', need: 0.5, unit: '', label: `Impact: ${obstacle.kind}` });
    }
    if (terrain.impactRisk >= PHYSICS.roughTerrainRisk && segment.index > 0 && world.segments[segment.index - 1]!.terrain !== segment.terrain) {
      tests.push({ capability: 'lookahead_terrain', need: 1, unit: 'm', label: `Rough ${name}: arrive under ${PHYSICS.roughEntrySafeMps} m/s` });
    }
    for (const feature of world.features) {
      if (feature.type === 'gap' && feature.startM === segment.startM) {
        const widthM = round(feature.endM - feature.startM);
        const lip = world.features.find((f) => f.type === 'ramp' && Math.abs(f.endM - feature.startM) < 1e-6);
        tests.push(lip && lip.type === 'ramp'
          ? { capability: 'ramp_speed', need: rampSpeedFor(lip.launchDeg, lip.heightM, widthM), unit: 'm/s', label: `Ramp speed ≥ ${rampSpeedFor(lip.launchDeg, lip.heightM, widthM)} m/s for the ${widthM} m gap` }
          : { capability: 'jump', need: widthM, unit: 'm', label: `Jump a ${widthM} m gap` });
      }
      if (feature.type === 'drop' && feature.startM === segment.startM) {
        const landing = round(Math.sqrt(2 * G * feature.heightM), 1);
        if (landing > PHYSICS.safeLandingMps) tests.push({ capability: 'protection', need: 0.5, unit: '', label: `Land a ${feature.heightM} m drop` });
      }
    }
    return { segmentIndex: segment.index, startM: segment.startM, endM: segment.endM, terrain: segment.terrain, tests };
  });
}

/** Does this build meet one demand? Advisory: the test run is the real answer. */
export function meetsDemand(build: Build, test: DemandTest): boolean {
  const c = capabilities(build);
  const id = test.capability;
  // Climb mode adds grip, and a winch does not need any.
  if (id.startsWith('traction:')) return c.winch || c.tractionByTerrain[id.slice('traction:'.length) as TerrainId] * ACTION_PROFILES.climb_mode.grip >= test.need;
  switch (id) {
    case 'climb': return c.maxClimbDeg >= test.need || c.winch;
    case 'pull': return c.pullN >= (test.need * c.massKg) / PHYSICS.refMassKg || c.winch;
    case 'winch': return c.winch;
    case 'sense_tilt': return c.sensesTilt;
    case 'clearance': return c.clearanceCm * PHYSICS.climbClearanceFactor >= test.need || c.jump !== null;
    case 'wading': return c.wadingDepthCm >= test.need;
    case 'waterproof': return c.waterproof;
    case 'thrust': return c.swimDepthCm >= test.need;
    case 'jump': return c.jump !== null && c.jump.reachM >= test.need;
    case 'ramp_speed':
    case 'top_speed': return c.topSpeedMps >= test.need || c.jump !== null;
    case 'protection': return c.impactProtection >= test.need;
    case 'lookahead_obstacle': return c.lookahead.obstacleM >= test.need;
    case 'lookahead_terrain': return c.lookahead.terrainM >= test.need;
    case 'lookahead_depth': return c.lookahead.waterDepthM >= test.need;
    case 'range': return c.rangeM >= test.need;
    default: return true;
  }
}

// ---------------------------------------------------------------- test run

export type SegmentVerdict = 'ok' | 'slow' | 'damage' | 'fail' | 'not_reached';

export interface SegmentAssessment {
  readonly segmentIndex: number;
  readonly startM: number;
  readonly endM: number;
  readonly terrain: TerrainId;
  readonly verdict: SegmentVerdict;
  readonly timeS: number;
  readonly damagePct: number;
  /** One line on what happened here, when it was not a clean pass. */
  readonly note?: string;
  /** Demands of this segment the build does not meet. */
  readonly missing: readonly CapabilityId[];
}

export interface BuildAssessment {
  readonly finished: boolean;
  readonly dnf?: { readonly reason: DnfReason; readonly atM: number; readonly why: string; readonly missing: readonly CapabilityId[] };
  readonly timeS: number;
  readonly damagePct: number;
  readonly energyLeftPct: number;
  readonly score: number;
  readonly stars: number;
  readonly segments: readonly SegmentAssessment[];
  /** Wall time of this assessment, ms. */
  readonly computeMs: number;
}

const DAMAGE_VERDICT_PCT = 3;
const SLOW_FRACTION = 0.5;

interface Tally { timeS: number; damagePct: number; note?: string; noteWeight: number }

function noteFor(state: RunState): { text: string; weight: number } | undefined {
  const damage = state.lastDamage;
  if (state.lastAir?.type === 'fell') return { text: 'Fell into the gap', weight: 100 };
  if (!damage) return undefined;
  if (damage.blocked) return { text: `Stopped by the ${damage.obstacle}`, weight: 90 };
  if (damage.air === 'landing') return { text: `Hard landing at ${round(damage.speedMps ?? 0, 1)} m/s`, weight: damage.amountPct };
  if (damage.obstacle) return { text: `Hit the ${damage.obstacle} at ${round(damage.speedMps ?? 0, 1)} m/s`, weight: damage.amountPct };
  if (damage.roughEntry) return { text: `Drove onto ${TERRAINS[damage.roughEntry].name.toLowerCase()} at ${round(damage.speedMps ?? 0, 1)} m/s`, weight: damage.amountPct };
  if (damage.cause === 'water') return { text: 'Water got in: no sealed hull', weight: 1 };
  if (damage.cause === 'tip_over') return { text: 'Too steep: scraping', weight: 1 };
  return undefined;
}

/**
 * Test a build before deploying: the real sim, headless, with the heuristic driver, on the mission's fixed drive seed.
 * Synchronous and deterministic: the same build and mission always give the same answer.
 */
export function assessBuild(build: Build, mission: Mission, options: { readonly priority?: number } = {}): BuildAssessment {
  const started = now();
  const demands = missionDemands(mission);
  const tallies: Tally[] = compileTrack(mission.track).segments.map(() => ({ timeS: 0, damagePct: 0, noteWeight: 0 }));
  const { state } = runHeuristicSync({ mission, seed: driveSeed(mission), build, priority: options.priority ?? 0.5 }, (prev, next) => {
    const tally = tallies[prev.segmentIndex]!;
    tally.timeS += next.sim.t - prev.sim.t;
    tally.damagePct += Math.max(0, next.sim.damage - prev.sim.damage);
    const note = noteFor(next);
    if (note && note.weight > tally.noteWeight) {
      tally.note = note.text;
      tally.noteWeight = note.weight;
    }
  });
  const outcome = score(state);
  const cruiseMps = ACTION_PROFILES.cruise.speed * state.spec.topSpeedMps;
  const failIndex = state.finished ? -1 : state.world.segments.findIndex((segment) => state.bestX >= segment.startM && state.bestX < segment.endM);
  const missingAt = (index: number): CapabilityId[] => demands[index]!.tests.filter((test) => !meetsDemand(build, test)).map((test) => test.capability);
  const segments: SegmentAssessment[] = state.world.segments.map((segment, index) => {
    const tally = tallies[index]!;
    const reached = state.finished || state.bestX >= segment.startM;
    const lengthM = segment.endM - segment.startM;
    const verdict: SegmentVerdict = !reached ? 'not_reached'
      : index === failIndex ? 'fail'
      : tally.damagePct >= DAMAGE_VERDICT_PCT ? 'damage'
      : tally.timeS > 0 && lengthM / tally.timeS < cruiseMps * SLOW_FRACTION ? 'slow'
      : 'ok';
    const note = verdict === 'fail' ? (outcome.why ?? tally.note) : verdict === 'slow' && !tally.note ? `Crawled at ${round(lengthM / tally.timeS, 1)} m/s` : tally.note;
    return {
      segmentIndex: index, startM: segment.startM, endM: segment.endM, terrain: segment.terrain, verdict,
      timeS: round(tally.timeS, 1), damagePct: round(tally.damagePct, 1),
      ...(note && verdict !== 'ok' && verdict !== 'not_reached' ? { note } : {}),
      missing: reached ? missingAt(index) : [],
    };
  });
  return {
    finished: state.finished,
    ...(state.finished ? {} : {
      dnf: { reason: state.dnfReason ?? 'timeout', atM: round(state.bestX, 1), why: outcome.why ?? 'Did not finish', missing: failIndex >= 0 ? missingAt(failIndex) : [] },
    }),
    timeS: outcome.timeS,
    damagePct: outcome.damagePct,
    energyLeftPct: round(100 - outcome.energyUsedPct, 1),
    score: outcome.score,
    stars: outcome.stars,
    segments,
    computeMs: round(now() - started, 1),
  };
}
