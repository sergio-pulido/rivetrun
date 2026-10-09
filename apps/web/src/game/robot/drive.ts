import { createContext, type RefObject } from 'react';
import type { Action } from '@rivetrun/contracts';

export type Expression = Action | 'idle' | 'thinking' | 'slip' | 'hurt' | 'dnf' | 'finish';

/** Per-frame inputs of a robot. Mutated by the scene, read in useFrame: no re-renders. */
export interface RobotDrive {
  /** rad/s. */
  wheelSpin: number;
  /** m/s, for suspension jiggle. */
  speed: number;
  /** 0–1. */
  slip: number;
  expression: Expression;
  /** Parts fly off while true and snap back when it clears. */
  dnf: boolean;
  winch: boolean;
  /** Thruster kit is pushing the robot under water. */
  thrusting: boolean;
}

export const restDrive = (): RobotDrive => ({
  wheelSpin: 0, speed: 0, slip: 0, expression: 'idle', dnf: false, winch: false, thrusting: false,
});

export interface RobotContextValue {
  readonly drive: RefObject<RobotDrive>;
  /** New parts pop in with a spring (workshop). */
  readonly popIn: boolean;
  /** Skip tiny details (ghosts). */
  readonly lite: boolean;
  /** The scout drone is flying ahead (run view): leave its landing pad empty. */
  readonly droneAway: boolean;
}

export const RobotContext = createContext<RobotContextValue | null>(null);

export interface LocomotionGeometry {
  /** Wheel / sprocket radius. */
  readonly radius: number;
  /** Height of the chassis plate centre above the ground. */
  readonly deckY: number;
  /** Half distance between the left and right wheels. */
  readonly halfTrack: number;
  /** Half wheelbase. */
  readonly halfBase: number;
}

export const LOCOMOTION_GEOMETRY: Readonly<Record<string, LocomotionGeometry>> = {
  wheels: { radius: 0.3, deckY: 0.4, halfTrack: 0.5, halfBase: 0.5 },
  offroad_wheels: { radius: 0.4, deckY: 0.54, halfTrack: 0.56, halfBase: 0.54 },
  tracks: { radius: 0.25, deckY: 0.46, halfTrack: 0.52, halfBase: 0.58 },
};

export const locomotionGeometry = (id: string): LocomotionGeometry =>
  LOCOMOTION_GEOMETRY[id] ?? LOCOMOTION_GEOMETRY.wheels!;
