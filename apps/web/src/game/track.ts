import type { Obstacle, TerrainId, Track } from '@rivetrun/contracts';
import { DROP_APPROACH_M, SHORE_RAMP_M, compileTrack, waterDepthCmAt, type WorldSegment } from '@rivetrun/sim';
import { clamp } from './rng';

/**
 * Sim metres of height → world units. The robot is drawn several times larger than its real hull,
 * so a true-scale hop would barely clear its own axles: height is doubled to read as a jump.
 * Distance along the track is never scaled, so where a jump lands is exact.
 */
export const HEIGHT_SCALE = 2;
/**
 * The rover is drawn this many times its real size (the sim's 5 cm wheel is 0.3 units here).
 * An obstacle is something its wheels touch, so its height is scaled with the robot, not with jumps.
 */
export const ROBOT_SCALE = 6;
/** How deep a gap is drawn. */
export const PIT_DEPTH = 2.6;
const PIT_WALL_M = 0.04;

/** A kicker ramp or the deck before a drop: a straight incline from 0 at s0 to `rise` world units at s1, the sim's own ground. */
export interface Incline {
  readonly s0: number;
  readonly s1: number;
  readonly rise: number;
  readonly kind: 'ramp' | 'drop';
}

/** A solid obstacle: the sim's footprint (contact at s0, running forward to s1) at the robot's drawn scale. */
export interface LaidObstacle {
  readonly kind: Obstacle;
  readonly s0: number;
  readonly s1: number;
  /** Top of the obstacle above the ground it stands on, world units. */
  readonly height: number;
}

/** A hole in the track. */
export interface Gap {
  readonly s0: number;
  readonly s1: number;
}

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
  /** Visual basin depth in world units at the segment's full depth (water only; 0 = dry). */
  readonly basin: number;
  /** The sim's view of a water segment: the bed profile is read from it, never re-derived here. */
  readonly water: WorldSegment | null;
  /** This end of the water meets dry ground (a short beach) rather than more water. */
  readonly dryIn: boolean;
  readonly dryOut: boolean;
  /** A gap inside this segment. */
  readonly gap?: Gap;
}

export interface TrackLayout {
  readonly segments: readonly LaidSegment[];
  /** Kicker ramps and drop approaches: wedges that robots drive up. */
  readonly inclines: readonly Incline[];
  readonly obstacles: readonly LaidObstacle[];
  readonly gaps: readonly Gap[];
  /** Track distances where the solid ground has a corner (an obstacle's faces and top, the lip of a wedge). */
  readonly corners: readonly number[];
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
  // Positions come resolved from the sim: ramps end at their segment's end, gaps and drops start theirs.
  const inclines: Incline[] = [];
  const gaps: Gap[] = [];
  for (const feature of world.features) {
    if (feature.type === 'ramp') inclines.push({ s0: feature.startM, s1: feature.endM, rise: feature.heightM * HEIGHT_SCALE, kind: 'ramp' });
    if (feature.type === 'gap') gaps.push({ s0: feature.startM, s1: feature.endM });
    if (feature.type === 'drop' && feature.startM > 0) {
      inclines.push({ s0: Math.max(0, feature.startM - DROP_APPROACH_M), s1: feature.startM, rise: feature.heightM * HEIGHT_SCALE, kind: 'drop' });
    }
  }
  const obstacles: LaidObstacle[] = world.obstacles.map((obstacle) => ({
    kind: obstacle.kind,
    s0: obstacle.startM,
    s1: obstacle.endM,
    height: obstacle.heightM * ROBOT_SCALE,
  }));
  const corners = [...inclines.map((incline) => incline.s1), ...obstacles.flatMap((o) => [o.s0, (o.s0 + o.s1) / 2, o.s1])];
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
      basin: wet ? basinUnits(segment.depthCm ?? 8) : 0,
      water: wet ? (world.segments[index] ?? null) : null,
      dryIn: wet && track.segments[index - 1]?.terrain !== 'water',
      dryOut: wet && track.segments[index + 1]?.terrain !== 'water',
      gap: gaps.find((gap) => gap.s0 >= s - 0.001 && gap.s0 < s + segment.lengthM),
    });
    s += segment.lengthM;
    x = x1;
    y = y1;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  segments.push({ index: -1, terrain: 'asphalt', pad: true, s0: s, s1: s + PAD_AFTER_M, x0: x, y0: y, x1: x + PAD_AFTER_M, y1: y, slopeRad: 0, ...DRY });
  return { segments, inclines, obstacles, gaps, corners, lengthM: s, minY, maxY };
}

