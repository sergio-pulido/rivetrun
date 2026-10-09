'use client';

import { StatsResponseSchema } from '@rivetrun/contracts';
import { useEffect, useState } from 'react';

/** "N episodes logged", read from /api/stats. Shows a dash until the number arrives. */
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
    <p className="flex items-center justify-center gap-2 font-mono text-xs text-dim">
      <span className="rr-blink inline-block h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_var(--color-ok)]" />
      <span>
        <span className="tabular-nums text-slate-200">{episodes === null ? '—' : episodes.toLocaleString('en-US')}</span>{' '}
        {episodes === 1 ? 'episode' : 'episodes'} logged
      </span>
    </p>
  );
}
