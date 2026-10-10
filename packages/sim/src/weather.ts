import type { Build, Conditions, Environment, Mission, ScanZone, SensorSource } from '@rivetrun/contracts';
import { deriveSpec } from './spec';
import type { RobotSpec } from './spec';
import { TUNING } from './data';
import { mixSeed, nextRandom } from './rng';

/**
 * Weather model (overnight program, OVN-SIM-2). Every number here is an assumption, listed in docs/CHANGES.md.
 * A mission without `conditions` behaves exactly as before: no wind, no aerodynamic drag, no visibility loss.
 */
export const WEATHER = {
  /** Air density at sea level, kg/m³. */
  airDensity: 1.2,
  /** Drag area Cd·A of the rover: a bluff body about 0.2 m × 0.15 m with wheels and a sensor mast (Cd ≈ 1.2). */
  dragAreaM2: 0.04,
  /** A gust window opens once per slot, at a seeded time, for a seeded duration and strength. */
  gust: { slotS: 7, minS: 1.5, maxS: 3, minStrength: 0.6 },
  /** LiPo usable capacity: about 1 % lost per °C below 20 °C (0 °C ≈ 80 %, −20 °C ≈ 60 %), never under half. */
  capacityLossPerC: 0.01,
  capacityFloor: 0.5,
  /** Camera range by visibility. A NoIR camera with IR lamps keeps its range at night. */
  camera: { fog: 0.35, night: 0.25, nightWithLights: 0.5, snow: 0.7 },
  /** Lidar and ToF are light: darkness does not matter, droplets and flakes scatter the beam. Ultrasonic is unaffected. */
  light: { fog: 0.7, heavyRain: 0.6, snow: 0.6 },
} as const;

const NONE: Conditions = {};

export const conditionsOf = (environment: Environment): Conditions => environment.conditions ?? NONE;

/** True when the mission defines wind: only then does air drag act at all. */
export const hasWind = (environment: Environment): boolean => {
  const c = conditionsOf(environment);
  return c.windMps !== undefined || c.gustMps !== undefined;
};

/** Extra headwind from a gust at time t, m/s. Pure in (seed, t): the same run always meets the same gusts. */
export function gustAt(environment: Environment, t: number): number {
  const peak = conditionsOf(environment).gustMps ?? 0;
  if (peak <= 0 || t < 0) return 0;
  const { slotS, minS, maxS, minStrength } = WEATHER.gust;
  const slot = Math.floor(t / slotS);
  const first = nextRandom(mixSeed(environment.sensorNoiseSeed, 7000 + slot));
  const second = nextRandom(first.state);
  const third = nextRandom(second.state);
  const duration = minS + first.value * (maxS - minS);
  const start = slot * slotS + second.value * (slotS - duration);
  if (t < start || t >= start + duration) return 0;
  return peak * (minStrength + third.value * (1 - minStrength));
}

/** Headwind right now, m/s (negative = tailwind): the steady wind plus any gust. */
export const headwindMps = (environment: Environment, t: number): number =>
  (conditionsOf(environment).windMps ?? 0) + gustAt(environment, t);

/** Aerodynamic force opposing forward motion, N: ½·ρ·CdA·v_rel·|v_rel| on the air speed over the body. */
export function airDragN(environment: Environment, t: number, v: number): number {
  if (!hasWind(environment)) return 0;
  const relative = v + headwindMps(environment, t);
  return 0.5 * WEATHER.airDensity * WEATHER.dragAreaM2 * relative * Math.abs(relative);
}

/** Share of the pack's rated capacity that is usable at this temperature. */
export function capacityFactor(environment: Environment): number {
  const temperatureC = conditionsOf(environment).temperatureC;
  if (temperatureC === undefined) return environment.weather === 'cold' ? TUNING.weather.cold.batteryCapacityFactor : 1;
  return Math.min(1, Math.max(WEATHER.capacityFloor, 1 - WEATHER.capacityLossPerC * (20 - temperatureC)));
}

/** Range multiplier for a camera (or the scout drone's camera when `aboveRain`). `nightVision` = NoIR with IR lamps. */
export function cameraFactor(environment: Environment, options: { aboveRain?: boolean; nightVision?: boolean; lights?: boolean } = {}): number {
  const c = conditionsOf(environment);
  let factor = environment.weather === 'rain' && !options.aboveRain ? TUNING.weather.rain.cameraRangeFactor : 1;
  if (c.precipitation === 'snow') factor *= WEATHER.camera.snow;
  if (c.visibility === 'fog') factor *= WEATHER.camera.fog;
  if (c.visibility === 'night' && !options.nightVision) factor *= options.lights ? WEATHER.camera.nightWithLights : WEATHER.camera.night;
  return factor;
}

/** Range multiplier for the build's ranger (ultrasonic, ToF or lidar). */
export function rangerFactor(environment: Environment, source: SensorSource | undefined): number {
  if (source !== 'lidar' && source !== 'tof') return 1;
  const c = conditionsOf(environment);
  let factor = 1;
  if (c.visibility === 'fog') factor *= WEATHER.light.fog;
  if (c.precipitation === 'heavy_rain') factor *= WEATHER.light.heavyRain;
  if (c.precipitation === 'snow') factor *= WEATHER.light.snow;
  return factor;
}

/**
 * Can this build scan the zone in this weather? It needs one of the zone's sensors, and at night a camera scan
 * needs light: a NoIR camera or headlights (light sensor). The scout drone's camera has neither.
 */
export function canScan(spec: RobotSpec, environment: Environment, zone: ScanZone): boolean {
  const dark = conditionsOf(environment).visibility === 'night';
  return zone.needs.some((kind) => {
    if (spec.sensorRangeM[kind] === undefined) return false;
    if (!dark) return true;
    if (kind === 'camera') return spec.nightVision === true || spec.autoLights === true;
    return kind !== 'scout_drone';
  });
}

/** The same check without a run, for the Brief. */
export function canScanZone(build: Build, mission: Mission, zone: ScanZone): boolean {
  return canScan(deriveSpec(build), { weather: mission.weather, frictionJitter: 1, sensorNoiseSeed: 0, ...(mission.conditions ? { conditions: mission.conditions } : {}) }, zone);
}
