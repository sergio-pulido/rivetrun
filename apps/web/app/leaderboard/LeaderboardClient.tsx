'use client';

import type { LeaderboardEntry } from '@rivetrun/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { MISSION_IDS, MISSIONS } from '@rivetrun/sim';
import { useProgressStore } from '@/state/progress';
import { Icon } from '@/ui/Icon';
import { Stars } from '@/ui/Stars';
import { POLICY_LABEL, formatDamage, formatScore, formatTime } from './_lib/format';
import { useLeaderboard, type LeaderboardFeed } from './_lib/useLeaderboard';

const COLUMNS = 'grid grid-cols-[34px_1fr_74px_56px] items-center gap-1.5 px-2.5';
const PODIUM = 3;
const ROOM = MISSIONS.M5;

type Tab = 'room' | 'mine';

function Live({ status }: { readonly status: LeaderboardFeed['status'] }) {
  const live = status === 'live';
  return (
    <span className={`flex w-11 shrink-0 items-center justify-end gap-1.5 font-mono text-[10px] font-medium ${live ? 'text-cyan' : 'text-muted'}`}>
      <span className={`h-2 w-2 rounded-full ${live ? 'rr-blink bg-cyan' : 'bg-muted'}`} />
      {status === 'loading' ? '···' : live ? 'LIVE' : 'OFF'}
    </span>
  );
}

function Row({ entry, mine = false }: { readonly entry: LeaderboardEntry; readonly mine?: boolean }) {
  return (
    <li className={`${COLUMNS} h-11 rounded-[10px] border ${mine ? 'h-[46px] border-cyan bg-cyan/10' : 'border-[#1E232A] bg-panel-3'}`}>
      <span className={`font-mono text-sm font-semibold tabular-nums ${mine ? 'text-cyan' : entry.rank <= PODIUM ? 'text-orange' : 'text-muted'}`}>{entry.rank}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold leading-tight">{entry.nickname}</span>
        <span className={`truncate font-mono text-[10px] ${mine ? 'text-cyan-muted' : 'text-[#8A929C]'}`}>
          {POLICY_LABEL[entry.policy]} · dmg {formatDamage(entry.damagePct)}
        </span>
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-text-2">{formatTime(entry.timeS)}</span>
      <span className="text-right font-mono text-sm font-semibold tabular-nums">{formatScore(entry.score)}</span>
    </li>
  );
}

function RoomBoard({ feed }: { readonly feed: LeaderboardFeed }) {
  const leader = feed.entries[0];
  return (
    <>
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-[#3A2A1C] bg-[#17120D] p-3.5">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">{ROOM.id} · SAME SEED FOR EVERYONE</span>
          <span className="font-display text-xl font-bold leading-tight">{leader ? 'Score to beat' : 'Nobody on the board'}</span>
          <span className="truncate text-xs text-[#B8C0C9]">
            Rain · every terrain{leader ? ` · held by ${leader.nickname}` : ' · the first run takes it'}
          </span>
        </div>
        <span className="font-mono text-[40px] font-semibold leading-none tabular-nums text-orange">{leader ? formatScore(leader.score) : '—'}</span>
      </section>

      <div className={`${COLUMNS} font-mono text-[9px] font-medium tracking-[1px] text-faint`}>
        <span>#</span>
        <span>PILOT · BRAIN</span>
        <span className="text-right">TIME</span>
        <span className="text-right">SCORE</span>
      </div>

      <section aria-live="polite">
        {feed.entries.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line-3 px-3 py-5 text-center text-[13px] text-muted">
            {feed.status === 'loading' ? 'Reading the board.' : 'No runs submitted yet. Finish the Room Challenge and submit a nickname.'}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {feed.entries.map((entry) => (
              <Row key={`${entry.rank}-${entry.nickname}`} entry={entry} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

/** The player's own best run per mission, from this browser's saved progress. */
function MyRuns() {
  const best = useProgressStore((store) => store.best);
  const runs = useProgressStore((store) => store.runs);
  return (
    <>
      <p className="font-mono text-[10px] font-medium tracking-[1px] text-faint">
        BEST PER MISSION · {runs} {runs === 1 ? 'RUN' : 'RUNS'} ON THIS DEVICE
      </p>
      <ol className="flex flex-col gap-1.5">
        {MISSION_IDS.map((id) => {
          const mine = best[id];
          return (
            <li key={id} className="rounded-[10px] border border-[#1E232A] bg-panel-3">
              <Link href={`/brief/${id}`} className={`${COLUMNS} h-11`}>
                <span className="font-mono text-sm font-semibold text-muted">{id.slice(1)}</span>
                <span className="truncate text-sm font-semibold">{MISSIONS[id].name}</span>
                <span className="flex justify-end">
                  <Stars count={mine?.stars ?? 0} size={13} />
                </span>
                <span className="text-right font-mono text-sm font-semibold tabular-nums">{mine ? formatScore(mine.score) : '—'}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function LeaderboardClient() {
  const feed = useLeaderboard('M5');
  const nickname = useProgressStore((store) => store.nickname);
  const [tab, setTab] = useState<Tab>('room');
  const mine = nickname ? feed.entries.find((entry) => entry.nickname.toLowerCase() === nickname.toLowerCase()) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-3 px-4 pb-44 pt-[max(18px,env(safe-area-inset-top))]">
      <header className="flex h-11 shrink-0 items-center justify-between">
        <Link href="/" aria-label="Back to home" className="rr-iconbtn">
          <Icon name="back" />
        </Link>
        <h1 className="font-display text-[17px] font-bold tracking-[3px]">LEADERBOARD</h1>
        <Live status={feed.status} />
      </header>

      <div className="flex gap-1.5 rounded-xl border border-line bg-panel-2 p-1" role="group" aria-label="Board">
        {(
          [
            ['room', 'Room Challenge'],
            ['mine', 'My runs'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`h-[38px] flex-1 rounded-[9px] font-display text-[13px] uppercase tracking-[1px] ${tab === id ? 'bg-orange font-bold text-on-orange' : 'font-semibold text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'room' ? <RoomBoard feed={feed} /> : <MyRuns />}

      <div className="fixed inset-x-0 bottom-0 border-t border-[#222831] bg-ground">
        <div className="mx-auto flex max-w-[430px] flex-col gap-2.5 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
          {mine && tab === 'room' ? (
            <ol>
              <Row entry={mine} mine />
            </ol>
          ) : null}
          <Link href={`/brief/${ROOM.id}`} className="rr-btn rr-btn-primary !text-[15px]">
            {mine ? 'Take another shot' : 'Run the Room Challenge'}
          </Link>
        </div>
      </div>
    </main>
  );
}
