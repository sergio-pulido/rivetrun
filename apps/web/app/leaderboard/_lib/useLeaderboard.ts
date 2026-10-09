'use client';

import {
  LeaderboardResponseSchema,
  StatsResponseSchema,
  type LeaderboardEntry,
  type MissionId,
} from '@rivetrun/contracts';
import { useEffect, useState } from 'react';

export const REFRESH_MS = 5000;

export interface LeaderboardFeed {
  readonly entries: readonly LeaderboardEntry[];
  /** Episodes submitted since the server started; null until the first answer. */
  readonly episodes: number | null;
  readonly status: 'loading' | 'live' | 'offline';
  /** Epoch ms of the last successful refresh. */
  readonly updatedAt: number | null;
}

const INITIAL: LeaderboardFeed = { entries: [], episodes: null, status: 'loading', updatedAt: null };

async function load(missionId: MissionId, signal: AbortSignal): Promise<Pick<LeaderboardFeed, 'entries' | 'episodes'>> {
  const [board, stats] = await Promise.all([
    fetch(`/api/leaderboard?mission=${missionId}`, { cache: 'no-store', signal }),
    fetch('/api/stats', { cache: 'no-store', signal }),
  ]);
  if (!board.ok || !stats.ok) throw new Error(`leaderboard ${board.status}, stats ${stats.status}`);
  return {
    entries: LeaderboardResponseSchema.parse(await board.json()).entries,
    episodes: StatsResponseSchema.parse(await stats.json()).episodes,
  };
}

/** Polls the leaderboard and the episode count every REFRESH_MS. Keeps the last good data when a poll fails. */
export function useLeaderboard(missionId: MissionId): LeaderboardFeed {
  const [feed, setFeed] = useState<LeaderboardFeed>(INITIAL);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async (): Promise<void> => {
      try {
        const data = await load(missionId, controller.signal);
        setFeed({ ...data, status: 'live', updatedAt: Date.now() });
      } catch {
        if (!controller.signal.aborted) setFeed((previous) => ({ ...previous, status: 'offline' }));
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [missionId]);

  return feed;
}
