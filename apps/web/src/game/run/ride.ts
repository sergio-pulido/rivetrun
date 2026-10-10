import { locomotionGeometry } from '../robot/drive';
import { damp } from '../rng';
import { HEIGHT_SCALE, groundRise, rideOffset, sampleTrack, wheelLift, type LaidSegment, type TrackLayout } from '../track';

const DEG = Math.PI / 180;

/** How a robot stands on the track. The sim's x is its nose; each axle rides the ground under it. */
export interface Stance {
  readonly halfBase: number;
  readonly radius: number;
  /** From the middle of the robot to its nose: the front of the front tyres, where it meets an obstacle. */
  readonly nose: number;
  /** Tracks: the belt between the sprockets also rests on whatever is under it. */
  readonly belt: boolean;
}

export function stanceFor(locomotion: string): Stance {
  const geo = locomotionGeometry(locomotion);
  return { halfBase: geo.halfBase, radius: geo.radius, nose: geo.halfBase + geo.radius, belt: locomotion === 'tracks' };
}

interface Axle {
  target: number;
  slack: number;
  /** Where the axle is drawn above the track line. */
  lift: number;
}

/** Where a robot is drawn this frame, plus what it carries between frames. */
export interface Ride {
  /** Track distance of the middle of the robot. */
  s: number;
  x: number;
  y: number;
  pitch: number;
  segment: LaidSegment | null;
  front: Axle;
  rear: Axle;
  lean: number;
}

export const restRide = (): Ride => ({
  s: 0,
  x: 0,
  y: 0,
  pitch: 0,
  segment: null,
  front: { target: 0, slack: 0, lift: 0 },
  rear: { target: 0, slack: 0, lift: 0 },
  lean: 0,
});

/**
 * An axle follows its target exactly while it moves smoothly. A step in one frame (take-off, rolling
 * off a ledge, landing) is eased instead, and never eased into the ground.
 */
function settle(axle: Axle, target: number, floor: number, reset: boolean, dt: number): number {
  const jump = target - axle.target;
  const stepped = Math.abs(jump) > Math.max(0.12, 9 * dt);
  axle.target = target;
  axle.slack = reset ? 0 : damp(stepped ? axle.slack - jump : axle.slack, 0, 14, dt);
  axle.lift = Math.max(floor, target + axle.slack);
  return axle.lift;
}

export interface RideInput {
  /** The sim's x: track distance of the robot's nose. */
  readonly nose: number;
  /** Height above the track while airborne, sim metres; null on the ground. */
  readonly airM: number | null;
  /** SimState.pitch and SimState.slopeDeg. */
  readonly pitchDeg: number;
  readonly slopeDeg: number;
}

/**
 * Places a robot on the track from the sim's state. On the ground both axles ride the sim's solid
 * ground (ramps, the deck before a drop, obstacle footprints), so the wheels roll over what is drawn.
 * In the air the body takes the sim's height and pitch, and still never passes through the ground.
 */
export function rideOver(layout: TrackLayout, stance: Stance, input: RideInput, reset: boolean, dt: number, ride: Ride): void {
  const { halfBase, radius } = stance;
  const s = input.nose - stance.nose;
  const sample = sampleTrack(layout, s);
  const frontGround = wheelLift(layout, s + halfBase, radius);
  const rearGround = wheelLift(layout, s - halfBase, radius);
  let front = frontGround;
  let rear = rearGround;
  // On the ground the sim's pitch is the surface plus a lean from accelerating: the surface is drawn here.
  let lean = sample.slopeRad + (input.pitchDeg - input.slopeDeg) * DEG;
  if (input.airM !== null) {
    const centre = input.airM * HEIGHT_SCALE;
    const reach = Math.tan(input.pitchDeg * DEG) * halfBase;
    front = Math.max(front, centre + reach);
    rear = Math.max(rear, centre - reach);
    lean = 0;
  }
  if (stance.belt) {
    for (const corner of layout.corners) {
      const u = (corner - (s - halfBase)) / (halfBase * 2);
      if (u <= 0 || u >= 1) continue;
      const top = groundRise(layout, corner);
      if (top <= rear + (front - rear) * u) continue;
      // The belt rests on the corner and the end nearer to it is carried up: a see-saw over a log.
      if (u > 0.5) front = rear + (top - rear) / u;
      else rear = front + (top - front) / (1 - u);
    }
  }
  const f = settle(ride.front, front, frontGround, reset, dt);
  const r = settle(ride.rear, rear, rearGround, reset, dt);
  ride.lean = reset ? lean : damp(ride.lean, lean, 9, dt);
  ride.s = s;
  ride.x = sample.x;
  ride.y = sample.y + rideOffset(sample.segment, s) + (f + r) / 2;
  ride.pitch = ride.lean + Math.atan2(f - r, halfBase * 2);
  ride.segment = sample.segment;
}
