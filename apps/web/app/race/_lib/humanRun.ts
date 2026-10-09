// A human-driven run for Room Race: the phone steps the shared sim itself at the fixed timestep and maps
// touch input to the sim's existing actions, so the physics is the same one Jev drives (docs/GAMEPLAY_V2.md).
import type { Action, Build, ControlInput, Episode, Mission } from '@rivetrun/contracts';
import { availableActions, createRun, score, step, TUNING, withAction } from '@rivetrun/sim';
import type { RunFeed } from '@/game/runFeed';
import { STATE_POST_MS } from './protocol';
import { reportFinal, reportState, type RaceSeat } from './report';

/** After a pause (backgrounded tab, slow frame) the sim resumes; it never fast-forwards more than this. */
const MAX_CATCH_UP_MS = 200;
const TICK_MS = 16;
const STOPPED_MPS = 0.05;

export interface HumanRunOptions {
  readonly code: string;
  readonly raceNo: number;
  readonly seat: RaceSeat;
  readonly mission: Mission;
  readonly seed: number;
  readonly build: Build;
  readonly feed: RunFeed;
  /** Read every sim step. `special: 'jump'` is consumed by the step that fires it. */
  readonly controls: { current: ControlInput };
}

/** Touch state → one of the actions this build can perform. */
export function controlToAction(input: ControlInput, can: ReadonlySet<Action>, speedMps: number): Action {
  if (input.special === 'jump' && can.has('jump')) return 'jump';
  if (input.brake) return speedMps <= STOPPED_MPS && can.has('reverse') ? 'reverse' : 'brake';
  if (input.special === 'winch' && can.has('deploy_winch')) return 'deploy_winch';
  if (input.throttle) return input.special === 'climb' && can.has('climb_mode') ? 'climb_mode' : 'accelerate';
  return 'cruise';
}

/** Starts the run now. Returns a stop function. */
export function startHumanRun(options: HumanRunOptions): () => void {
  const { code, raceNo, seat, mission, seed, build, feed, controls } = options;
  const can = new Set(availableActions(build));
  const dtMs = TUNING.dtMs;
  let state = createRun({ mission, seed, build, priority: 0.5 });
  let action: Action = 'cruise';
  let last = performance.now();
  let owedMs = 0;
  let stopped = false;
  feed.reset();
  feed.push({ type: 'frame', state: state.sim });

  const snapshot = () => ({
    x: state.sim.x,
    v: state.sim.v,
    damagePct: state.sim.damage,
    batteryPct: state.sim.battery,
    lastAction: action,
  });

  const finish = (): void => {
    const outcome = score(state);
    feed.push(
      state.finished
        ? { type: 'finish', t: state.sim.t, outcome }
        : { type: 'dnf', t: state.sim.t, reason: state.dnfReason ?? 'stuck', outcome },
    );
    const episode: Episode = {
      id: `race-${code}-${raceNo}-${seat.playerId.slice(0, 8)}`,
      missionId: mission.id,
      seed: state.config.seed,
      policy: 'human',
      build,
      environment: state.environment,
      priority: 0.5,
      decisions: [],
      outcome,
    };
    void reportFinal(code, seat, raceNo, {
      ...snapshot(),
      done: true,
      finished: state.finished,
      dnfReason: state.finished ? null : (state.dnfReason ?? 'stuck'),
      score: outcome.score,
      episode,
    });
  };

  const loop = setInterval(() => {
    const now = performance.now();
    owedMs = Math.min(owedMs + (now - last), MAX_CATCH_UP_MS);
    last = now;
    while (owedMs >= dtMs && !state.done) {
      owedMs -= dtMs;
      action = controlToAction(controls.current, can, state.sim.v);
      // A jump fires once; the button has to be pressed again for the next one.
      if (action === 'jump') controls.current = { ...controls.current, special: undefined };
      state = step(withAction(state, action), action);
      if (state.lastDamage) {
        feed.push({ type: 'damage', t: state.sim.t, cause: state.lastDamage.cause, amountPct: state.lastDamage.amountPct, totalPct: state.sim.damage });
      }
    }
    feed.push({ type: 'frame', state: state.sim });
    if (state.done) {
      stop();
      finish();
    }
  }, TICK_MS);
  // A dropped 5 Hz post is replaced by the next one, so failures are not retried.
  const poster = setInterval(() => void reportState(code, seat, raceNo, snapshot()).catch(() => undefined), STATE_POST_MS);

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(loop);
    clearInterval(poster);
  }
  return stop;
}
