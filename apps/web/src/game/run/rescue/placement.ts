import { LANES } from '../../palette';
import { mulberry32 } from '../../rng';
import { groundRise, sampleTrack, segmentAt, type Incline, type LaidObstacle, type TrackLayout } from '../../track';
import { PROPS, type PropId } from './kit';

// Where the M7 prop kit stands. Everything is derived from the sim's own geometry (the laid-out track and the
// mission's scan zones) and nothing is placed where a robot can be: props keep to the strip behind the last lane
// and to the front edge, never span a hole, and only a slab lying flat on its surface touches a ramp, deck or step.

/** Half-width a robot needs clear around its lane centre (as in Dressing). */
export const LANE_CLEARANCE = 0.74;
const LANE_GAP = 0.05;
/** A prop at the back may hang this far past the track's back edge: from the camera its base is out of sight. */
const BACK_OVERHANG = 1.6;
const FRONT_OVERHANG = 0.12;
/** Front-edge props stay this low so they never hide a robot. */
export const FRONT_MAX_HEIGHT = 0.2;
/** Start gate and finish line stay clear. */
const START_CLEAR = 1.6;
const END_CLEAR = 1.5;
/** Props taller than this keep away from scan-pad labels and distance signs. */
const TALL = 1.05;

export interface ScanSpan {
  readonly atM: number;
  readonly halfLengthM: number;
}

export interface Placement {
  readonly prop: PropId;
  readonly side: 'back' | 'front';
  /** Track distance of the middle of the prop, and half its footprint along the track and in depth. */
  readonly s: number;
  readonly halfS: number;
  readonly halfZ: number;
  /** Height above its base, world units. */
  readonly height: number;
  /** World position of the middle of its base. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Lean along the track, radians: the surface it lies on. */
  readonly slope: number;
  readonly scale: number;
}

export interface PlacementInput {
  readonly layout: TrackLayout;
  readonly zones?: readonly ScanSpan[];
  /** Lane centres in use. Defaults to all three. */
  readonly lanes?: readonly number[];
  /** 0–1: how much of the decorative scenery to place. Markers on scan zones and hazards are always placed. */
  readonly budget?: number;
}

interface Span {
  readonly s0: number;
  readonly s1: number;
}

interface Request {
  readonly prop: PropId;
  readonly side: 'back' | 'front';
  readonly s: number;
  readonly scale: number;
  readonly yaw?: number;
  /** The one hole this prop may span (hazard tape: its posts stand either side). */
  readonly across?: Span;
  /** The incline or step this prop lies on. */
  readonly onto?: Incline | LaidObstacle;
  /** A scan-zone beacon or hazard tape: allowed next to pad labels and signs, and (wholly) on an incline's surface. */
  readonly marker?: boolean;
  /** Extra distance from the lanes, world units. */
  readonly back?: number;
}

const overlaps = (span: Span, s0: number, s1: number, pad: number): boolean => s1 > span.s0 - pad && s0 < span.s1 + pad;

const DEFAULT_LANES: readonly number[] = [LANES.player, LANES.heuristic, LANES.random];
const STREET: readonly PropId[] = ['slab_rebar', 'cracked_slab_03', 'crash_barrier', 'rubble_pile_01'];
const ROUGH: readonly PropId[] = ['rubble_pile_02', 'rubble_pile_01'];
const FRONT: readonly PropId[] = ['cracked_slab_01', 'cracked_slab_02'];

