// A human-driven run for Room Race. The phone drives through the sim's driveController with the game's
// drive input store: the same controller, input mapping and feel as solo Drive mode on /run.
import type { Action, Build, ControlInput, Mission } from '@rivetrun/contracts';
import { controlToAction, driveController } from '@rivetrun/sim';
import type { DriveInput } from '@/game/drive/driveInput';
import type { RunFeed } from '@/game/runFeed';
import { STATE_POST_MS } from './protocol';
import { reportFinal, reportState, type RaceSeat, type StateReport } from './report';

export interface HumanRunOptions {
  readonly code: string;
  readonly raceNo: number;
  readonly seat: RaceSeat;
  readonly mission: Mission;
  readonly seed: number;
  readonly build: Build;
  readonly feed: RunFeed;
  /** The player's hands (createDriveInput). driveController samples drive.read() every sim tick. */
  readonly drive: DriveInput;
}

/** What the player is doing right now, for the big screen's chip. Reads without consuming a queued jump. */
function currentAction(drive: DriveInput, build: Build): Action {
  const hands = drive.peek();
  const input: ControlInput = {
    throttle: hands.throttle,
    brake: hands.brake,
    ...(hands.winch ? { special: 'winch' as const } : hands.climb ? { special: 'climb' as const } : {}),
  };
  return controlToAction(input, build);
}

/** Starts the run now. Returns a stop function. */
export function startHumanRun({ code, raceNo, seat, mission, seed, build, feed, drive }: HumanRunOptions): () => void {
  let stopped = false;
  feed.reset();

  const snapshot = (): StateReport => {
    const view = feed.get();
    return {
      x: view.state?.x ?? 0,
      v: view.state?.v ?? 0,
      damagePct: view.outcome?.damagePct ?? view.state?.damage ?? 0,
      batteryPct: view.state?.battery ?? 100,
      lastAction: currentAction(drive, build),
    };
  };

  const controller = driveController({ mission, seed, build, priority: 0.5 }, drive.read, { onEvent: feed.push });
  // A dropped 5 Hz post is replaced by the next one, so failures are not retried.
  const poster = setInterval(() => void reportState(code, seat, raceNo, snapshot()).catch(() => undefined), STATE_POST_MS);

  controller
    .start()
    .then((episode) => {
      clearInterval(poster);
      drive.release();
      if (stopped) return;
      const view = feed.get();
      void reportFinal(code, seat, raceNo, {
        ...snapshot(),
        done: true,
        finished: episode.outcome.finished,
        dnfReason: episode.outcome.finished ? null : (view.dnfReason ?? episode.outcome.dnfReason ?? 'stuck'),
        score: episode.outcome.score,
        // The id is per room and race, so it is the same run on every screen and in the episode log.
        episode: { ...episode, id: `race-${code}-${raceNo}-${seat.playerId.slice(0, 8)}` },
      });
    })
    .catch(() => clearInterval(poster));

  return () => {
    stopped = true;
    clearInterval(poster);
    controller.stop();
    drive.release();
  };
}
