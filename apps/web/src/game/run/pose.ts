/** Where the player robot is drawn this frame. Shared by camera, ghosts, drone and particles. */
export interface Pose {
  ready: boolean;
  /** Track distance, metres. */
  s: number;
  x: number;
  y: number;
  v: number;
  /** Interpolated sim time: ghosts play against it. */
  t: number;
  shakeUntil: number;
  thinking: boolean;
}

export const restPose = (): Pose => ({ ready: false, s: 0, x: 0, y: 0, v: 0, t: 0, shakeUntil: 0, thinking: false });
