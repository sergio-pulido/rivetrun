import type { Build, Mission, Part, Preset, SensorKind } from '@rivetrun/contracts';
import { PARTS_BY_ID, PRESETS, TERRAIN_IDS, TUNING, deriveSpec } from '@rivetrun/sim';

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

export const sameBuild = (a: Build, b: Build): boolean =>
  a.locomotion === b.locomotion && a.motor === b.motor && a.battery === b.battery && sameSet(a.sensors, b.sensors) && sameSet(a.extras, b.extras);

/** The preset this build is, or null for a custom build. */
export const matchPreset = (build: Build): Preset | null =>
  Object.values(PRESETS).find((preset) => sameBuild(preset.build, build)) ?? null;

export const buildName = (build: Build): string => matchPreset(build)?.name ?? 'Custom build';

/** Facts about this build on this track: what will hurt and what the AI cannot perceive. */
export function missionWarnings(mission: Mission, build: Build): readonly string[] {
  const spec = deriveSpec(build);
  const segments = mission.track.segments;
  const has = (kind: SensorKind): boolean => spec.sensorRangeM[kind] !== undefined;
  const steepest = Math.max(...segments.map((segment) => Math.abs(segment.slopeDeg)));
  return [
    segments.some((segment) => segment.terrain === 'water') && !spec.waterproof ? 'Water crossing and no waterproof case' : null,
    steepest > spec.maxSlopeDeg ? `${steepest}° slope: ${spec.locomotionName.toLowerCase()} tip over past ${spec.maxSlopeDeg}°` : null,
    segments.some((segment) => segment.obstacle) && !has('ultrasonic') ? 'Obstacles on track: no ultrasonic, the AI cannot see them' : null,
    segments.some((segment) => segment.terrain === 'ice' || segment.terrain === 'mud') && !has('imu') ? 'Slippery ground: no IMU, the AI cannot feel slip' : null,
    !has('camera') ? 'No camera: the AI learns each terrain only on entry' : null,
  ].flatMap((line) => (line ? [line] : []));
}
