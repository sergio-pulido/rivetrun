'use client';

import type { LeaderboardEntry } from '@rivetrun/contracts';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { POLICY_LABEL, formatDamage, formatScore, formatTime } from '../leaderboard/_lib/format';
import { LiveBadge } from '../leaderboard/_lib/LiveBadge';
import { useLeaderboard } from '../leaderboard/_lib/useLeaderboard';
import { RaceSnapshotSchema } from '../race/_lib/protocol';

const ROWS_PER_COLUMN = 10;

const RANK_PLATE = [
  'bg-safety text-slate-ink',
  'bg-slate-200 text-slate-ink',
  'bg-amber-700 text-amber-50',
] as const;

function Row({ entry, compact }: { readonly entry: LeaderboardEntry; readonly compact: boolean }) {
  const plate = RANK_PLATE[entry.rank - 1] ?? 'border border-slate-line bg-slate-ink text-slate-300';
  return (
    <li className="flex min-h-0 flex-1 items-center gap-[1.2vw] rounded-[0.6vw] border border-slate-line bg-slate-panel/95 px-[1.2vw] lg:max-h-[9vh]">
      <span className={`flex aspect-square h-[70%] min-h-9 shrink-0 items-center justify-center rounded-[0.4vw] font-mono text-[clamp(1.1rem,2vw,2.6rem)] font-black ${plate}`}>
        {entry.rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-[clamp(1.1rem,2vw,2.6rem)] font-bold">{entry.nickname}</span>
      <span className="hidden shrink-0 font-mono text-[clamp(0.7rem,1vw,1.3rem)] text-slate-400 sm:block">
        <span className="rounded border border-blueprint/50 px-[0.4vw] text-blueprint">{POLICY_LABEL[entry.policy]}</span>
        {!compact && <span className="ml-[0.8vw]">{formatTime(entry.timeS)}</span>}
        {!compact && <span className="ml-[0.8vw]">dmg {formatDamage(entry.damagePct)}</span>}
      </span>
      <span className="shrink-0 font-mono text-[clamp(1.3rem,2.6vw,3.4rem)] font-black tabular-nums text-safety">
        {formatScore(entry.score)}
      </span>
    </li>
  );
}

function Board({ entries, loading }: { readonly entries: readonly LeaderboardEntry[]; readonly loading: boolean }) {
  if (entries.length === 0) {
    return (
      <div className="riveted flex flex-1 flex-col items-center justify-center rounded-[1vw] border border-dashed border-slate-line bg-slate-panel/70 p-8 text-center">
        <p className="font-mono text-[clamp(0.8rem,1.2vw,1.5rem)] tracking-[0.3em] text-blueprint">
          {loading ? 'READING THE BOARD' : 'BOARD IS EMPTY'}
        </p>
        <p className="mt-[1.5vh] text-[clamp(1.6rem,3.6vw,4.5rem)] font-black leading-tight">
          {loading ? 'One moment…' : 'First plate is up for grabs.'}
        </p>
        {!loading && (
          <p className="mt-[1vh] text-[clamp(1rem,1.6vw,2rem)] text-slate-300">Scan the code, build a robot, let the AI drive it.</p>
        )}
      </div>
    );
  }
  const columns = [entries.slice(0, ROWS_PER_COLUMN), entries.slice(ROWS_PER_COLUMN)].filter((column) => column.length > 0);
  return (
    <div className={`grid min-h-0 flex-1 gap-[1.2vw] ${columns.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {columns.map((column) => (
        <ol key={column[0]!.rank} className="flex min-h-0 flex-col gap-[0.8vh]">
          {column.map((entry) => (
            <Row key={`${entry.rank}-${entry.nickname}`} entry={entry} compact={columns.length > 1} />
          ))}
        </ol>
      ))}
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex-1 rounded-[0.6vw] border border-slate-line bg-slate-ink/70 px-3 py-2">
      <p className="font-mono text-[clamp(0.6rem,0.8vw,1rem)] tracking-widest text-slate-400">{label}</p>
      <p className="font-mono text-[clamp(1.2rem,2vw,2.6rem)] font-black tabular-nums">{value}</p>
    </div>
  );
}

interface ScreenClientProps {
  readonly siteUrl: string;
  /** Server-rendered QR for siteUrl. */
  readonly qr: ReactNode;
}

/** Opens a Room Race room and switches this screen to it. */
function RoomRaceButton() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');
  const open = async (): Promise<void> => {
    setState('opening');
    try {
      const response = await fetch('/api/race', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error(`create room responded ${response.status}`);
      const room = RaceSnapshotSchema.parse(await response.json());
      router.push(`/screen?room=${room.code}`);
    } catch {
      setState('failed');
    }
  };
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={state === 'opening'}
      className="rr-btn rr-btn-primary px-[1.6vw] text-[clamp(1rem,1.5vw,2rem)]"
    >
      {state === 'opening' ? 'Opening…' : state === 'failed' ? 'Could not open a room. Retry' : 'Start a Room Race'}
    </button>
  );
}

export function ScreenClient({ siteUrl, qr }: ScreenClientProps) {
  const feed = useLeaderboard('M5');
  const top = feed.entries[0];
  return (
    <main className="flex min-h-dvh flex-col gap-[2vh] p-[2.2vw] lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[clamp(0.7rem,1.1vw,1.4rem)] tracking-[0.3em] text-blueprint">
            RIVETRUN · M5 · RAIN · EVERY TERRAIN · SAME SEED FOR EVERYONE
          </p>
          <h1 className="font-mono text-[clamp(2.2rem,5.2vw,6.5rem)] font-black leading-none tracking-tight text-safety">
            Room Challenge
          </h1>
        </div>
        <div className="flex items-center gap-[1.4vw]">
          <LiveBadge feed={feed} className="text-[clamp(1rem,1.5vw,2rem)]" />
          <RoomRaceButton />
        </div>
      </header>

      <div className="hazard h-[0.8vh] min-h-1.5 shrink-0 rounded-full" />

      <div className="flex min-h-0 flex-1 flex-col gap-[2vw] lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col" aria-live="polite">
          <Board entries={feed.entries} loading={feed.status === 'loading'} />
        </section>

        <aside className="riveted flex shrink-0 flex-col items-center gap-[1.6vh] rounded-[1vw] border border-slate-line bg-slate-panel p-[1.6vw] lg:w-[26vw]">
          <p className="font-mono text-[clamp(1.2rem,2vw,2.6rem)] font-black tracking-tight">Scan to play</p>
          <div className="w-full max-w-xs overflow-hidden rounded-[0.8vw] border-4 border-safety lg:max-w-none">{qr}</div>
          <p className="break-all text-center font-mono text-[clamp(0.8rem,1.2vw,1.6rem)] text-slate-200">{siteUrl.replace(/^https?:\/\//, '')}</p>
          <p className="text-center text-[clamp(0.9rem,1.2vw,1.5rem)] text-slate-300">You build the body. AI drives it.</p>
          <div className="mt-auto flex w-full gap-[0.8vw]">
            <Stat label="EPISODES LOGGED" value={feed.episodes === null ? '—' : String(feed.episodes)} />
            <Stat label="SCORE TO BEAT" value={top ? formatScore(top.score) : '—'} />
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 font-mono text-[clamp(0.8rem,1.3vw,1.7rem)]">
        <span className="font-bold">Today a game. Tomorrow a benchmark.</span>
        <span className="text-slate-400">Best score per nickname · top 20 · refreshes every 5 s</span>
      </footer>
    </main>
  );
}
