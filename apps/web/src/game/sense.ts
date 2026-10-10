import type { Build, Weather } from '@rivetrun/contracts';
import { PARTS_BY_ID, TUNING } from '@rivetrun/sim';

/** One forward sensor of a build and how far it reports. */
export interface SenseRange {
  readonly partId: string;
  readonly label: string;
  readonly rangeM: number;
}

/** What a build can sense ahead of its nose (docs/BRAIN_V3_SENSING.md). */
export interface Senses {
  /** Forward sensors, longest range first. */
  readonly ranges: readonly SenseRange[];
  /** Longest forward range, metres. 0 = blind. */
  readonly forwardM: number;
  /** No forward sensor: obstacles are learned on contact, or never. */
  readonly blind: boolean;
}

const LABEL: Readonly<Record<string, string>> = {
  ultrasonic: 'SONAR',
  tof_vl53l1x_pololu: 'TOF',
  lidar_rplidar_c1: 'LIDAR',
  camera: 'CAMERA',
  scout_drone: 'DRONE',
};

/** Sensor kinds that look ahead for obstacles, gaps or terrain. The moisture probe and the IMU do not. */
const FORWARD_KINDS: ReadonlySet<string> = new Set(['ultrasonic', 'camera', 'scout_drone']);

/**
 * The build's forward sensors and their ranges, from the sim's parts data and with the sim's own
 * rule for rain (the camera sees less far).
 */
export function sensesOf(build: Build, weather: Weather = 'clear'): Senses {
  const ranges: SenseRange[] = [];
  for (const id of [...build.sensors, ...build.extras]) {
    const part = PARTS_BY_ID.get(id);
    const kind = part?.effects.sensor;
    const reach = part?.effects.rangeM ?? 0;
    if (!part || !kind || !FORWARD_KINDS.has(kind) || reach <= 0) continue;
    const rangeM = kind === 'camera' && weather === 'rain' ? reach * TUNING.weather.rain.cameraRangeFactor : reach;
    ranges.push({ partId: id, label: LABEL[id] ?? part.name.toUpperCase(), rangeM });
  }
  ranges.sort((a, b) => b.rangeM - a.rangeM);
  const forwardM = ranges[0]?.rangeM ?? 0;
  return { ranges, forwardM, blind: forwardM <= 0 };
}

const metres = (m: number): string => (Number.isInteger(m) ? `${m}` : m.toFixed(1));

/** "LIDAR 12 m", or "BLIND" for a build with no forward sensor. */
export const senseLabel = (senses: Senses): string => (senses.blind ? 'BLIND' : `${senses.ranges[0]!.label} ${metres(senses.forwardM)} m`);
