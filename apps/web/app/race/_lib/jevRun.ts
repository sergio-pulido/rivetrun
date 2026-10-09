// A Jev-driven run for Room Race: the big screen runs each JEV bot with the client brain (Jev through
// /api/decide, heuristic fallback) and posts its state like a phone does.
import type { Build, Mission } from '@rivetrun/contracts';
import { runController } from '@rivetrun/sim';
import { createClientBrain } from '@/brain/clientBrain';
import { createRunFeed } from '@/game/runFeed';
import { STATE_POST_MS } from './protocol';
import { reportFinal, reportState, type RaceSeat, type StateReport } from './report';

export interface JevRunOptions {
  readonly code: string;
  readonly raceNo: number;
  readonly seat: RaceSeat;
  readonly mission: Mission;
  readonly seed: number;
  readonly build: Build;
  readonly briefing?: string;
}

/** Starts the bot now. Returns a stop function. */
export function startJevRun({ code, raceNo, seat, mission, seed, build, briefing }: JevRunOptions): () => void {
  const feed = createRunFeed();
  let stopped = false;

  const snapshot = (): StateReport => {
    const view = feed.get();
    const last = view.decision?.decision;
    return {
      x: view.state?.x ?? 0,
      v: view.state?.v ?? 0,
      damagePct: view.outcome?.damagePct ?? view.state?.damage ?? 0,
      batteryPct: view.state?.battery ?? 100,
      lastAction: last?.selected ?? null,
      lastActionP: last ? (last.probabilities[last.selected] ?? null) : null,
      thinking: view.pending !== null,
    };
  };

  const controller = runController({ mission, seed, build, priority: 0.5 }, createClientBrain({ briefing }), {
    onEvent: feed.push,
    policy: 'jev',
    briefing,
  });
  const poster = setInterval(() => void reportState(code, seat, raceNo, snapshot()).catch(() => undefined), STATE_POST_MS);

  controller
    .start()
    .then((episode) => {
      clearInterval(poster);
      if (stopped) return;
      const view = feed.get();
      void reportFinal(code, seat, raceNo, {
        ...snapshot(),
        thinking: false,
        done: true,
        finished: episode.outcome.finished,
        dnfReason: episode.outcome.finished ? null : (view.dnfReason ?? episode.outcome.dnfReason ?? 'stuck'),
        score: episode.outcome.score,
        // The id is per room and race, so two bots on the same seed never collide.
        episode: { ...episode, id: `race-${code}-${raceNo}-${seat.playerId.slice(0, 8)}` },
      });
    })
    .catch(() => clearInterval(poster));

  return () => {
    stopped = true;
    clearInterval(poster);
    controller.stop();
  };
}