/** Every prop of the kit for one track, in a stable order. Pure: same input, same street. */
export function placeRescueKit({ layout, zones = [], lanes = DEFAULT_LANES, budget = 1 }: PlacementInput): Placement[] {
  const rand = mulberry32(7007);
  const out: Placement[] = [];
  const backLimit = Math.min(...lanes) - LANE_CLEARANCE - LANE_GAP;
  const frontLimit = Math.max(...lanes) + LANE_CLEARANCE + LANE_GAP;
  const room = { back: backLimit - (LANES.zBack - BACK_OVERHANG), front: LANES.zFront + FRONT_OVERHANG - frontLimit } as const;
  const pads: Span[] = zones.map((zone) => ({ s0: zone.atM - zone.halfLengthM, s1: zone.atM + zone.halfLengthM }));

  const footprint = (prop: PropId, scale: number, yaw: number): { halfS: number; halfZ: number } => {
    const [long, , deep] = PROPS[prop].envelope;
    const c = Math.abs(Math.cos(yaw));
    const k = Math.abs(Math.sin(yaw));
    return { halfS: ((c * long + k * deep) * scale) / 2, halfZ: ((k * long + c * deep) * scale) / 2 };
  };
  /** The largest scale up to `want` at which the prop fits its strip. */
  const fit = (prop: PropId, side: 'back' | 'front', want: number, yaw = 0): number => {
    const unit = footprint(prop, 1, yaw);
    const byDepth = room[side] / (unit.halfZ * 2);
    const byHeight = side === 'front' ? FRONT_MAX_HEIGHT / PROPS[prop].envelope[1] : Infinity;
    return Math.min(want, byDepth, byHeight);
  };

  const place = (request: Request): boolean => {
    const { prop, side, s, scale, yaw = 0, across, onto, marker = false, back = 0 } = request;
    if (!(scale > 0.2)) return false;
    const { halfS, halfZ } = footprint(prop, scale, yaw);
    const height = PROPS[prop].envelope[1] * scale;
    const s0 = s - halfS;
    const s1 = s + halfS;
    if (s0 < START_CLEAR || s1 > layout.lengthM - END_CLEAR) return false;
    if (halfZ * 2 + back > room[side] + 1e-6) return false;
    if (side === 'front' && height > FRONT_MAX_HEIGHT + 1e-6) return false;
    // The sim's geometry: holes, ramps and decks, obstacles.
    if (layout.gaps.some((gap) => gap !== across && overlaps(gap, s0, s1, 0.25))) return false;
    if (across && !(across.s0 - s0 > 0.4 && s1 - across.s1 > 0.4)) return false;
    if (layout.inclines.some((incline) => incline !== onto && !(marker && s0 > incline.s0 && s1 < incline.s1) && overlaps(incline, s0, s1, 0.12))) return false;
    if (layout.obstacles.some((obstacle) => obstacle !== onto && overlaps(obstacle, s0, s1, 0.3))) return false;
    if (onto && !(s0 >= onto.s0 && s1 <= onto.s1)) return false;
    if (side === 'back' && !marker && height > TALL) {
      if (pads.some((pad) => overlaps(pad, s0, s1, 1.2))) return false;
      const sign = Math.round(s / 10) * 10;
      if (sign > 0 && Math.abs(s - sign) < halfS + 0.8) return false;
    }
    if (out.some((other) => other.side === side && overlaps({ s0: other.s - other.halfS, s1: other.s + other.halfS }, s0, s1, 0.1))) return false;

    const here = sampleTrack(layout, s);
    let lift = 0;
    let slope = here.slopeRad;
    if (onto && 'rise' in onto) {
      lift = groundRise(layout, s);
      slope += Math.atan2(onto.rise, onto.s1 - onto.s0);
    } else if (onto) lift = onto.height;
    // A marker on an incline stands on its lower edge, so it never floats.
    else if (marker) lift = Math.min(groundRise(layout, s0), groundRise(layout, s1));
    const z = side === 'back' ? backLimit - back - halfZ : frontLimit + back + halfZ;
    out.push({ prop, side, s, halfS, halfZ, height, x: here.x, y: here.y + lift, z, yaw, slope, scale });
    return true;
  };

  // Rescue beacons mark both ends of every scan zone, at the back of the pad.
  for (const zone of zones) {
    for (const end of [-1, 1]) place({ prop: 'rescue_beacon', side: 'back', s: zone.atM + end * (zone.halfLengthM + 0.22), scale: 1.45, marker: true });
  }

  // A broken slab lies on every ramp, deck and step: flat on the sim's surface, behind the last lane.
  for (const incline of layout.inclines) {
    const length = incline.s1 - incline.s0;
    const prop: PropId = length > 2.3 ? 'cracked_slab_03' : 'cracked_slab_01';
    const scale = fit(prop, 'back', Math.min(1.1, (length * 0.84) / PROPS[prop].envelope[0]));
    const mid = (incline.s0 + incline.s1) / 2;
    if (!place({ prop, side: 'back', s: mid, scale, onto: incline })) place({ prop, side: 'back', s: mid - length * 0.18, scale: scale * 0.6, onto: incline });
    if (budget >= 1) place({ prop: 'cracked_slab_02', side: 'front', s: mid, scale: fit('cracked_slab_02', 'front', (length * 0.5) / PROPS.cracked_slab_02.envelope[0]), onto: incline });
  }
  for (const obstacle of layout.obstacles) {
    if (obstacle.kind !== 'step') continue;
    const length = obstacle.s1 - obstacle.s0;
    place({ prop: 'cracked_slab_01', side: 'back', s: (obstacle.s0 + obstacle.s1) / 2, scale: fit('cracked_slab_01', 'back', (length * 0.84) / PROPS.cracked_slab_01.envelope[0]), onto: obstacle });
  }

  // Holes are cordoned off: hazard tape across where both posts find level ground, a work light on the far side.
  for (const gap of layout.gaps) {
    const taped = place({ prop: 'warning_tape_posts', side: 'back', s: (gap.s0 + gap.s1) / 2, scale: 1, across: gap, marker: true, back: 0.08 });
    if (taped && budget < 1) continue;
    const light = footprint('emergency_tripod_light', 0.8, 0);
    const after = taped ? (gap.s0 + gap.s1) / 2 + (PROPS.warning_tape_posts.envelope[0] / 2 + 0.2 + light.halfS) : gap.s1 + 0.45 + light.halfS;
    place({ prop: 'emergency_tripod_light', side: 'back', s: after, scale: 0.8 }) || place({ prop: 'emergency_tripod_light', side: 'back', s: gap.s0 - 0.45 - light.halfS, scale: 0.8 });
  }
  // The drop ends in a bent crash barrier along the lower street.
  for (const incline of layout.inclines) {
    if (incline.kind !== 'drop') continue;
    const scale = 0.85;
    place({ prop: 'crash_barrier', side: 'back', s: incline.s1 + 0.4 + footprint('crash_barrier', scale, 0).halfS, scale, back: 0.1 });
  }

  // The rest of the street: rubble where the ground is rough, walls and slabs along the asphalt.
  const spacing = budget >= 1 ? 1 : 2.2;
  // What is left of a wall stands at intervals: the tall silhouettes of the street, placed first so they get their room.
  for (let from = 6; from < layout.lengthM - END_CLEAR - 3; from += budget >= 1 ? 14 : 22) {
    for (let s = from; s < from + 5; s += 0.5) {
      if (segmentAt(layout, s).terrain !== 'asphalt') continue;
      const yaw = (rand() - 0.5) * 0.14;
      if (place({ prop: 'collapsed_wall', side: 'back', s, scale: 0.9 + rand() * 0.1, yaw, back: rand() * 0.08 })) break;
    }
  }
  let picked = 0;
  for (let s = START_CLEAR + 1; s < layout.lengthM - END_CLEAR; ) {
    const rough = segmentAt(layout, s).terrain !== 'asphalt';
    // Rough ground is rubble: a full pile, or a smaller one where less room is free. The asphalt gets slabs, rebar and
    // barriers in turn. Where nothing else fits, a low slab.
    const pile = ROUGH[picked % ROUGH.length]!;
    const tries: ReadonlyArray<readonly [PropId, number]> = rough
      ? [[pile, 1], [pile, 0.62], [pile, 0.42], ['cracked_slab_02', 1]]
      : [[STREET[picked % STREET.length]!, 1], [STREET[(picked + 1) % STREET.length]!, 1], ['cracked_slab_02', 1]];
    let advance = 0.7;
    for (const [prop, shrink] of tries) {
      const heap = prop.startsWith('rubble_pile');
      const yaw = heap ? (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.5 : (rand() - 0.5) * 0.16;
      const scale = fit(prop, 'back', heap ? 0.95 : 1, yaw) * (0.9 + rand() * 0.1) * shrink;
      const { halfS } = footprint(prop, scale, yaw);
      if (!place({ prop, side: 'back', s: s + halfS, scale, yaw, back: rand() * 0.08 })) continue;
      picked += 1;
      advance = halfS * 2 + (0.5 + rand() * 1.3) * spacing;
      break;
    }
    s += advance;
  }
  // Low cracked slabs along the front edge.
  picked = 0;
  for (let s = START_CLEAR + 2.2; s < layout.lengthM - END_CLEAR; ) {
    const prop = FRONT[picked % FRONT.length]!;
    const yaw = (rand() - 0.5) * 0.5;
    const scale = fit(prop, 'front', 0.7, yaw);
    if (place({ prop, side: 'front', s, scale, yaw })) {
      picked += 1;
      s += (3.4 + rand() * 2.6) * spacing;
    } else s += 0.9;
  }
  return out;
}
