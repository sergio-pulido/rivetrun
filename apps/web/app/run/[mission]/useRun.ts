'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Build, Episode, GhostTrace, Mission, RunEvent, SimState } from '@rivetrun/contracts';
import { createRun, driveController, driveSeed, heuristicBrain, randomBrain, runController, runHeadless } from '@rivetrun/sim';
import { createClientBrain } from '@/brain/clientBrain';
import { createDriveInput, createRunFeed, type DriveInput, type RunFeed } from '@/game';
import { useRunStore, type GhostResult } from '@/state/run';
import { loadRivalGhost } from './ghost';

/** Time the finish / crash stays on screen before the Result page. */
const RESULT_DELAY_MS = 3200;
/** The player's own trace is sampled like every other ghost: 10 Hz of sim time. */
const TRACE_STEP_MS = 100;

export type PlayMode = 'drive' | 'jev';

export interface RunOptions {
  readonly mission: Mission;
  readonly build: Build;
  readonly priority: number;
  readonly briefing?: string;
  readonly mode: PlayMode;
  /** Drive mode: race this trace (the player's stored best on this mission's drive seed) instead of the Jev rival. */
  readonly rivalTrace?: GhostTrace | null;
}

export interface RunSession {
  readonly feed: RunFeed;
  readonly ghosts: readonly GhostTrace[];
  /** The player's controls in Drive mode; undefined when Jev drives. */
  readonly drive: DriveInput | undefined;
  /** Pass to RunCanvas: it calls this at the first drawn frame, and the clock starts then. */
  readonly onSceneReady: () => void;
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
  return { seed, ghosts, results: ghosts.map((ghost) => ({ policy: ghost.policy, outcome: ghost.outcome, log: ghost.log })) };
}

/** Drive mode: one fixed seed per mission and one rival, the precomputed Jev ghost (or the heuristic's). */
async function prepareDriveMode({ mission, build, priority, briefing, rivalTrace }: RunOptions): Promise<Prepared> {
  const seed = driveSeed(mission);
  if (rivalTrace) return { seed, ghosts: [rivalTrace], results: [{ policy: rivalTrace.policy, outcome: rivalTrace.outcome }] };
  const rival = await loadRivalGhost({ mission, seed, build, priority, briefing });
  return {
    seed,
    ghosts: [rival.ghost],
    results: [{ policy: rival.ghost.policy, outcome: rival.ghost.outcome, decisions: rival.decisions, fallbacks: rival.fallbacks, medianLatencyMs: rival.medianLatencyMs, log: rival.ghost.log }],
  };
}

/**
 * Drives one run and hands the Result page its data.
 * Jev mode: runController with the client brain (Jev, heuristic fallback) against two ghosts.
 * Drive mode: the player's input through driveController against one ghost. One live controller either way.
 */
export function useRun(options: RunOptions): RunSession {
  const { mission, build, priority, briefing, mode, rivalTrace } = options;
  const router = useRouter();
  const feed = useMemo(() => createRunFeed(), []);
  const drive = useMemo(() => (mode === 'drive' ? createDriveInput() : undefined), [mode]);
  // Resolved by the canvas at its first drawn frame (it gives up and calls anyway after 15 s).
  const scene = useMemo(() => {
    let ready: () => void = () => undefined;
    const drawn = new Promise<void>((resolve) => {
      ready = resolve;
    });
    return { drawn, ready };
  }, []);
  const [ghosts, setGhosts] = useState<readonly GhostTrace[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    feed.reset();
    setGhosts([]);
    useRunStore.getState().clearResult();
    const run: RunOptions = { mission, build, priority, briefing, mode, rivalTrace };

    const play = async (): Promise<void> => {
      const prepared = await (drive ? prepareDriveMode(run) : prepareJevMode(run));
      if (cancelled) return;
      setGhosts(prepared.ghosts);

      const config = { mission, seed: prepared.seed, build, priority };
      // Keep the run as a ghost trace: one frame per 100 ms of sim time, plus the last one.
      const frames: SimState[] = [];
      let last: SimState | undefined;
      const record = (event: RunEvent): void => {
        if (event.type === 'frame') {
          last = event.state;
          if (Math.round(event.state.t * 1000) % TRACE_STEP_MS === 0) frames.push(event.state);
        }
        feed.push(event);
      };
      const controller = drive
        ? driveController(config, drive.read, { onEvent: record })
        : runController(config, createClientBrain(), { onEvent: record, policy: 'jev', briefing });
      stop = controller.stop;
      // The clock starts when the player can see the track, not when the code is ready.
      // Until then the robot waits on the start line.
      feed.push({ type: 'frame', state: createRun(config).sim });
      await scene.drawn;
      if (cancelled) return;
      const episode: Episode = await controller.start();
      drive?.release();
      if (cancelled) return;
      if (last && frames[frames.length - 1] !== last) frames.push(last);
      const trace: GhostTrace = { policy: episode.policy, frames, outcome: episode.outcome };
      useRunStore.getState().setResult({ missionId: mission.id, episode, ghosts: prepared.results, trace });
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
  }, [mission, build, priority, briefing, mode, rivalTrace, drive, feed, router, scene]);

  return { feed, ghosts, drive, error, onSceneReady: scene.ready };
}
