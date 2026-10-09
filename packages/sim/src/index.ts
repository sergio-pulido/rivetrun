// @rivetrun/sim — deterministic simulation core. Pure TS: no DOM, no React, no Node APIs.
// Scaffold: data is real (v0), every function below is a typed stub owned by the sim session.
import type {
  Action,
  Brain,
  Build,
  DecisionTrigger,
  LookaheadEntry,
  Mission,
  Outcome,
  Perception,
} from '@rivetrun/contracts';
import { notImplemented } from './notImplemented';
import type { HeadlessResult, RunConfig, RunController, RunControllerOptions, RunState } from './types';

export * from './data';
export * from './types';
export { NotImplementedError } from './notImplemented';

export function createRun(_config: RunConfig): RunState {
  return notImplemented('createRun');
}

/** Advances one fixed timestep (TUNING.dtMs) under the given action. Pure. */
export function step(_state: RunState, _action: Action): RunState {
  return notImplemented('step');
}

/** What the build's sensors report, with seeded noise. Never ground truth. */
export function perceive(_state: RunState): Perception {
  return notImplemented('perceive');
}

/** Forward-simulates each action for TUNING.decision.lookaheadS on the perceived state. */
export function lookahead(_state: RunState, _actions: readonly Action[]): LookaheadEntry[] {
  return notImplemented('lookahead');
}

/** Returns the trigger when `next` is a decision point, otherwise null. */
export function detectDecisionPoint(_prev: RunState, _next: RunState): DecisionTrigger | null {
  return notImplemented('detectDecisionPoint');
}

/** Actions the build can perform (e.g. deploy_winch needs a winch). */
export function availableActions(_build: Build): Action[] {
  return notImplemented('availableActions');
}

/** Final Outcome (score + stars) for a finished or DNF run. */
export function score(_state: RunState): Outcome {
  return notImplemented('score');
}

/** Deterministic policy: best lookahead utility for the player's priority. Also Jev's fallback. */
export const heuristicBrain: Brain = {
  decide: async () => notImplemented('heuristicBrain.decide'),
};

/** Seeded uniform choice over the available actions. */
export function randomBrain(_seed: number): Brain {
  return {
    decide: async () => notImplemented('randomBrain.decide'),
  };
}

/** Async loop: step → decision point → await brain.decide → apply. Emits RunEvents. Browser-safe. */
export function runController(_config: RunConfig, _brain: Brain, _options: RunControllerOptions): RunController {
  return notImplemented('runController');
}

/** No timers: runs to finish/DNF as fast as possible. Ghost frames at TUNING.ghostHz. */
export function runHeadless(_mission: Mission, _seed: number, _build: Build, _brain: Brain): Promise<HeadlessResult> {
  return notImplemented('runHeadless');
}
