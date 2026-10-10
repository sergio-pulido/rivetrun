'use client';

import { StatsResponseSchema } from '@rivetrun/contracts';
import { useEffect, useState } from 'react';
import { readAudience, versusLine, type Audience } from './proof';

const REFRESH_MS = 5000;

const read = async (url: string): Promise<unknown> => {
  const response = await fetch(url, { cache: 'no-store' });
  return response.ok ? ((await response.json()) as unknown) : null;
};

/**
 * Live proof on Home (desktop and projector): episodes logged and how the room is doing against Jev, from the same two
 * routes the footer and the big screen read. A figure that has not arrived is a dash, never a number made up.
 */
export function LiveProof() {
  const [episodes, setEpisodes] = useState<number | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      void read('/api/stats')
        .then((body) => {
          const parsed = StatsResponseSchema.safeParse(body);
          if (!cancelled && parsed.success) setEpisodes(parsed.data.episodes);
        })
        .catch(() => undefined);
      void read('/api/arena/humans')
        .then((body) => {
          const next = readAudience(body);
          if (!cancelled && next) setAudience(next);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="rr-card hidden min-w-0 flex-col justify-center gap-2.5 p-4 lg:flex" aria-label="Live" data-testid="home-proof">
      <h2 className="rr-label">Live · this server</h2>
      <p className="flex items-baseline gap-2.5">
        <span className="font-mono text-[clamp(34px,5.4vh,56px)] font-semibold leading-none tabular-nums" data-testid="home-episodes">
          {episodes === null ? '—' : episodes.toLocaleString('en-US')}
        </span>
        <span className="font-mono text-xs font-medium uppercase tracking-[1.5px] text-muted">{episodes === 1 ? 'episode' : 'episodes'} logged</span>
      </p>
      <p className="font-display text-xl font-bold leading-tight text-cyan-soft" data-testid="home-versus">
        {audience ? versusLine(audience) : '—'}
      </p>
      <p className="text-xs leading-snug text-muted">
        {audience ? `${audience.verified.toLocaleString('en-US')} ${audience.verified === 1 ? 'run' : 'runs'} replayed and checked by the server today. ` : ''}
        Jev is the AI driving the same robot on the same track.
      </p>
    </section>
  );
}
