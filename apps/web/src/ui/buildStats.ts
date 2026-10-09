import { ActionSchema, type Action, type Build, type Mission, type Part, type Preset, type SensorKind } from '@rivetrun/contracts';
import { PARTS, PARTS_BY_ID, PRESETS, TERRAIN_IDS, TUNING, availableActions, deriveSpec } from '@rivetrun/sim';

export const BUDGET_EUR = TUNING.defaultBudgetEur;
/** Heaviest build the parts list allows, rounded up: the full scale of the mass bar. */
export const MASS_SCALE_KG = 5;
export const MAX_SENSORS = 2;
export const MAX_EXTRAS = 2;

const FASTEST_MPS = 3;
const BEST_GRIP = 1.3;
const LONGEST_FULL_DRAW_S = 240;

export interface StatBar {
  readonly key: 'speed' | 'grip' | 'endurance' | 'perception';
  readonly label: string;
  /** 0–1 fill of the bar. */
  readonly fill: number;
  /** The measured figure behind the bar. */
  readonly figure: string;
}

export interface BuildStats {
  readonly costEur: number;
  readonly massKg: number;
  readonly overBudgetEur: number;
  readonly bars: readonly StatBar[];
  /** What the AI is told about, per sensor fitted. */
  readonly sees: readonly string[];
  /** What the AI will never know with this build. */
  readonly blind: readonly string[];
}