export function segmentAt(layout: TrackLayout, s: number): LaidSegment {
  const list = layout.segments;
  for (let i = 0; i < list.length; i += 1) {
    const segment = list[i]!;
    if (s < segment.s1) return segment;
  }
  return list[list.length - 1]!;
}

/**
 * Top surface of an obstacle at s, world units above the ground it stands on: the silhouette that is
 * drawn, inside the sim's footprint and up to the sim's height. A step is a block, a log is round
 * (widest half-way up), a rock is a mound.
 */
export function obstacleTop(obstacle: LaidObstacle, s: number): number {
  if (s < obstacle.s0 || s > obstacle.s1) return 0;
  if (obstacle.kind === 'step') return obstacle.height;
  const w = ((s - obstacle.s0) / (obstacle.s1 - obstacle.s0)) * 2 - 1;
  const arc = Math.sqrt(Math.max(0, 1 - w * w));
  return obstacle.kind === 'log' ? (obstacle.height / 2) * (1 + arc) : obstacle.height * arc;
}

/** How far the solid ground stands above the track line at s: a ramp, the deck before a drop, or an obstacle. */
export function groundRise(layout: TrackLayout, s: number): number {
  let rise = 0;
  for (const incline of layout.inclines) {
    if (s > incline.s0 && s <= incline.s1) rise = Math.max(rise, (incline.rise * (s - incline.s0)) / (incline.s1 - incline.s0));
  }
  for (const obstacle of layout.obstacles) rise = Math.max(rise, obstacleTop(obstacle, s));
  return rise;
}

const WHEEL_SAMPLES = 8;

/**
 * How far a wheel of this radius, centred over s, is lifted by the ground under it. The wheel rolls
 * over corners and never through them, so it starts to climb when its tyre meets the obstacle.
 */
export function wheelLift(layout: TrackLayout, s: number, radius: number): number {
  const near =
    layout.inclines.some((incline) => s + radius > incline.s0 && s - radius < incline.s1) ||
    layout.obstacles.some((obstacle) => s + radius > obstacle.s0 && s - radius < obstacle.s1);
  if (!near) return 0;
  const under = (d: number): number => groundRise(layout, s + d) - (radius - Math.sqrt(Math.max(0, radius * radius - d * d)));
  let lift = 0;
  for (let i = -WHEEL_SAMPLES; i <= WHEEL_SAMPLES; i += 1) lift = Math.max(lift, under((i / WHEEL_SAMPLES) * radius));
  for (const corner of layout.corners) {
    if (Math.abs(corner - s) < radius) lift = Math.max(lift, under(corner - s));
  }
  return lift;
}

/** How far below the water line the bed is at distance s, in world units. 0 on dry ground. */
export function basinDepthAt(segment: LaidSegment, s: number): number {
  if (!segment.water) return 0;
  const at = clamp(s, segment.s0, segment.s1);
  const beachIn = segment.dryIn ? clamp((at - segment.s0) / BEACH_M, 0, 1) : 1;
  const beachOut = segment.dryOut ? clamp((segment.s1 - at) / BEACH_M, 0, 1) : 1;
  return basinUnits(waterDepthCmAt(segment.water, at)) * Math.min(beachIn, beachOut);
}

/** How far the drawn floor is below the track line at s: a water bed or the pit of a gap. */
export function floorDepthAt(segment: LaidSegment, s: number): number {
  const gap = segment.gap;
  const pit = gap ? PIT_DEPTH * clamp(Math.min(s - gap.s0, gap.s1 - s) / PIT_WALL_M, 0, 1) : 0;
  return basinDepthAt(segment, s) + pit;
}

/** Track distances where the drawn floor changes slope (water beds, gap walls). */
export function floorCuts(segment: LaidSegment): number[] {
  const gap = segment.gap;
  const walls = gap ? [gap.s0, gap.s0 + PIT_WALL_M, gap.s1 - PIT_WALL_M, gap.s1].filter((cut) => cut > segment.s0 && cut < segment.s1) : [];
  const cuts = [...basinCuts(segment), ...walls].sort((a, b) => a - b);
  return cuts.filter((cut, i) => i === 0 || cut - cuts[i - 1]! > 0.001);
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

/** Soft ground under the robot: it sinks to the bed of a basin and a little into mud. Solid ground is `wheelLift`. */
export function rideOffset(segment: LaidSegment, s: number): number {
  const depth = basinDepthAt(segment, s);
  // On the bed: wheels stay a touch proud of it in a shallow wade.
  let offset = -Math.max(depth - 0.08, depth * 0.85);
  if (segment.terrain === 'mud' && !segment.pad) {
    offset -= 0.07 * clamp(Math.min(s - segment.s0, segment.s1 - s) / 0.6, 0, 1);
  }
  return offset;
}
