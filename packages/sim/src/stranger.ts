import type { Action, Build, Mission, Outcome } from '@rivetrun/contracts';
import { heuristicDecide } from './brains';
import { driveSeed } from './data';
import { START_TRIGGER, advanceBrain, buildQuestion } from './perception';
import { createRun, step } from './physics';
import { score } from './score';

/** What a first-time player does: holds full throttle and touches nothing else. On the mission's Drive seed. */
export function naiveDrive(build: Build, mission: Mission): Outcome {
  let state = createRun({ mission, seed: driveSeed(mission), build, priority: 0.5, manual: true });
  while (!state.done) state = advanceBrain(step(state, 'accelerate')).state;
  return score(state);
}

/** The heuristic's commands driven as a player would give them (no reverse gear, no auto-timed jump). */
export function carefulDrive(build: Build, mission: Mission): Outcome {
  let state = createRun({ mission, seed: driveSeed(mission), build, priority: 0.5, manual: true });
  const asPlayer = (action: Action): Action => (action === 'reverse' ? 'brake' : action);
  let action = asPlayer(heuristicDecide(buildQuestion(state, START_TRIGGER)).selected);
  while (!state.done) {
    const advanced = advanceBrain(step(state, action));
    state = advanced.state;
    if (advanced.trigger && !state.done) action = asPlayer(heuristicDecide(buildQuestion(state, advanced.trigger)).selected);
  }
  return score(state);
}

export interface FullThrottleCheck {
  /** Does holding full throttle and nothing else finish this mission with this build? */
  readonly finishes: boolean;
  readonly outcome: Outcome;
  /** Careful driving finishes where full throttle does not: the problem is the driving, not the build. */
  readonly drivable: boolean;
  /** For the Brief in Drive mode: what to do differently. Absent when full throttle finishes, or when no driving saves this build. */
  readonly tip?: string;
}

/** Drive-mode warning for the Brief: will a stranger holding the throttle get through, and if not, what should they do? */
export function fullThrottleCheck(build: Build, mission: Mission): FullThrottleCheck {
  const outcome = naiveDrive(build, mission);
  if (outcome.finished) return { finishes: true, outcome, drivable: true };
  const drivable = carefulDrive(build, mission).finished;
  if (!drivable) return { finishes: false, outcome, drivable };
  const why = outcome.why ?? 'it does not finish';
  return { finishes: false, outcome, drivable, tip: `Full throttle all the way does not finish this one. ${why}.` };
}