const SENSOR_SEES: Readonly<Record<SensorKind, string>> = {
  camera: 'terrain ahead',
  ultrasonic: 'obstacles',
  imu: 'slip and tilt',
  moisture: 'water and mud depth',
  scout_drone: 'the next terrain change up to 15 m ahead',
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function partsOf(build: Build): readonly Part[] {
  return [build.locomotion, build.motor, build.battery, ...build.sensors, ...build.extras].flatMap((id) => {
    const part = PARTS_BY_ID.get(id);
    return part ? [part] : [];
  });
}

export function buildStats(build: Build): BuildStats {
  const spec = deriveSpec(build);
  const meanGrip = TERRAIN_IDS.reduce((sum, terrain) => sum + (spec.grip[terrain] ?? 1), 0) / TERRAIN_IDS.length;
  const drawW = spec.motorPowerW + spec.basePowerW;
  const fullDrawS = (spec.capacityWh * 3600) / Math.max(1, drawW);
  const fitted = Object.keys(spec.sensorRangeM) as SensorKind[];
  const missing = (Object.keys(SENSOR_SEES) as SensorKind[]).filter((kind) => !fitted.includes(kind));
  return {
    costEur: spec.costEur,
    massKg: spec.massKg,
    overBudgetEur: Math.max(0, spec.costEur - BUDGET_EUR),
    bars: [
      { key: 'speed', label: 'Speed', fill: clamp01(spec.topSpeedMps / FASTEST_MPS), figure: `${spec.topSpeedMps.toFixed(1)} m/s` },
      { key: 'grip', label: 'Grip', fill: clamp01(meanGrip / BEST_GRIP), figure: `×${meanGrip.toFixed(2)}` },
      { key: 'endurance', label: 'Endurance', fill: clamp01(fullDrawS / LONGEST_FULL_DRAW_S), figure: `${spec.capacityWh} Wh / ${Math.round(drawW)} W` },
      { key: 'perception', label: 'Perception', fill: clamp01(fitted.length / MAX_SENSORS), figure: `${fitted.length}/${MAX_SENSORS} sensors` },
    ],
    sees: fitted.map((kind) => SENSOR_SEES[kind]),
    blind: missing.map((kind) => SENSOR_SEES[kind]),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

/** Same parts and the same v2 tuning. Tuning left at stock (absent) only equals stock. */
export const sameBuild = (a: Build, b: Build): boolean =>
  a.locomotion === b.locomotion &&
  a.motor === b.motor &&
  a.battery === b.battery &&
  a.batteryCells === b.batteryCells &&
  a.wheelSizeMm === b.wheelSizeMm &&
  a.gearStep === b.gearStep &&
  sameSet(a.sensors, b.sensors) &&
  sameSet(a.extras, b.extras);

/** The preset this build is, or null for a custom build. */
export const matchPreset = (build: Build): Preset | null =>
  Object.values(PRESETS).find((preset) => sameBuild(preset.build, build)) ?? null;

export const buildName = (build: Build): string => matchPreset(build)?.name ?? 'Custom build';

const deepestWaterCm = (mission: Mission): number =>
  Math.max(0, ...mission.track.segments.filter((segment) => segment.terrain === 'water').map((segment) => segment.depthCm ?? 0));

const partName = (id: string): string => PARTS_BY_ID.get(id)?.name ?? id;

/**
 * The blocking issue on a deep-water mission: the track is deeper than this drive can wade and the robot cannot swim.
 * Swimming takes the thruster kit and the waterproof case together. Null when the build can cross, or the water is shallow.
 */
export function deepWaterIssue(mission: Mission, build: Build): string | null {
  const spec = deriveSpec(build);
  if (deepestWaterCm(mission) <= spec.maxWadingDepthCm || spec.maxSwimDepthCm > 0) return null;
  return `This build can't cross deep water — needs ${partName('thruster_kit')} + ${partName('waterproof_case')}`;
}

/** A ready-made build that gets across this mission's deep water, for a one-tap fix. Null when no preset can. */
export const presetThatCrosses = (mission: Mission): Preset | null =>
  Object.values(PRESETS).find((preset) => deepWaterIssue(mission, preset.build) === null) ?? null;

/** Facts about this build on this track: what will hurt and what the AI cannot perceive. */
export function missionWarnings(mission: Mission, build: Build): readonly string[] {
  const spec = deriveSpec(build);
  const segments = mission.track.segments;
  const has = (kind: SensorKind): boolean => spec.sensorRangeM[kind] !== undefined;
  const steepest = Math.max(...segments.map((segment) => Math.abs(segment.slopeDeg)));
  const deep = deepWaterIssue(mission, build);
  const deepest = deepestWaterCm(mission);
  return [
    // Sealed and fitted with thrusters, but the water is deeper than they reach.
    deep === null && deepest > Math.max(spec.maxWadingDepthCm, spec.maxSwimDepthCm) ? `${deepest} cm of water: the thrusters reach ${spec.maxSwimDepthCm} cm` : null,
    deep === null && segments.some((segment) => segment.terrain === 'water') && !spec.waterproof ? 'Water crossing and no waterproof case' : null,
    steepest > spec.maxSlopeDeg ? `${steepest}° slope: ${spec.locomotionName.toLowerCase()} tip over past ${spec.maxSlopeDeg}°` : null,
    segments.some((segment) => segment.obstacle) && !has('ultrasonic') ? 'Obstacles on track: no ultrasonic, the AI cannot see them' : null,
    segments.some((segment) => segment.terrain === 'ice' || segment.terrain === 'mud') && !has('imu') ? 'Slippery ground: no IMU, the AI cannot feel slip' : null,
    !has('camera') && !has('scout_drone') ? 'No camera or scout drone: the AI learns each terrain only on entry' : null,
  ].flatMap((line) => (line ? [line] : []));
}

export interface BuildProperty {
  readonly label: string;
  readonly value: string;
}

/** The six numbers of the Assembly sheet, derived from the build by the sim. */
export function buildProperties(build: Build): readonly BuildProperty[] {
  const spec = deriveSpec(build);
  const torque = PARTS_BY_ID.get(build.motor)?.effects.torqueNm;
  return [
    { label: 'Mass', value: `${spec.massKg.toFixed(2)} kg` },
    { label: 'Cost', value: `€${spec.costEur} / €${BUDGET_EUR}` },
    { label: 'Power draw', value: `${Math.round((spec.motorPowerW + spec.basePowerW) * 10) / 10} W` },
    { label: 'Battery', value: `${spec.capacityWh} Wh` },
    { label: 'Top speed', value: `${spec.topSpeedMps} m/s` },
    { label: 'Torque', value: torque === undefined ? 'unknown' : `${torque} N·m` },
  ];
}

export interface Unlock {
  readonly label: string;
  readonly on: boolean;
  /** The part that would turn it on. */
  readonly needs?: string;
}

/** Every action the brain could be offered, and whether this build offers it. */
export function buildActions(build: Build): readonly Unlock[] {
  const offered = availableActions(build);
  return ActionSchema.options.map((action: Action) => ({
    label: action,
    on: offered.includes(action),
    ...(offered.includes(action) ? {} : { needs: 'Winch' }),
  }));
}

/** Every sense a sensor can give the brain, and whether this build has it. */
export function buildSenses(build: Build): readonly Unlock[] {
  const spec = deriveSpec(build);
  const sensors = PARTS.filter((part) => part.slot === 'sensor' && part.effects.sensor);
  // The drone and the camera feed the same field: one "terrain ahead" entry, at the longer range.
  const terrainRange = spec.sensorRangeM.scout_drone ?? spec.sensorRangeM.camera;
  const rows = sensors
    .filter((part) => part.effects.sensor !== 'scout_drone')
    .map((part): Unlock => {
      const kind = part.effects.sensor!;
      const range = kind === 'camera' ? terrainRange : spec.sensorRangeM[kind];
      const what = kind === 'imu' ? 'slip and tilt' : kind === 'camera' ? 'terrain ahead' : kind === 'ultrasonic' ? 'obstacles' : 'water depth';
      return range === undefined ? { label: what, on: false, needs: part.name } : { label: range > 0 ? `${what} ${range} m` : what, on: true };
    });
  return rows;
}
