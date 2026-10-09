'use client';

import { useEffect, useState } from 'react';
import type { LeaderboardFeed } from './useLeaderboard';

/** LIVE / OFFLINE lamp with the age of the last successful refresh. */
export function LiveBadge({ feed, className = '' }: { readonly feed: LeaderboardFeed; readonly className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const live = feed.status === 'live';
  const age = feed.updatedAt === null ? null : Math.max(0, Math.round((now - feed.updatedAt) / 1000));
  const label = feed.status === 'loading' ? 'CONNECTING' : live ? 'LIVE' : 'OFFLINE';
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[0.7em] tracking-widest ${className}`}>
      <span className="relative flex h-[0.8em] w-[0.8em]">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-full w-full rounded-full ${live ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      </span>
      <span className={live ? 'text-emerald-300' : 'text-amber-300'}>{label}</span>
      {age !== null && <span className="text-slate-400">· {age} s ago</span>}
    </span>
  );
}
