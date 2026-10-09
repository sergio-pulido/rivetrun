'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Build, Episode, GhostTrace, Mission } from '@rivetrun/contracts';
import { driveController, driveSeed, heuristicBrain, randomBrain, runController, runHeadless } from '@rivetrun/sim';
import { createClientBrain } from '@/brain/clientBrain';
import { createDriveInput, createRunFeed, type DriveInput, type RunFeed } from '@/game';
import { useRunStore, type GhostResult } from '@/state/run';
import { loadRivalGhost } from './ghost';

/** Time the finish / crash stays on screen before the Result page. */
const RESULT_DELAY_MS = 3200;

export type PlayMode = 'drive' | 'jev';

export interface RunOptions {
  readonly mission: Mission;
  readonly build: Build;
  readonly priority: number;
  readonly briefing?: string;
  readonly mode: PlayMode;
}

export interface RunSession {
  readonly feed: RunFeed;
  readonly ghosts: readonly GhostTrace[];
  /** The player's controls in Drive mode; undefined when Jev drives. */
  readonly drive: DriveInput | undefined;
  readonly error: string | null;
}

interface Prepared {
  readonly seed: number;
  readonly ghosts: readonly GhostTrace[];
  readonly results: readonly GhostResult[];
}

const newSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/** Jev mode: the heuristic and random ghosts, computed on the phone. */
async function prepareJevMode({ mission, build, priority }: RunOptions): Promise<Prepared> {
  const seed = mission.fixedSeed ?? newSeed();
  const traces = await Promise.all([
    runHeadless(mission, seed, build, heuristicBrain, { priority, policy: 'heuristic' }),
    runHeadless(mission, seed, build, randomBrain(seed), { priority, policy: 'random' }),
  ]);
  const ghosts = traces.map((trace) => trace.ghost);
  return { seed, ghosts, results: ghosts.map((ghost) => ({ policy: ghost.policy, outcome: ghost.outcome })) };
}

/** Drive mode: one fixed seed per mission and one rival, the precomputed Jev ghost (or the heuristic's). */
async function prepareDriveMode({ mission, build, priority, briefing }: RunOptions): Promise<Prepared> {
  const seed = driveSeed(mission);
  const rival = await loadRivalGhost({ mission, seed, build, priority, briefing });
  return {
    seed,
    ghosts: [rival.ghost],
    results: [{ policy: rival.ghost.policy, outcome: rival.ghost.outcome, decisions: rival.decisions, fallbacks: rival.fallbacks }],
  };
}

/**
 * Drives one run and hands the Result page its data.
 * Jev mode: runController with the client brain (Jev, heuristic fallback) against two ghosts.
 * Drive mode: the player's input through driveController against one ghost. One live controller either way.
 */
export function useRun(options: RunOptions): RunSession {
  const { mission, build, priority, briefing, mode } = options;
  const router = useRouter();
  const feed = useMemo(() => createRunFeed(), []);
  const drive = useMemo(() => (mode === 'drive' ? createDriveInput() : undefined), [mode]);
  const [ghosts, setGhosts] = useState<readonly GhostTrace[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    feed.reset();
    setGhosts([]);
    useRunStore.getState().clearResult();
    const run: RunOptions = { mission, build, priority, briefing, mode };

    const play = async (): Promise<void> => {
      const prepared = await (drive ? prepareDriveMode(run) : prepareJevMode(run));
      if (cancelled) return;
      setGhosts(prepared.ghosts);

      const config = { mission, seed: prepared.seed, build, priority };
      const controller = drive
        ? driveController(config, drive.read, { onEvent: feed.push })
        : runController(config, createClientBrain(), { onEvent: feed.push, policy: 'jev', briefing });
      stop = controller.stop;
      const episode: Episode = await controller.start();
      drive?.release();
      if (cancelled) return;
      useRunStore.getState().setResult({ missionId: mission.id, episode, ghosts: prepared.results });
      timer = setTimeout(() => router.push('/result'), RESULT_DELAY_MS);
    };

    play().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });

    return () => {
      cancelled = true;
      stop?.();
      drive?.release();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [mission, build, priority, briefing, mode, drive, feed, router]);

  return { feed, ghosts, drive, error };
}
