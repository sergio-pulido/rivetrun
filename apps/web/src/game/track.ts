import type { Obstacle, TerrainId, Track } from '@rivetrun/contracts';
import { SHORE_RAMP_M, compileTrack, waterDepthCmAt, type WorldSegment } from '@rivetrun/sim';
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
  /** Visual basin depth in world units at the segment's full depth (water only; 0 = dry). */
  readonly basin: number;
  /** The sim's view of a water segment: the bed profile is read from it, never re-derived here. */
  readonly water: WorldSegment | null;
  /** This end of the water meets dry ground (a short beach) rather than more water. */
  readonly dryIn: boolean;
  readonly dryOut: boolean;
}

export interface TrackLayout {
  readonly segments: readonly LaidSegment[];
  readonly lengthM: number;
  readonly minY: number;
  readonly maxY: number;
}

export const PAD_BEFORE_M = 9;
export const PAD_AFTER_M = 12;
const DRY = { basin: 0, water: null, dryIn: false, dryOut: false } as const;
/** Up to here depth is drawn at 4 units per metre; beyond it more gently, or the channel would be a pit. */
const WADE_CM = 25;
/** A dry shore steps into the water over this distance. */
const BEACH_M = 0.6;

/**
 * Sim depth → visual depth. The robot model is drawn several times larger than its 25 cm hull,
 * so depth is exaggerated to match: a wade reaches the axles, 90 cm closes over the antenna.
 */
export function basinUnits(depthCm: number): number {
  if (depthCm <= 0) return 0;
  return Math.max(0.3, (Math.min(depthCm, WADE_CM) / 100) * 4 + (Math.max(0, depthCm - WADE_CM) / 100) * 2.6);
}

/** Lays the mission track out on the XY plane, with a flat pad before and after. */
export function layoutTrack(track: Track): TrackLayout {
  const segments: LaidSegment[] = [];
  const world = compileTrack(track);
  let s = 0;
  let x = 0;
  let y = 0;
  let minY = 0;
  let maxY = 0;
  segments.push({ index: -1, terrain: 'asphalt', pad: true, s0: -PAD_BEFORE_M, s1: 0, x0: -PAD_BEFORE_M, y0: 0, x1: 0, y1: 0, slopeRad: 0, ...DRY });
  track.segments.forEach((segment, index) => {
    const slopeRad = (segment.slopeDeg * Math.PI) / 180;
    const sloped = { x: x + Math.cos(slopeRad) * segment.lengthM, y: y + Math.sin(slopeRad) * segment.lengthM };
    const wet = segment.terrain === 'water';
    const x1 = wet ? x + segment.lengthM : sloped.x;
    const y1 = wet ? y : sloped.y;
    segments.push({
      index, terrain: segment.terrain, pad: false, s0: s, s1: s + segment.lengthM, x0: x, y0: y, x1, y1,
      // Water lies level: a sloped water segment only changes how deep its bed is (see basinDepthAt).
      slopeRad: wet ? 0 : slopeRad,
      obstacle: segment.obstacle,
      basin: wet ? basinUnits(segment.depthCm ?? 8) : 0,
      water: wet ? (world.segments[index] ?? null) : null,
      dryIn: wet && track.segments[index - 1]?.terrain !== 'water',
      dryOut: wet && track.segments[index + 1]?.terrain !== 'water',
    });
    s += segment.lengthM;
    x = x1;
    y = y1;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  segments.push({ index: -1, terrain: 'asphalt', pad: true, s0: s, s1: s + PAD_AFTER_M, x0: x, y0: y, x1: x + PAD_AFTER_M, y1: y, slopeRad: 0, ...DRY });
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

/** How far below the water line the bed is at distance s, in world units. 0 on dry ground. */
export function basinDepthAt(segment: LaidSegment, s: number): number {
  if (!segment.water) return 0;
  const at = clamp(s, segment.s0, segment.s1);
  const beachIn = segment.dryIn ? clamp((at - segment.s0) / BEACH_M, 0, 1) : 1;
  const beachOut = segment.dryOut ? clamp((segment.s1 - at) / BEACH_M, 0, 1) : 1;
  return basinUnits(waterDepthCmAt(segment.water, at)) * Math.min(beachIn, beachOut);
}

/** Track distances where the bed of a water segment changes slope: enough to draw it with straight spans. */
export function basinCuts(segment: LaidSegment): number[] {
  if (!segment.water) return [segment.s0, segment.s1];
  const half = (segment.s1 - segment.s0) / 2;
  const inside = [
    ...(segment.dryIn ? [BEACH_M] : []),
    Math.min(SHORE_RAMP_M, half),
  ].flatMap((d) => (d < half + 0.001 ? [segment.s0 + d, segment.s1 - d] : []));
  const dryOnly = segment.dryOut && !segment.dryIn ? [segment.s1 - BEACH_M] : [];
  const cuts = [segment.s0, ...inside, ...dryOnly, segment.s1].sort((a, b) => a - b);
  return cuts.filter((cut, i) => i === 0 || cut - cuts[i - 1]! > 0.01);
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
  const depth = basinDepthAt(segment, s);
  // On the bed: wheels stay a touch proud of it in a shallow wade.
  let offset = -Math.max(depth - 0.08, depth * 0.85);
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
