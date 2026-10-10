import type { Obstacle, TerrainId, Track } from '@rivetrun/contracts';

/** Height features with absolute positions (gameplay v2). */
export type WorldFeature =
  | { readonly type: 'ramp'; readonly startM: number; readonly endM: number; readonly launchDeg: number; readonly heightM: number }
  | { readonly type: 'gap'; readonly startM: number; readonly endM: number }
  | { readonly type: 'drop'; readonly startM: number; readonly endM: number; readonly heightM: number };

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

/** Obstacle sizes in real rover metres. The footprint starts at the contact point and runs forward. */
export const OBSTACLE_SIZE_M: Readonly<Record<Obstacle, { readonly heightM: number; readonly lengthM: number }>> = {
  step: { heightM: 0.035, lengthM: 0.3 },
  log: { heightM: 0.04, lengthM: 0.3 },
  rock: { heightM: 0.05, lengthM: 0.3 },
};

export interface WorldObstacle {
  /** Contact point: the near face of the obstacle (same as startM). */
  readonly xM: number;
  readonly kind: Obstacle;
  readonly segmentIndex: number;
  readonly startM: number;
  readonly endM: number;
  readonly heightM: number;
}

export function makeObstacle(kind: Obstacle, xM: number, segmentIndex: number): WorldObstacle {
  const size = OBSTACLE_SIZE_M[kind];
  return { xM, kind, segmentIndex, startM: xM, endM: xM + size.lengthM, heightM: size.heightM };
}

/** Height of the obstacle's profile under x: a triangle from its near face to its far face. */
export function obstacleHeightAt(obstacles: readonly WorldObstacle[], xM: number): { readonly heightM: number; readonly slopeDeg: number } {
  const obstacle = obstacles.find((o) => xM >= o.startM && xM <= o.endM);
  if (!obstacle) return { heightM: 0, slopeDeg: 0 };
  const half = (obstacle.endM - obstacle.startM) / 2;
  const fromMiddle = xM - (obstacle.startM + half);
  const slopeDeg = (Math.atan(obstacle.heightM / half) * 180) / Math.PI;
  return { heightM: obstacle.heightM * (1 - Math.abs(fromMiddle) / half), slopeDeg: fromMiddle < 0 ? slopeDeg : -slopeDeg };
}

/** A drop is a raised deck: the ground rises to it over this distance before the edge. */
export const DROP_APPROACH_M = 2;

/** Track with absolute positions. Obstacles sit in the middle of their segment. */
export interface World {
  readonly segments: readonly WorldSegment[];
  readonly obstacles: readonly WorldObstacle[];
  readonly features: readonly WorldFeature[];
  readonly lengthM: number;
}

export function compileTrack(track: Track): World {
  let cursor = 0;
  const segments: WorldSegment[] = [];
  const obstacles: WorldObstacle[] = [];
  const features: WorldFeature[] = [];
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
    const feature = segment.feature;
    if (feature?.type === 'ramp') {
      const lengthM = Math.min(feature.lengthM, segment.lengthM);
      features.push({ type: 'ramp', startM: cursor - lengthM, endM: cursor, launchDeg: feature.launchDeg, heightM: lengthM * Math.tan((feature.launchDeg * Math.PI) / 180) });
    } else if (feature?.type === 'gap') {
      features.push({ type: 'gap', startM, endM: startM + Math.min(feature.widthM, segment.lengthM) });
    } else if (feature?.type === 'drop') {
      features.push({ type: 'drop', startM, endM: startM, heightM: feature.heightM });
    }
    if (segment.obstacle) {
      obstacles.push(makeObstacle(segment.obstacle, startM + segment.lengthM / 2, index));
    }
  });
  return { segments, obstacles, features, lengthM: cursor };
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
