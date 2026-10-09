'use client';

import type { MissionId } from '@rivetrun/contracts';
import { compileTrack, MISSION_IDS, MISSIONS } from '@rivetrun/sim';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { matchPreset } from '@/ui/buildStats';
import { QrCode } from '../leaderboard/_lib/QrCode';
import { laneColor, MAX_PLAYERS, rankPlayers, type RaceSnapshot } from '../race/_lib/protocol';
import { RaceLanes } from '../race/_lib/RaceLanes';
import { Ranking, formatRaceTime, playerStatus } from '../race/_lib/Ranking';
import { RobotGlyph } from '../race/_lib/RobotGlyph';
import styles from '../race/_lib/race.module.css';
import { postRaceAction, useRaceRoom, useServerNow } from '../race/_lib/useRaceRoom';

interface RaceScreenProps {
  readonly code: string;
  /** Origin phones can reach (LAN address on localhost). */
  readonly siteUrl: string;
}

const bare = (url: string): string => url.replace(/^https?:\/\//, '');

function Shell({ code, right, children }: { readonly code: string; readonly right?: ReactNode; readonly children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col gap-[1.6vh] p-[2vw] lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[clamp(0.7rem,1.1vw,1.4rem)] tracking-[0.3em] text-blueprint">RIVETRUN · EVERY PHONE RUNS ITS OWN ROBOT · JEV DRIVES</p>
          <h1 className="font-mono text-[clamp(2rem,4.6vw,5.8rem)] font-black leading-none tracking-tight text-safety">
            Room Race <span className="text-slate-100">{code}</span>
          </h1>
        </div>
        {right}
      </header>
      <div className="hazard h-[0.8vh] min-h-1.5 shrink-0 rounded-full" />
      {children}
      <footer className="flex flex-wrap items-center justify-between gap-2 font-mono text-[clamp(0.8rem,1.2vw,1.6rem)]">
        <span className="font-bold">Today a game. Tomorrow a benchmark.</span>
        <span className="text-slate-400">Same track, same seed, same start signal · the robot and the briefing are yours</span>
      </footer>
    </main>
  );
}

function Lobby({ snapshot, joinUrl, onError }: { readonly snapshot: RaceSnapshot; readonly joinUrl: string; readonly onError: (message: string) => void }) {
  const [missionId, setMissionId] = useState<MissionId>(snapshot.missionId);
  const [starting, setStarting] = useState(false);
  const start = async (): Promise<void> => {
    setStarting(true);
    try {
      await postRaceAction(snapshot.code, { action: 'start', missionId });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not start the race.');
    } finally {
      setStarting(false);
    }
  };
  const empty = snapshot.players.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[2vw] lg:flex-row">
      <aside className="riveted flex shrink-0 flex-col items-center gap-[1.4vh] rounded-[1vw] border border-slate-line bg-slate-panel p-[1.6vw] lg:w-[28vw]">
        <p className="font-mono text-[clamp(1.1rem,1.8vw,2.4rem)] font-black">Scan to join</p>
        <div className="w-full max-w-xs overflow-hidden rounded-[0.8vw] border-4 border-safety lg:max-w-none">
          <QrCode value={joinUrl} className="block h-auto w-full" />
        </div>
        <p className="break-all text-center font-mono text-[clamp(0.8rem,1.15vw,1.5rem)] text-slate-200">{bare(joinUrl)}</p>
        <p className="text-center text-[clamp(0.85rem,1.1vw,1.4rem)] text-slate-300">
          or open <span className="font-mono text-slate-100">/race</span> and type <span className="font-mono font-black text-safety">{snapshot.code}</span>
        </p>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col gap-[1.6vh]">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-[clamp(1.2rem,2.2vw,2.8rem)] font-black">On the grid</h2>
          <span className="font-mono text-[clamp(0.9rem,1.3vw,1.7rem)] text-dim">
            {snapshot.players.length} / {MAX_PLAYERS} robots
          </span>
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-[0.8vw] overflow-y-auto xl:grid-cols-3">
          {empty ? (
            <div className="col-span-full rounded-[0.8vw] border border-dashed border-slate-line bg-slate-panel/70 p-[2vw] text-center">
              <p className="text-[clamp(1.4rem,2.6vw,3.4rem)] font-black leading-tight">The grid is empty.</p>
              <p className="mt-[0.6vh] text-[clamp(0.9rem,1.4vw,1.8rem)] text-slate-300">Scan the code. Your phone brings its own robot.</p>
            </div>
          ) : (
            snapshot.players.map((player) => (
              <div key={player.id} className="rr-rise flex items-center gap-[0.8vw] rounded-[0.6vw] border border-slate-line bg-slate-panel/95 p-[0.8vw]">
                <RobotGlyph build={player.build} color={laneColor(player.lane)} className="h-[7vh] min-h-10 w-auto shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-[clamp(1rem,1.6vw,2.1rem)] font-black leading-tight">{player.nickname}</p>
                  <p className="truncate font-mono text-[clamp(0.6rem,0.85vw,1.1rem)] text-dim">{matchPreset(player.build)?.name ?? 'Custom build'}</p>
                  {player.briefing ? (
                    <p className="truncate text-[clamp(0.65rem,0.9vw,1.15rem)] italic text-slate-300">“{player.briefing}”</p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-[0.8vw]">
          <div className="flex flex-wrap gap-[0.5vw]" role="radiogroup" aria-label="Track">
            {MISSION_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={missionId === id}
                onClick={() => setMissionId(id)}
                className={`min-h-12 rounded-[0.6vw] border px-[1vw] font-mono text-[clamp(0.75rem,1vw,1.3rem)] font-bold ${
                  missionId === id ? 'border-safety bg-safety text-slate-deep' : 'border-slate-line bg-slate-panel text-slate-200'
                }`}
              >
                {id} {MISSIONS[id].name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void start()}
            disabled={empty || starting}
            className="rr-btn rr-btn-primary ml-auto px-[2.4vw] text-[clamp(1.1rem,1.8vw,2.4rem)]"
            style={{ minHeight: 'max(56px, 6.5vh)' }}
          >
            {starting ? 'Starting…' : 'Start the race'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Results({ snapshot, trackLengthM }: { readonly snapshot: RaceSnapshot; readonly trackLengthM: number }) {
  const ranked = rankPlayers(snapshot.players);
  const medal = ['bg-safety text-slate-ink', 'bg-slate-200 text-slate-ink', 'bg-amber-700 text-amber-50'];
  return (
    <ol className="grid min-h-0 flex-1 auto-rows-min content-start gap-[0.9vh] overflow-y-auto lg:grid-cols-2 lg:gap-x-[1.2vw]">
      {ranked.map((player, index) => (
        <li key={player.id} className="rr-rise flex items-center gap-[1vw] rounded-[0.6vw] border border-slate-line bg-slate-panel/95 px-[1vw] py-[0.8vh]">
          <span
            className={`flex aspect-square h-[6vh] min-h-9 shrink-0 items-center justify-center rounded-[0.4vw] font-mono text-[clamp(1.1rem,2vw,2.6rem)] font-black ${
              medal[index] ?? 'border border-slate-line bg-slate-ink text-slate-300'
            }`}
          >
            {index + 1}
          </span>
          <RobotGlyph build={player.build} color={laneColor(player.lane)} wrecked={!player.finished} className="h-[6vh] min-h-9 w-auto shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[clamp(1.1rem,2vw,2.6rem)] font-black leading-tight">{player.nickname}</p>
            {player.briefing ? <p className="truncate text-[clamp(0.65rem,0.95vw,1.2rem)] italic text-slate-300">“{player.briefing}”</p> : null}
          </div>
          <div className="shrink-0 text-right font-mono">
            <p className={`text-[clamp(1.1rem,2.1vw,2.8rem)] font-black tabular-nums ${player.finished ? 'text-safety' : 'text-bad'}`}>
              {player.finished && player.raceMs !== null ? formatRaceTime(player.raceMs) : playerStatus(player, trackLengthM)}
            </p>
            <p className="text-[clamp(0.6rem,0.85vw,1.1rem)] text-dim">
              {player.score !== null ? `${Math.round(player.score)} pts · ` : ''}dmg {Math.round(player.damagePct)} %
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RaceScreen({ code, siteUrl }: RaceScreenProps) {
  const router = useRouter();
  const { snapshot, link, clockOffsetMs } = useRaceRoom(code);
  const now = useServerNow(clockOffsetMs);
  const [error, setError] = useState<string | null>(null);
  const joinUrl = `${siteUrl}/race/${code}`;

  if (link === 'missing' || !snapshot) {
    return (
      <Shell code={code}>
        <div className="flex flex-1 flex-col items-center justify-center gap-[2vh] text-center">
          <p className="text-[clamp(1.6rem,3.4vw,4.2rem)] font-black">{link === 'missing' ? 'This room is closed.' : 'Opening the room…'}</p>
          {link === 'missing' ? (
            <button type="button" onClick={() => router.push('/screen')} className="rr-btn rr-btn-primary px-8 text-xl">
              Back to the leaderboard
            </button>
          ) : null}
        </div>
      </Shell>
    );
  }

  const mission = MISSIONS[snapshot.missionId];
  const trackLengthM = compileTrack(mission.track).lengthM;
  const elapsedMs = snapshot.startAt === null ? 0 : Math.max(0, now - snapshot.startAt);
  const reset = (): void => {
    postRaceAction(code, { action: 'reset' }).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'Could not reset the room.'),
    );
  };

  const statusChip = (
    <div className="flex items-center gap-[1vw] font-mono text-[clamp(0.9rem,1.4vw,1.9rem)]">
      {link === 'reconnecting' ? <span className="text-warn">RECONNECTING…</span> : null}
      {snapshot.status === 'racing' ? (
        <span className="rounded-md border border-slate-line bg-slate-panel px-[0.8vw] py-[0.4vh] font-black tabular-nums">
          {mission.name} · {formatRaceTime(elapsedMs)}
        </span>
      ) : null}
      {snapshot.status === 'finished' ? (
        <button type="button" onClick={reset} className="rr-btn rr-btn-primary px-[1.6vw] text-[clamp(1rem,1.5vw,2rem)]">
          New race
        </button>
      ) : null}
      {snapshot.status !== 'lobby' && snapshot.status !== 'finished' ? (
        <button type="button" onClick={reset} className="rr-btn rr-btn-secondary px-[1.2vw] text-[clamp(0.8rem,1.1vw,1.4rem)]">
          Abort
        </button>
      ) : null}
      {snapshot.status === 'lobby' ? (
        <button type="button" onClick={() => router.push('/screen')} className="rr-btn rr-btn-secondary px-[1.2vw] text-[clamp(0.8rem,1.1vw,1.4rem)]">
          Leaderboard
        </button>
      ) : null}
    </div>
  );

  return (
    <Shell code={code} right={statusChip}>
      {error ? (
        <p role="alert" className="rounded-lg border border-bad/60 bg-bad/10 px-4 py-2 text-[clamp(0.9rem,1.2vw,1.5rem)] text-red-200">
          {error}
        </p>
      ) : null}

      {snapshot.status === 'lobby' ? <Lobby snapshot={snapshot} joinUrl={joinUrl} onError={setError} /> : null}

      {snapshot.status === 'countdown' || snapshot.status === 'racing' ? (
        <div className="relative flex min-h-0 flex-1 flex-col gap-[1.6vw] lg:flex-row">
          <section className="min-h-[40vh] min-w-0 flex-1">
            <RaceLanes mission={mission} players={snapshot.players} />
          </section>
          <aside className="riveted flex shrink-0 flex-col gap-[1vh] rounded-[0.8vw] border border-slate-line bg-slate-panel p-[1vw] lg:w-[22vw]">
            <p className="font-mono text-[clamp(1rem,1.5vw,2rem)] font-black">Live order</p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Ranking players={snapshot.players} trackLengthM={trackLengthM} size="screen" />
            </div>
          </aside>
          {snapshot.status === 'countdown' ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-[0.8vw] bg-slate-ink/75 backdrop-blur-sm">
              <p
                key={Math.ceil(((snapshot.startAt ?? now) - now) / 1000)}
                className={`${styles.count} font-mono text-[32vh] font-black leading-none text-safety`}
              >
                {Math.max(1, Math.ceil(((snapshot.startAt ?? now) - now) / 1000))}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {snapshot.status === 'finished' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-[1.4vh]">
          <h2 className="font-mono text-[clamp(1.2rem,2.2vw,2.8rem)] font-black">
            Finish order · {mission.name} · {snapshot.players.filter((player) => player.finished).length} of {snapshot.players.length} finished
          </h2>
          <p className="font-mono text-[clamp(0.7rem,1vw,1.3rem)] text-dim">Times are wall-clock from the start signal: the time Jev spends thinking counts.</p>
          <Results snapshot={snapshot} trackLengthM={trackLengthM} />
        </div>
      ) : null}
    </Shell>
  );
}
