import type { Obstacle, TerrainId, Track } from '@rivetrun/contracts';
import { clamp } from './rng';

/** One piece of laid-out track in world space (X = along the track, Y = up). */
export interface LaidSegment {
  /** Index in mission.track.segments, or −1 for the start / finish pads. */
  readonly index: number;
  readonly terrain: TerrainId;
  readonly pad: boolean;
  readonly s0: number;
  readonly s1: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly slopeRad: number;
  readonly obstacle?: Obstacle;
  /** Visual basin depth in world units (water only). */
  readonly basin: number;
}

export interface TrackLayout {
  readonly segments: readonly LaidSegment[];
  readonly lengthM: number;
  readonly minY: number;
  readonly maxY: number;
}

export const PAD_BEFORE_M = 9;
export const PAD_AFTER_M = 12;
const BASIN_RAMP_M = 0.9;

/** Lays the mission track out on the XY plane, with a flat pad before and after. */
export function layoutTrack(track: Track): TrackLayout {
  const segments: LaidSegment[] = [];
  let s = 0;
  let x = 0;
  let y = 0;
  let minY = 0;
  let maxY = 0;
  segments.push({ index: -1, terrain: 'asphalt', pad: true, s0: -PAD_BEFORE_M, s1: 0, x0: -PAD_BEFORE_M, y0: 0, x1: 0, y1: 0, slopeRad: 0, basin: 0 });
  track.segments.forEach((segment, index) => {
    const slopeRad = (segment.slopeDeg * Math.PI) / 180;
    const x1 = x + Math.cos(slopeRad) * segment.lengthM;
    const y1 = y + Math.sin(slopeRad) * segment.lengthM;
    const basin = segment.terrain === 'water' ? clamp(((segment.depthCm ?? 8) / 100) * 4, 0.3, 0.7) : 0;
    segments.push({
      index, terrain: segment.terrain, pad: false, s0: s, s1: s + segment.lengthM, x0: x, y0: y, x1, y1, slopeRad,
      obstacle: segment.obstacle, basin,
    });
    s += segment.lengthM;
    x = x1;
    y = y1;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  segments.push({ index: -1, terrain: 'asphalt', pad: true, s0: s, s1: s + PAD_AFTER_M, x0: x, y0: y, x1: x + PAD_AFTER_M, y1: y, slopeRad: 0, basin: 0 });
  return { segments, lengthM: s, minY, maxY };
}

export function segmentAt(layout: TrackLayout, s: number): LaidSegment {
  const list = layout.segments;
  for (let i = 0; i < list.length; i += 1) {
    const segment = list[i]!;
    if (s < segment.s1) return segment;
  }
  return list[list.length - 1]!;
}

/** Where the obstacle of a segment sits. The sim owns the truth; the renderer assumes the middle. */
export const obstacleS = (segment: LaidSegment): number => (segment.s0 + segment.s1) / 2;

export const OBSTACLE_HEIGHT: Readonly<Record<Obstacle, number>> = { rock: 0.3, step: 0.22, log: 0.3 };

/** How far below the track line the visible floor is at distance s (water basins). */
export function basinDepthAt(segment: LaidSegment, s: number): number {
  if (segment.basin <= 0) return 0;
  const fromEdge = Math.min(s - segment.s0, segment.s1 - s);
  return segment.basin * clamp(fromEdge / BASIN_RAMP_M, 0, 1);
}

export interface TrackSample {
  readonly x: number;
  readonly y: number;
  readonly slopeRad: number;
  readonly segment: LaidSegment;
}

/** World position of track distance s on the track line (not the basin floor). */
export function sampleTrack(layout: TrackLayout, s: number): TrackSample {
  const segment = segmentAt(layout, s);
  const span = segment.s1 - segment.s0;
  const f = span > 0 ? (s - segment.s0) / span : 0;
  return {
    x: segment.x0 + (segment.x1 - segment.x0) * f,
    y: segment.y0 + (segment.y1 - segment.y0) * f,
    slopeRad: segment.slopeRad,
    segment,
  };
}

/** Cosmetic ride offset: sink into basins and mud, hop over obstacles. */
export function rideOffset(segment: LaidSegment, s: number): number {
  let offset = -basinDepthAt(segment, s) * 0.85;
  if (segment.terrain === 'mud' && !segment.pad) {
    offset -= 0.07 * clamp(Math.min(s - segment.s0, segment.s1 - s) / 0.6, 0, 1);
  }
  if (segment.obstacle) {
    const d = Math.abs(s - obstacleS(segment));
    const reach = 0.75;
    if (d < reach) {
      const k = 1 - d / reach;
      offset += OBSTACLE_HEIGHT[segment.obstacle] * k * k * (3 - 2 * k);
    }
  }
  return offset;
}
