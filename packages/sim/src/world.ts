import type { Obstacle, TerrainId, Track } from '@rivetrun/contracts';

export interface WorldSegment {
  readonly index: number;
  readonly startM: number;
  readonly endM: number;
  readonly terrain: TerrainId;
  readonly slopeDeg: number;
  readonly depthCm: number;
  /** Depth at the start and end edges, cm (absent = flat at depthCm). */
  readonly edgeInCm?: number;
  readonly edgeOutCm?: number;
  /** Current against the direction of travel, m/s. */
  readonly currentMps?: number;
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
    const depthCm = segment.depthCm ?? 0;
    // Water meets a dry neighbour at shore depth and a wet neighbour halfway between the two depths.
    const edge = (neighbour: Track['segments'][number] | undefined): number | undefined => {
      if (segment.terrain !== 'water') return undefined;
      return neighbour?.terrain === 'water' ? (depthCm + (neighbour.depthCm ?? 0)) / 2 : Math.min(depthCm, SHORE_DEPTH_CM);
    };
    segments.push({
      index, startM, endM: cursor, terrain: segment.terrain, slopeDeg: segment.slopeDeg, depthCm,
      edgeInCm: edge(track.segments[index - 1]), edgeOutCm: edge(track.segments[index + 1]),
      ...(segment.currentMps ? { currentMps: segment.currentMps } : {}),
    });
    if (segment.obstacle) {
      obstacles.push({ xM: startM + segment.lengthM / 2, kind: segment.obstacle, segmentIndex: index });
    }
  });
  return { segments, obstacles, lengthM: cursor };
}

/** A dry shore meets the water at no more than this depth. */
export const SHORE_DEPTH_CM = 20;
/** The bed slopes between depths over this distance at each end of a water segment. */
export const SHORE_RAMP_M = 1.5;

const lerp = (from: number, to: number, t: number): number => from + (to - from) * Math.min(1, Math.max(0, t));

/** Water / mud depth under x, cm. The bed ramps from each edge depth to the segment depth. */
export function waterDepthCmAt(segment: WorldSegment, xM: number): number {
  const fromStart = xM - segment.startM;
  const toEnd = segment.endM - xM;
  return fromStart <= toEnd
    ? lerp(segment.edgeInCm ?? segment.depthCm, segment.depthCm, fromStart / SHORE_RAMP_M)
    : lerp(segment.edgeOutCm ?? segment.depthCm, segment.depthCm, toEnd / SHORE_RAMP_M);
}

/** Index of the segment containing x, searching from a hint. Clamped to the track. */
export function segmentIndexAt(world: World, xM: number, hint = 0): number {
  const last = world.segments.length - 1;
  let index = Math.min(Math.max(hint, 0), last);
  while (index < last && xM >= world.segments[index]!.endM) index += 1;
  while (index > 0 && xM < world.segments[index]!.startM) index -= 1;
  return index;
}
