import type { Action } from '@rivetrun/contracts';
import { ACTION_PROFILES, PHYSICS, step } from './physics';
import type { RunState } from './types';

export type WayOut = 'climb' | 'ease' | 'winch' | 'throttle';

const PROBE_S = 3;
const FREED_M = 0.5;
const COMMAND: Readonly<Record<WayOut, Action>> = { climb: 'climb_mode', ease: 'slow_down', winch: 'deploy_winch', throttle: 'accelerate' };

/** Does this command move the robot forward from here within 3 s? Tried on the real ground with a fresh stuck timer. */
function frees(state: RunState, action: Action): boolean {
  let probe: RunState = { ...state, lastProgressT: state.sim.t };
  const steps = Math.round(PROBE_S / 0.05);
  for (let i = 0; i < steps && !probe.done; i += 1) probe = step(probe, action);
  return probe.finished || probe.sim.x - state.sim.x >= FREED_M;
}

/** The command in force is already getting the robot out: there is nothing to warn about. */
export function movingOut(state: RunState): boolean {
  return !state.done && ACTION_PROFILES[state.action].speed > 0 && frees(state, state.action);
}

/**
 * For a player whose robot is getting nowhere: the command that moves this build forward again from here, found by
 * trying each one on the real ground for 3 s. Undefined when none does (the build cannot pass this spot).
 * Not for brains: it reads the true track.
 */
export function wayOut(state: RunState): WayOut | undefined {
  if (state.done) return undefined;
  const driving = ACTION_PROFILES[state.action].speed > 0;
  const candidates: WayOut[] = [
    ...(driving ? [] : (['throttle'] as const)),
    ...(state.action === 'climb_mode' ? [] : (['climb'] as const)),
    'ease',
    ...(state.spec.extras.includes('winch') ? (['winch'] as const) : []),
  ];
  return candidates.find((candidate) => frees(state, COMMAND[candidate]));
}

export const STUCK_RULES = { afterS: PHYSICS.stuckAfterS, warnS: PHYSICS.stuckWarnS } as const;
