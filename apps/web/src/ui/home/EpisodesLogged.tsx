'use client';

import { StatsResponseSchema } from '@rivetrun/contracts';
import { useEffect, useState } from 'react';

/** "N EPISODES LOGGED", read from /api/stats. Shows a dash until the number arrives. */
export function EpisodesLogged() {
  const [episodes, setEpisodes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: unknown) => {
        const parsed = StatsResponseSchema.safeParse(body);
        if (!cancelled && parsed.success) setEpisodes(parsed.data.episodes);
      })
      .catch(() => {
        // The line stays at "—": the count is decoration, not a blocker.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <span>
      <span className="tabular-nums text-text">{episodes === null ? '—' : episodes.toLocaleString('en-US')}</span> {episodes === 1 ? 'EPISODE' : 'EPISODES'} LOGGED
    </span>
  );
}
