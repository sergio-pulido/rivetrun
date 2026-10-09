'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Build, GhostTrace, Mission } from '@rivetrun/contracts';
import { heuristicBrain, randomBrain, runController, runHeadless } from '@rivetrun/sim';
import { createClientBrain } from '@/brain/clientBrain';
import { createRunFeed, type RunFeed } from '@/game/runFeed';
import { useRunStore } from '@/state/run';

/** Time the finish / crash stays on screen before the Result page. */
const RESULT_DELAY_MS = 2200;

export interface RunSession {
  readonly feed: RunFeed;
  readonly ghosts: readonly GhostTrace[];
  readonly seed: number | null;
  readonly error: string | null;
}

const newSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/**
 * Drives one run: ghosts from runHeadless (heuristic + random), the player's run from
 * runController with the client brain (Jev, heuristic fallback), then Result.
 */
export function useRun(mission: Mission, build: Build, priority: number, briefing?: string): RunSession {
  const router = useRouter();
  const feed = useMemo(() => createRunFeed(), []);
  const [ghosts, setGhosts] = useState<readonly GhostTrace[]>([]);
  const [seed, setSeed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const runSeed = mission.fixedSeed ?? newSeed();
    feed.reset();
    useRunStore.getState().clearResult();

    const play = async (): Promise<void> => {
      const traces = await Promise.all([
        runHeadless(mission, runSeed, build, heuristicBrain, { priority, policy: 'heuristic' }),
        runHeadless(mission, runSeed, build, randomBrain(runSeed), { priority, policy: 'random' }),
      ]);
      if (cancelled) return;
      const ghostTraces = traces.map((trace) => trace.ghost);
      setSeed(runSeed);
      setGhosts(ghostTraces);

      const controller = runController({ mission, seed: runSeed, build, priority }, createClientBrain(), {
        onEvent: feed.push,
        policy: 'jev',
        briefing,
      });
      stop = controller.stop;
      const episode = await controller.start();
      if (cancelled) return;
      useRunStore.getState().setResult({
        missionId: mission.id,
        episode,
        ghosts: ghostTraces.map((ghost) => ({ policy: ghost.policy, outcome: ghost.outcome })),
      });
      timer = setTimeout(() => router.push('/result'), RESULT_DELAY_MS);
    };

    play().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });

    return () => {
      cancelled = true;
      stop?.();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [mission, build, priority, briefing, feed, router]);

  return { feed, ghosts, seed, error };
}
