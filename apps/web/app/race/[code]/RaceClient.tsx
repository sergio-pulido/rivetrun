'use client';

import type { Build } from '@rivetrun/contracts';
import { compileTrack, MISSIONS } from '@rivetrun/sim';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { useRunStore } from '@/state/run';
import { AppHeader } from '@/ui/AppHeader';
import { buildName } from '@/ui/buildStats';
import { JoinResponseSchema, RaceSnapshotSchema, laneColor, type RaceSnapshot } from '../_lib/protocol';
import { Ranking } from '../_lib/Ranking';
import { RobotGlyph } from '../_lib/RobotGlyph';
import styles from '../_lib/race.module.css';
import { postRaceAction, useRaceRoom, useServerNow } from '../_lib/useRaceRoom';
import type { RaceSeat } from '../_lib/report';
import { BuildPhase } from './BuildPhase';
import { JoinForm } from './JoinForm';

// The 3D run view, the sim loop and three.js live in their own chunk: the join page stays light and the
// chunk is fetched in the background once the player has a seat (see the preload effect below).
const loadRaceRun = () => import('./RaceRun');
const RaceRun = dynamic(loadRaceRun, { ssr: false, loading: () => <LoadingGame note="Loading the 3D view…" /> });

const IdentitySchema = z.object({ playerId: z.string(), token: z.string() });

const storageKey = (code: string): string => `rivetrun.race.${code}`;

// Session storage keeps the seat across a reload; it can be unavailable (private mode), so every access is guarded.
function loadIdentity(code: string): RaceSeat | null {
  try {
    const parsed = IdentitySchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey(code)) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveIdentity(code: string, identity: RaceSeat | null): void {
  try {
    if (identity) sessionStorage.setItem(storageKey(code), JSON.stringify(identity));
    else sessionStorage.removeItem(storageKey(code));
  } catch {
    // The seat then lasts until the page reloads.
  }
}

const subscribeNever = (): (() => void) => () => undefined;
/** False in the server HTML and until React has hydrated the page. */
const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

/** Shown by the server HTML until the page is interactive, and while the 3D chunk downloads. */
function LoadingGame({ code, note }: { readonly code?: string; readonly note: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-6 text-center" aria-busy="true">
      {code ? <p className="rr-label text-blueprint">Room Race · {code}</p> : null}
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-line border-t-safety" aria-hidden="true" />
      <p className="font-mono text-2xl font-black text-safety">Loading game…</p>
      <p className="text-sm text-slate-300">{note}</p>
    </main>
  );
}

/**
 * Lobby-side screens (join, waiting, watching, room not found): the app header on top, content centred below.
 * `header={false}` for the countdown: BUILD, countdown and the race itself run without the app chrome.
 */
function Frame({ children, header = true }: { readonly children: React.ReactNode; readonly header?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-6 pt-3">
      {header ? <AppHeader back="/race" label="Room Race" /> : null}
      <div className="flex flex-1 flex-col justify-center gap-4 py-3">{children}</div>
    </main>
  );
}

function Countdown({ snapshot, now }: { readonly snapshot: RaceSnapshot; readonly now: number }) {
  const seconds = Math.max(1, Math.ceil(((snapshot.startAt ?? now) - now) / 1000));
  return (
    <Frame header={false}>
      <p className="rr-label text-center text-blueprint">
        {MISSIONS[snapshot.missionId].name} · {snapshot.players.length} robots
      </p>
      <p key={seconds} className={`${styles.count} text-center font-mono text-[42vw] font-black leading-none text-safety`}>
        {seconds}
      </p>
      <p className="text-center text-lg font-bold">Thumbs ready. Hold the right side to go.</p>
    </Frame>
  );
}

interface RaceClientProps {
  readonly code: string;
  /** Snapshot the server rendered the page with. */
  readonly initial: RaceSnapshot;
}

export function RaceClient({ code, initial }: RaceClientProps) {
  const hydrated = useHydrated();
  const { snapshot, link, clockOffsetMs } = useRaceRoom(code, initial);
  const now = useServerNow(clockOffsetMs, 200);
  const build = useRunStore((store) => store.build);
  const [identity, setIdentity] = useState<RaceSeat | null>(null);
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
    async (nickname: string): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const response = JoinResponseSchema.parse(await postRaceAction(code, { action: 'join', nickname, build }));
        const next: RaceSeat = { playerId: response.playerId, token: response.token };
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

  // BUILD phase edits go straight to the room, which holds the build every screen shows.
  const changeBuild = useCallback(
    (next: Build, ready: boolean): void => {
      if (!identity) return;
      postRaceAction(code, { action: 'build', ...identity, build: next, ready }).catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not save the build.'),
      );
    },
    [code, identity],
  );

  // A seat means a race is coming: fetch the 3D chunk now, while the player waits in the lobby.
  useEffect(() => {
    if (seated) void loadRaceRun().catch(() => undefined);
  }, [seated]);

  // Server HTML and the moments before hydration: nothing here is clickable yet, so say so.
  if (!hydrated) return <LoadingGame code={code} note="On a slow connection this takes a few seconds. Stay on this page." />;

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

  if (!me || !identity) {
    if (snapshot.status === 'lobby' || snapshot.status === 'build') {
      return (
        <Frame>
          <JoinForm code={code} build={build} busy={busy} error={error} onJoin={(nickname) => void join(nickname)} />
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
        <div className="grid grid-cols-2 gap-2">
          <Link href="/" className="rr-btn rr-btn-secondary">
            Play solo
          </Link>
          <Link href="/race" className="rr-btn rr-btn-secondary">
            Another room
          </Link>
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
            <p className="mt-1 text-sm text-slate-200">{buildName(me.build)} · you drive it</p>
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

  if (snapshot.status === 'build') {
    const secondsLeft = Math.max(0, Math.ceil(((snapshot.buildEndsAt ?? now) - now) / 1000));
    return <BuildPhase mission={mission} build={me.build} ready={me.ready} secondsLeft={secondsLeft} onChange={changeBuild} />;
  }

  // From the countdown on, the run component is mounted so the sim starts exactly on the start signal.
  return (
    <>
      <RaceRun snapshot={snapshot} seat={identity} me={me} now={now} clockOffsetMs={clockOffsetMs} />
      {snapshot.status === 'countdown' ? (
        <div className="fixed inset-0 z-30 bg-slate-ink">
          <Countdown snapshot={snapshot} now={now} />
        </div>
      ) : null}
    </>
  );
}
