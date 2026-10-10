import type { Observation, Obstacle } from '@rivetrun/contracts';

/** The HUD warns about a hazard this long before the robot reaches it (docs/GAMEPLAY_V3_CONTROLS.md). */
export const WARN_AHEAD_S = 3;

/** The next thing ahead the robot's own sensors report, close enough to act on. */
export interface HazardWarning {
  /** `obstacle` = a ranger sees something but cannot name it. */
  readonly what: Obstacle | 'obstacle' | 'gap';
  readonly distanceM: number;
  /** Speed at or below which hitting it does no damage. Gaps have none: they are jumped or not. */
  readonly safeMps?: number;
  readonly widthM?: number;
  /** The robot is going faster than the safe speed. */
  readonly over: boolean;
}

/**
 * The warning the driver gets, from the Observation only: a build that cannot see an obstacle gets
 * no warning for it. `safeContactMps` is the build's own safe contact speed (the sim's
 * safeContactSpeedMps), used when the sensor cannot name what it sees.
 */
export function hazardWarning(observation: Observation | null, speedMps: number, safeContactMps: number): HazardWarning | null {
  if (!observation) return null;
  const pace = Math.max(Math.abs(speedMps), 0.3);
  const hazard = typeof observation.hazard === 'object' ? observation.hazard : null;
  const gap = typeof observation.gap === 'object' ? observation.gap : null;
  const hazardDue = hazard !== null && hazard.distanceM / pace <= WARN_AHEAD_S;
  const gapDue = gap !== null && gap.distanceM / pace <= WARN_AHEAD_S;
  if (hazardDue && (!gapDue || hazard.distanceM <= gap.distanceM)) {
    const safeMps = hazard.safeSpeedMps ?? safeContactMps;
    return { what: hazard.kind ?? 'obstacle', distanceM: hazard.distanceM, safeMps, over: Math.abs(speedMps) > safeMps + 0.02 };
  }
  if (gapDue) return { what: 'gap', distanceM: gap.distanceM, widthM: gap.widthM, over: false };
  return null;
}

/** Touching a pedal half sets this much throttle (or brake); sliding up adds, sliding down takes away. */
export const TOUCH_START = 0.3;
/** Finger travel for the whole 0–100 % range, px. */
export const TRAVEL_PX = 200;

/** Throttle bands, as the sim maps them (controlToAction). */
export function throttleBand(value: number): 'FULL' | 'STEADY' | 'EASE' | 'COAST' {
  return value >= 0.85 ? 'FULL' : value >= 0.5 ? 'STEADY' : value >= 0.15 ? 'EASE' : 'COAST';
}

export function brakeBand(value: number): 'HARD' | 'SOFT' | 'OFF' {
  return value >= 0.6 ? 'HARD' : value >= 0.1 ? 'SOFT' : 'OFF';
}

export const THROTTLE_MARKS = [
  { at: 0.15, label: 'EASE' },
  { at: 0.5, label: 'STEADY' },
  { at: 0.85, label: 'FULL' },
] as const;

export const BRAKE_MARKS = [
  { at: 0.1, label: 'SOFT' },
  { at: 0.6, label: 'HARD' },
] as const;
