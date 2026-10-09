'use client';

import { useEffect, useMemo } from 'react';
import type { Build } from '@rivetrun/contracts';
import { MISSIONS, runController } from '@rivetrun/sim';
import { createClientBrain } from '@/brain/clientBrain';
import { createRunFeed, type RunFeed } from '@/game/runFeed';
import { STATE_POST_MS, type RaceSnapshot } from '../_lib/protocol';
import { postRaceAction } from '../_lib/useRaceRoom';

export interface RaceIdentity {
  readonly playerId: string;
  readonly token: string;
  readonly build: Build;
  readonly briefing?: string;
}

/**
 * Runs this phone's own sim for the current race: waits for the start signal, drives the robot with
 * runController + the client brain (Jev, heuristic fallback), and posts its state at 5 Hz.
 */
export function useRaceRun(
  snapshot: RaceSnapshot | null,
  identity: RaceIdentity | null,
  priority: number,
  clockOffsetMs: number,
): RunFeed {
  const feed = useMemo(() => createRunFeed(), []);
  const code = snapshot?.code;
  const raceNo = snapshot?.raceNo ?? 0;
  const startAt = snapshot?.startAt ?? null;
  const missionId = snapshot?.missionId;
  const seed = snapshot?.seed;
  const live = snapshot?.status === 'countdown' || snapshot?.status === 'racing';

  useEffect(() => {
    if (!live || !identity || !code || !missionId || seed === undefined || startAt === null) return undefined;
    let cancelled = false;
    let stop: (() => void) | undefined;
    let poster: ReturnType<typeof setInterval> | undefined;
    feed.reset();

    const report = (done: boolean): Promise<unknown> => {
      const view = feed.get();
      const state = view.state;
      const last = view.decision?.decision;
      return postRaceAction(code, {
        action: 'state',
        playerId: identity.playerId,
        token: identity.token,
        raceNo,
        x: state?.x ?? 0,
        v: state?.v ?? 0,
        damagePct: view.outcome?.damagePct ?? state?.damage ?? 0,
        batteryPct: state?.battery ?? 100,
        lastAction: last?.selected ?? null,
        lastActionP: last ? (last.probabilities[last.selected] ?? null) : null,
        thinking: view.pending !== null,
        done,
        finished: done && (view.outcome?.finished ?? false),
        dnfReason: done ? (view.dnfReason ?? null) : null,
        score: done ? (view.outcome?.score ?? null) : null,
      });
    };

    const go = async (): Promise<void> => {
      const controller = runController(
        { mission: MISSIONS[missionId], seed, build: identity.build, priority },
        createClientBrain({ briefing: identity.briefing }),
        { onEvent: feed.push, policy: 'jev' },
      );
      stop = controller.stop;
      // A dropped 5 Hz post is replaced by the next one, so failures are not retried.
      poster = setInterval(() => void report(false).catch(() => undefined), STATE_POST_MS);
      await controller.start();
      clearInterval(poster);
      if (cancelled) return;
      // The final post decides the finish order: retry it once.
      await report(true).catch(() => report(true).catch(() => undefined));
    };

    const waitMs = Math.max(0, startAt - (Date.now() + clockOffsetMs));
    const timer = setTimeout(() => void go(), waitMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (poster !== undefined) clearInterval(poster);
      stop?.();
    };
    // clockOffsetMs is read once per race on purpose: re-syncing mid-race would restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, raceNo, startAt, code, missionId, seed, identity, priority, feed]);

  return feed;
}
