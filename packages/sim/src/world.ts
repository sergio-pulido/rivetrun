import type { Obstacle, TerrainId, Track } from '@rivetrun/contracts';

export interface WorldSegment {
  readonly index: number;
  readonly startM: number;
  readonly endM: number;
  readonly terrain: TerrainId;
  readonly slopeDeg: number;
  readonly depthCm: number;
}

export interface WorldObstacle {
  readonly xM: number;
  readonly kind: Obstacle;
  readonly segmentIndex: number;
}

/** Track with absolute positions. Obstacles sit in the middle of their segment. */
export interface World {
  readonly segments: readonly WorldSegment[];
  readonly obstacles: readonly WorldObstacle[];
  readonly lengthM: number;
}

export function compileTrack(track: Track): World {
  let cursor = 0;
  const segments: WorldSegment[] = [];
  const obstacles: WorldObstacle[] = [];
  track.segments.forEach((segment, index) => {
    const startM = cursor;
    cursor += segment.lengthM;
    segments.push({ index, startM, endM: cursor, terrain: segment.terrain, slopeDeg: segment.slopeDeg, depthCm: segment.depthCm ?? 0 });
    if (segment.obstacle) {
      obstacles.push({ xM: startM + segment.lengthM / 2, kind: segment.obstacle, segmentIndex: index });
    }
  });
  return { segments, obstacles, lengthM: cursor };
}

/** Deep water starts beyond this depth: wheels and tracks lose the bottom. */
export const DEEP_WATER_CM = 25;
/** Deep channels slope down and back up over this distance at each end. */
export const SHORE_RAMP_M = 1.5;

/** Water / mud depth under x, cm. Shallow segments are flat; deep water ramps in and out at the shores. */
export function waterDepthCmAt(segment: WorldSegment, xM: number): number {
  if (segment.depthCm <= DEEP_WATER_CM) return segment.depthCm;
  const fromShore = Math.min(xM - segment.startM, segment.endM - xM);
  const ramp = Math.min(1, Math.max(0, fromShore / SHORE_RAMP_M));
  return DEEP_WATER_CM + (segment.depthCm - DEEP_WATER_CM) * ramp;
}

/** Index of the segment containing x, searching from a hint. Clamped to the track. */
export function segmentIndexAt(world: World, xM: number, hint = 0): number {
  const last = world.segments.length - 1;
  let index = Math.min(Math.max(hint, 0), last);
  while (index < last && xM >= world.segments[index]!.endM) index += 1;
  while (index > 0 && xM < world.segments[index]!.startM) index -= 1;
  return index;
}
