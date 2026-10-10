// A Jev-driven run for Room Race: the big screen runs each JEV bot with the client brain (Jev through
// /api/decide, heuristic fallback) in real time, and posts its state like a phone does.
import type { Brain, Build, DecisionLog, Mission } from '@rivetrun/contracts';
import { runController } from '@rivetrun/sim';
import { createClientBrain } from '@/brain/clientBrain';
import { entryFromDecision, entryFromLog, type ThreadEntry } from '@/brain/thread';
import { createRunFeed, type RunFeed } from '@/game/runFeed';
import { STATE_POST_MS } from './protocol';
import { reportFinal, reportState, type RaceSeat, type StateReport } from './report';

const LATE_CAUSES: ReadonlySet<string> = new Set(['impact', 'blocked', 'fell']);

export interface JevRunOptions {
  readonly code: string;
  readonly raceNo: number;
  readonly seat: RaceSeat;
  readonly mission: Mission;
  readonly seed: number;
  readonly build: Build;
  readonly briefing?: string;
  /** 0 = pure speed … 1 = pure safety. A plan sets it; without one the room's 0.5. */
  readonly priority?: number;
  /** Called for every decision the bot makes, for the big screen's live thread. */
  readonly onDecision?: (entry: ThreadEntry) => void;
  /** The bot's name in the thread, e.g. "JEV-1". */
  readonly who?: string;
  /** Live Arena: the brain that drives this bot instead of Jev through /api/decide. */
  readonly brain?: Brain;
  /** A feed to draw the run from (a phone watching its own picked agent); absent = a private one. */
  readonly feed?: RunFeed;
}

/** Starts the bot now. Returns a stop function. */
export function startJevRun({ code, raceNo, seat, mission, seed, build, briefing, priority = 0.5, onDecision, who = 'JEV', brain, feed: given }: JevRunOptions): () => void {
  const feed = given ?? createRunFeed();
  feed.reset();
  let stopped = false;
  // What the results screen says about this brain: how fast it answered and what its waiting cost.
  const answered: number[] = [];
  let late = 0;
  let missed = 0;
  let previous: DecisionLog | undefined;
  const median = (): number | null => {
    if (answered.length === 0) return null;
    const sorted = [...answered].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  };

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
      medianLatencyMs: median(),
      lateDecisions: late,
      missedDecisions: missed,
      thinking: view.pending !== null,
    };
  };

  const controller = runController({ mission, seed, build, priority }, brain ?? createClientBrain({ briefing, isAirborne: () => feed.get().state?.airborne === true }), {
    onEvent: (event) => {
      feed.push(event);
      // Hints (advisory) are not decisions the bot acted on.
      if (event.type === 'decision' && !event.advisory) {
        if (event.decision.fallback) missed += 1;
        else if (event.decision.latencyMs > 0) answered.push(event.decision.latencyMs);
        // Late: the robot hit something, got blocked or fell while its previous answer had not arrived yet
        // (the same rule as the arena table, packages/brain/scripts/arena.ts).
        const log = event.log;
        if (log && previous && LATE_CAUSES.has(log.trigger.cause) && previous.appliedT > previous.t && log.t <= previous.appliedT + 0.05) late += 1;
        if (log) previous = log;
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
