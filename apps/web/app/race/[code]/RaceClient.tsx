'use client';

import { BuildSchema, type GhostTrace } from '@rivetrun/contracts';
import { compileTrack, MISSIONS } from '@rivetrun/sim';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { RunCanvas } from '@/game';
import { useRunView } from '@/game/runFeed';
import { useRunStore } from '@/state/run';
import { JoinResponseSchema, RaceSnapshotSchema, laneColor, rankPlayers, type RaceSnapshot } from '../_lib/protocol';
import { Ranking } from '../_lib/Ranking';
import { RobotGlyph } from '../_lib/RobotGlyph';
import styles from '../_lib/race.module.css';
import { postRaceAction, useRaceRoom, useServerNow } from '../_lib/useRaceRoom';
import { JoinForm, type JoinRequest } from './JoinForm';
import { useRaceRun, type RaceIdentity } from './useRaceRun';

const NO_GHOSTS: readonly GhostTrace[] = [];
const IdentitySchema = z.object({
  playerId: z.string(),
  token: z.string(),
  build: BuildSchema,
  briefing: z.string().optional(),
});

const storageKey = (code: string): string => `rivetrun.race.${code}`;

// Session storage keeps the seat across a reload; it can be unavailable (private mode), so every access is guarded.
function loadIdentity(code: string): RaceIdentity | null {
  try {
    const parsed = IdentitySchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey(code)) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveIdentity(code: string, identity: RaceIdentity | null): void {
  try {
    if (identity) sessionStorage.setItem(storageKey(code), JSON.stringify(identity));
    else sessionStorage.removeItem(storageKey(code));
  } catch {
    // The seat then lasts until the page reloads.
  }
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-6">{children}</main>;
}

function Countdown({ snapshot, now }: { readonly snapshot: RaceSnapshot; readonly now: number }) {
  const seconds = Math.max(1, Math.ceil(((snapshot.startAt ?? now) - now) / 1000));
  return (
    <Frame>
      <p className="rr-label text-center text-blueprint">
        {MISSIONS[snapshot.missionId].name} · {snapshot.players.length} robots
      </p>
      <p key={seconds} className={`${styles.count} text-center font-mono text-[42vw] font-black leading-none text-safety`}>
        {seconds}
      </p>
      <p className="text-center text-lg font-bold">Hands off. Jev is driving.</p>
    </Frame>
  );
}

export function RaceClient({ code }: { readonly code: string }) {
  const { snapshot, link, clockOffsetMs } = useRaceRoom(code);
  const now = useServerNow(clockOffsetMs, 200);
  const build = useRunStore((store) => store.build);
  const priority = useRunStore((store) => store.priority);
  const [identity, setIdentity] = useState<RaceIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setIdentity(loadIdentity(code)), [code]);

  // The server forgot this seat (restart or a new room under the same code): start over.
  // The streamed snapshot can be a beat older than a join, so the seat is only dropped after a fresh read confirms it.
  const seated = identity !== null && snapshot !== null && snapshot.players.some((player) => player.id === identity.playerId);
  const snapshotLoaded = snapshot !== null;
  useEffect(() => {
    if (!identity || !snapshotLoaded || seated) return undefined;
    let cancelled = false;
    fetch(`/api/race/${code}`, { cache: 'no-store' })
      .then(async (response) => (response.ok ? RaceSnapshotSchema.parse(await response.json()) : null))
      .then((fresh) => {
        if (cancelled || !fresh || fresh.players.some((player) => player.id === identity.playerId)) return;
        saveIdentity(code, null);
        setIdentity(null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identity, snapshotLoaded, seated, code]);

  const join = useCallback(
    async ({ nickname, briefing }: JoinRequest): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const response = JoinResponseSchema.parse(
          await postRaceAction(code, { action: 'join', nickname, build, briefing: briefing || undefined }),
        );
        const next: RaceIdentity = { ...response, build, briefing: briefing || undefined };
        saveIdentity(code, next);
        setIdentity(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not join the room.');
      } finally {
        setBusy(false);
      }
    },
    [code, build],
  );

  const feed = useRaceRun(snapshot, seated ? identity : null, priority, clockOffsetMs);
  const view = useRunView(feed);

  if (link === 'missing') {
    return (
      <Frame>
        <p className="rr-label text-blueprint">Room Race · {code}</p>
        <h1 className="font-mono text-3xl font-black text-safety">Room not found</h1>
        <p className="text-sm text-slate-300">The room closed or the code is wrong. Check the four letters on the big screen.</p>
        <Link href="/race" className="rr-btn rr-btn-primary">
          Enter another code
        </Link>
      </Frame>
    );
  }
  if (!snapshot) {
    return (
      <Frame>
        <p className="rr-label text-center text-blueprint">Room Race · {code}</p>
        <p className="text-center text-lg font-bold">Connecting…</p>
      </Frame>
    );
  }

  const mission = MISSIONS[snapshot.missionId];
  const trackLengthM = compileTrack(mission.track).lengthM;
  const me = seated ? snapshot.players.find((player) => player.id === identity.playerId) : undefined;
  const racing = snapshot.status === 'racing' || snapshot.status === 'finished';

  if (!me) {
    if (snapshot.status === 'lobby') {
      return (
        <Frame>
          <JoinForm code={code} build={build} busy={busy} error={error} onJoin={(request) => void join(request)} />
        </Frame>
      );
    }
    return (
      <Frame>
        <p className="rr-label text-blueprint">Room Race · {code}</p>
        <h1 className="font-mono text-3xl font-black text-safety">{snapshot.status === 'finished' ? 'Race over' : 'Race in progress'}</h1>
        <p className="text-sm text-slate-300">You can join as soon as the host opens the next race. This page updates by itself.</p>
        <div className="rr-panel p-3">
          <Ranking players={snapshot.players} trackLengthM={trackLengthM} />
        </div>
      </Frame>
    );
  }

  if (snapshot.status === 'lobby') {
    return (
      <Frame>
        <p className="rr-label text-blueprint">Room Race · {code}</p>
        <h1 className="font-mono text-3xl font-black text-safety">You are in, {me.nickname}</h1>
        <div className="rr-panel flex items-center gap-3 p-4">
          <RobotGlyph build={me.build} color={laneColor(me.lane)} className="h-16 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="rr-label">Lane {me.lane + 1}</p>
            <p className="mt-1 text-sm text-slate-200">{me.briefing ? `“${me.briefing}”` : 'No briefing: Jev follows your priority slider.'}</p>
          </div>
        </div>
        <div className="rr-panel p-3">
          <p className="rr-label mb-2">
            On the grid · {snapshot.players.length}
          </p>
          <ul className="flex flex-wrap gap-2">
            {snapshot.players.map((player) => (
              <li key={player.id} className="rr-chip">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: laneColor(player.lane) }} />
                {player.nickname}
              </li>
            ))}
          </ul>
        </div>
        <p className="rr-blink text-center font-mono text-sm text-dim">Waiting for the host to start…</p>
      </Frame>
    );
  }

  if (snapshot.status === 'countdown') return <Countdown snapshot={snapshot} now={now} />;

  const place = rankPlayers(snapshot.players).findIndex((player) => player.id === me.id) + 1;
  const over = snapshot.status === 'finished';
  // Once this robot's run has ended, the HUD makes room for the result card.
  const showResult = over || (view.done && me.done);
  const outcome = view.outcome;
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-ink">
      {racing ? <RunCanvas mission={mission} build={me.build} feed={feed} ghosts={NO_GHOSTS} hud={!showResult} /> : null}

      {showResult ? (
        <div className="absolute inset-x-3 top-1/2 mx-auto max-w-md -translate-y-1/2">
          <div className="rr-panel rr-pop p-4">
            <p className="rr-label text-blueprint">{over ? 'Final order' : 'You are done. Others are still racing.'}</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="font-mono text-5xl font-black leading-none text-safety">
                P{place}
                <span className="ml-2 text-base font-bold text-dim">of {snapshot.players.length}</span>
              </p>
              <p className={`text-right font-mono text-sm font-bold ${me.finished ? 'text-ok' : 'text-bad'}`}>
                {me.finished ? 'FINISHED' : 'DID NOT FINISH'}
                {outcome ? <span className="block text-xs font-normal text-dim">{Math.round(outcome.score)} pts · dmg {Math.round(outcome.damagePct)} %</span> : null}
              </p>
            </div>
            {outcome?.why ? <p className="mt-2 text-sm text-slate-200">{outcome.why}</p> : null}
            <div className="mt-3 max-h-[38vh] overflow-y-auto">
              <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} />
            </div>
            <p className="mt-3 text-center font-mono text-xs text-dim">
              {over ? 'Stay here: the host can start the next race.' : 'Times are wall-clock: Jev’s thinking counts.'}
            </p>
          </div>
        </div>
      ) : (
        /* Mini live ranking, under the top bar. */
        <div className="pointer-events-none absolute right-2.5 w-44" style={{ top: 'calc(max(10px, env(safe-area-inset-top)) + 126px)' }}>
          <div className="rounded-lg border border-slate-line bg-slate-ink/85 p-1.5 backdrop-blur">
            <p className="rr-label mb-1 px-1">
              P{place} of {snapshot.players.length}
            </p>
            <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} limit={3} />
          </div>
        </div>
      )}
    </main>
  );
}
