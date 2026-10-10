import type { Observation, Obstacle, TerrainId } from '@rivetrun/contracts';
import { PHYSICS, TERRAINS } from '@rivetrun/sim';

/** The HUD warns about a hazard this long before the robot reaches it (docs/GAMEPLAY_V3_CONTROLS.md). */
export const WARN_AHEAD_S = 3;

/** The next thing ahead the robot's own sensors report, close enough to act on. */
export interface HazardWarning {
  /** `obstacle` = a ranger sees something but cannot name it. */
  readonly what: Obstacle | 'obstacle' | 'gap' | 'rough';
  /** `rough`: the ground the robot is about to drive onto (driving onto it too fast is an impact). */
  readonly terrain?: TerrainId;
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
  const speed = Math.abs(speedMps);
  const pace = Math.max(speed, 0.3);
  const due = (distanceM: number): boolean => distanceM / pace <= WARN_AHEAD_S;
  const found: HazardWarning[] = [];
  const hazard = typeof observation.hazard === 'object' ? observation.hazard : null;
  if (hazard && due(hazard.distanceM)) {
    const safeMps = hazard.safeSpeedMps ?? safeContactMps;
    found.push({ what: hazard.kind ?? 'obstacle', distanceM: hazard.distanceM, safeMps, over: speed > safeMps + 0.02 });
  }
  const gap = typeof observation.gap === 'object' ? observation.gap : null;
  if (gap && due(gap.distanceM)) found.push({ what: 'gap', distanceM: gap.distanceM, widthM: gap.widthM, over: false });
  // Rough ground (rock): driving onto it above the sim's entry speed is an impact with nothing to hit.
  const ahead = typeof observation.terrainAhead === 'object' ? observation.terrainAhead : null;
  if (ahead && TERRAINS[ahead.terrain].impactRisk >= PHYSICS.roughTerrainRisk && due(ahead.distanceM)) {
    const safeMps = PHYSICS.roughEntrySafeMps;
    found.push({ what: 'rough', terrain: ahead.terrain, distanceM: ahead.distanceM, safeMps, over: speed > safeMps + 0.02 });
  }
  // The nearest one is the one to act on.
  return found.sort((a, b) => a.distanceM - b.distanceM)[0] ?? null;
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
