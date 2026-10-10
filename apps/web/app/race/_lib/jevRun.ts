// A Jev-driven run for Room Race: the big screen runs each JEV bot with the client brain (Jev through
// /api/decide, heuristic fallback) in real time, and posts its state like a phone does.
import type { Brain, Build, Mission } from '@rivetrun/contracts';
import { runController } from '@rivetrun/sim';
import { createClientBrain } from '@/brain/clientBrain';
import { entryFromDecision, entryFromLog, type ThreadEntry } from '@/brain/thread';
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
  /** Called for every decision the bot makes, for the big screen's live thread. */
  readonly onDecision?: (entry: ThreadEntry) => void;
  /** The bot's name in the thread, e.g. "JEV-1". */
  readonly who?: string;
  /** Live Arena: the brain that drives this bot instead of Jev through /api/decide. */
  readonly brain?: Brain;
}

/** Starts the bot now. Returns a stop function. */
export function startJevRun({ code, raceNo, seat, mission, seed, build, briefing, onDecision, who = 'JEV', brain }: JevRunOptions): () => void {
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
      latencyMs: last ? last.latencyMs : null,
      thinking: view.pending !== null,
    };
  };

  const controller = runController({ mission, seed, build, priority: 0.5 }, brain ?? createClientBrain({ briefing, isAirborne: () => feed.get().state?.airborne === true }), {
    onEvent: (event) => {
      feed.push(event);
      // Hints (advisory) are not decisions the bot acted on.
      if (event.type === 'decision' && !event.advisory) {
        onDecision?.(event.log ? entryFromLog(who, event.log) : entryFromDecision(who, event.t, event.question, event.decision));
      }
    },
    policy: 'jev',
    briefing,
    // Race rule: no slow motion while Jev thinks. The bot's sim keeps running in real time and each decision
    // applies when it arrives, so Jev's latency is the bot's reaction time, like a human's.
    slowMo: false,
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
