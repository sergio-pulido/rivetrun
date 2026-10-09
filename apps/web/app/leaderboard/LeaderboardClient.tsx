'use client';

import type { LeaderboardEntry } from '@rivetrun/contracts';
import Link from 'next/link';
import { POLICY_LABEL, formatDamage, formatScore, formatTime } from './_lib/format';
import { LiveBadge } from './_lib/LiveBadge';
import { useLeaderboard } from './_lib/useLeaderboard';

const RANK_PLATE = [
  'bg-safety text-slate-ink',
  'bg-slate-200 text-slate-ink',
  'bg-amber-700 text-amber-50',
] as const;

function Row({ entry }: { readonly entry: LeaderboardEntry }) {
  const plate = RANK_PLATE[entry.rank - 1] ?? 'bg-slate-ink text-slate-300 border border-slate-line';
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-line bg-slate-panel/95 px-3 py-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-mono text-lg font-black ${plate}`}>
        {entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold leading-tight">{entry.nickname}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-slate-400">
          <span className="rounded border border-blueprint/50 px-1 text-blueprint">{POLICY_LABEL[entry.policy]}</span>
          <span>{formatTime(entry.timeS)}</span>
          <span>dmg {formatDamage(entry.damagePct)}</span>
        </p>
      </div>
      <span className="font-mono text-2xl font-black tabular-nums text-safety">{formatScore(entry.score)}</span>
    </li>
  );
}

function EmptyState({ loading }: { readonly loading: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-line bg-slate-panel/70 p-6 text-center">
      <p className="font-mono text-xs tracking-widest text-blueprint">{loading ? 'READING THE BOARD' : 'BOARD IS EMPTY'}</p>
      <p className="mt-2 text-lg font-bold">{loading ? 'One moment…' : 'No runs submitted yet.'}</p>
      {!loading && <p className="mt-1 text-sm text-slate-400">Finish the Room Challenge and submit a nickname to take the first plate.</p>}
    </div>
  );
}

export function LeaderboardClient() {
  const feed = useLeaderboard('M5');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-4">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-line bg-slate-panel text-xl font-bold active:translate-y-px"
        >
          ←
        </Link>
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-widest text-blueprint">M5 · RAIN · EVERY TERRAIN</p>
          <h1 className="font-mono text-2xl font-black leading-tight tracking-tight text-safety">Room Challenge</h1>
        </div>
      </header>

      <div className="hazard mt-4 h-1.5 rounded-full" />

      <div className="mt-3 flex items-center justify-between text-sm">
        <LiveBadge feed={feed} className="text-base" />
        <span className="font-mono text-xs text-slate-400">
          {feed.episodes === null ? '—' : feed.episodes} episodes logged
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-300">Same track and same seed for everyone. Best score per nickname, top 20.</p>

      <section className="mt-4 flex-1" aria-live="polite">
        {feed.entries.length === 0 ? (
          <EmptyState loading={feed.status === 'loading'} />
        ) : (
          <ol className="flex flex-col gap-2">
            {feed.entries.map((entry) => (
              <Row key={`${entry.rank}-${entry.nickname}`} entry={entry} />
            ))}
          </ol>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-line bg-slate-ink/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Link
          href="/run/M5"
          className="mx-auto flex min-h-14 max-w-md items-center justify-center rounded-lg bg-safety text-lg font-black text-slate-ink shadow-[0_4px_0_#b3460a] active:translate-y-0.5 active:shadow-[0_2px_0_#b3460a]"
        >
          Run the Room Challenge
        </Link>
      </div>
    </main>
  );
}
