'use client';

import { GhostTraceSchema, type GhostTrace } from '@rivetrun/contracts';
import { compileTrack, heuristicBrain, MISSIONS } from '@rivetrun/sim';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DriveControls } from '@/game/drive/DriveControls';
import { createDriveInput } from '@/game/drive/driveInput';
import { useRunHaptics } from '@/game/drive/haptics';
import { BrainHud, BrainLine } from '@/game/hud/BrainHud';
import { brainIsOpen, brainPanel, useBrainChoice } from '@/game/hud/brainStore';
import { LaneProgress } from '@/game/hud/LaneProgress';
import { TelemetryButton, TelemetryDrawer } from '@/game/telemetry/TelemetryDrawer';
import { telemetry, useTelemetryOpen } from '@/game/telemetry/telemetryStore';
import { RunAlerts, useMedia } from '@/game/hud/RunHud';
import { replayTrace } from '@/game/replayFeed';
import RunCanvas from '@/game/RunCanvas';
import { createClientBrain } from '@/brain/clientBrain';
import { AppHeader } from '@/ui/AppHeader';
import { createRunFeed, useRunView } from '@/game/runFeed';
import { startHumanRun } from '../_lib/humanRun';
import { startJevRun } from '../_lib/jevRun';
import { ARENA_DECIDE_TIMEOUT_MS, duelVerdict, formatRaceTime, penaltyNote, playerColor, rankPlayers, resultShort, type RacePlayer, type RaceSnapshot } from '../_lib/protocol';
import { Ranking } from '../_lib/Ranking';
import type { RaceSeat } from '../_lib/report';

const NO_GHOSTS: readonly GhostTrace[] = [];

interface RaceRunProps {
  readonly snapshot: RaceSnapshot;
  readonly seat: RaceSeat;
  readonly me: RacePlayer;
  /** Server clock, epoch ms. */
  readonly now: number;
  readonly clockOffsetMs: number;
}

/** A run that starts this long after the start signal was not there for it: the page was reloaded mid-race. */
const LATE_START_MS = 1500;
/** The reload note stays up for the first metres of the restarted run. */
const RESTART_NOTE_M = 6;

/** The arena id of Jev: a picked Jev drives through /api/decide like every JEV bot. */
const JEV_AGENT = 'jev-1.13.0';

/** The recorded run the server plays for a picked agent: the same stored ghost, asked for by the pick. Null when it cannot be had. */
async function loadStoredRun(missionId: string, seed: number, pick: RacePlayer['pick']): Promise<GhostTrace | null> {
  if (!pick || pick.agent === 'human') return null;
  try {
    const query = new URLSearchParams({ mission: missionId, seed: String(seed), preset: pick.presetId, agent: pick.agent, strategy: pick.strategy });
    const response = await fetch(`/api/play/ghost?${query.toString()}`, { cache: 'no-store' });
    if (response.status !== 200) return null;
    const parsed = GhostTraceSchema.safeParse(((await response.json()) as { ghost?: unknown }).ghost);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Drives this phone's run: starts driveController on the start signal and reports at 5 Hz. */
function useDrive(snapshot: RaceSnapshot, seat: RaceSeat, me: RacePlayer, clockOffsetMs: number) {
  const feed = useMemo(() => createRunFeed(), []);
  const drive = useMemo(() => createDriveInput(), []);
  const { code, raceNo, startAt, missionId, seed } = snapshot;
  const live = snapshot.status === 'countdown' || snapshot.status === 'racing';
  const build = me.build;

  // Read when the effect runs, not a dependency: a result arriving must not restart anything.
  const doneRef = useRef(me.done);
  useEffect(() => {
    doneRef.current = me.done;
  }, [me.done]);
  const [lateByS, setLateByS] = useState<number | null>(null);

  useEffect(() => {
    if (!live || startAt === null) return undefined;
    // The page was reloaded after this robot's result was final: there is nothing left to drive.
    if (doneRef.current) return undefined;
    // The server moves this lane itself from a recorded run of the same pick (RR-GUARD, cache first). The phone
    // plays the same recording in its own view, on the room's clock, so the robot it shows is where the lane is.
    if (me.serverDriven) {
      let alive = true;
      let stopReplay: (() => void) | undefined;
      void loadStoredRun(missionId, seed, me.pick).then((trace) => {
        if (alive && trace) stopReplay = replayTrace(trace, feed, { elapsedMs: Date.now() + clockOffsetMs - startAt });
      });
      return () => {
        alive = false;
        stopReplay?.();
      };
    }
    drive.release();
    let stop: (() => void) | undefined;
    const waitMs = startAt - (Date.now() + clockOffsetMs);
    // Joining a race already under way (the page was reloaded): the run starts again from the line, on the same clock.
    setLateByS(waitMs < -LATE_START_MS ? Math.round(-waitMs / 1000) : null);
    const timer = setTimeout(
      () => {
        // A player who picked an AI agent on /play (kind 'jev'): this phone runs that agent's robot and watches it.
        stop =
          me.kind === 'jev'
            ? startJevRun({
                code, raceNo, seat, mission: MISSIONS[missionId], seed, build, feed, briefing: me.briefing, priority: me.priority, who: me.nickname,
                // Jev goes through /api/decide; any other model through the arena route, with the same briefing.
                ...(me.model && me.model !== JEV_AGENT ? { brain: me.model === 'heuristic' ? heuristicBrain : createClientBrain({ url: `/api/arena/decide?model=${encodeURIComponent(me.model)}`, timeoutMs: ARENA_DECIDE_TIMEOUT_MS, briefing: me.briefing }) } : {}),
              })
            : startHumanRun({ code, raceNo, seat, mission: MISSIONS[missionId], seed, build, feed, drive });
      },
      Math.max(0, waitMs),
    );
    return () => {
      clearTimeout(timer);
      stop?.();
    };
    // The build is locked once the countdown starts and the clock offset is read once per race on purpose:
    // a change in either must not restart a run in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, raceNo, startAt, code, missionId, seed, seat, feed, drive]);

  return { feed, drive, lateByS };
}

/**
 * What next, under the final result. The seat survives the race, so "Race again" needs no rejoin: this page
 * switches to the lobby by itself when the host reopens the room. If the room is gone, it goes to the code form.
 */
/** Esc leaves for Home, unless the header's menu is open: then Esc closes that menu, as everywhere. */
function useEscHome(): void {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !document.querySelector('[role="menu"]')) router.push('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
}

/**
 * This phone's result while others still race: a compact banner in the race bar, so the track and the lane dots stay
 * in view. The player can watch, go back to the menu or play again; Esc leaves too.
 */
function ResultBanner({ line, finished, closesInS, auto }: { readonly line: string; readonly finished: boolean; readonly closesInS: number | null; readonly auto?: { readonly test: boolean } }) {
  useEscHome();
  return (
    <div className="pointer-events-auto mt-1.5 rounded-xl border border-safety/60 bg-slate-ink/95 px-3 py-2 backdrop-blur" data-testid="race-result-banner">
      <p className={`font-mono text-sm font-black ${finished ? 'text-ok' : 'text-bad'}`}>{line}</p>
      <p className="mt-0.5 font-mono text-[11px] text-dim">Others still racing{closesInS !== null ? ` · results in at most ${closesInS} s` : ''}</p>
      <div className={`mt-2 grid gap-2 ${auto ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Link href="/" className="rr-btn rr-btn-secondary !min-h-10 !text-[13px]" data-testid="race-back-to-menu">
          Back to menu
        </Link>
        {auto ? (
          <Link href={auto.test ? '/play?test=1' : '/play'} className="rr-btn rr-btn-primary !min-h-10 !text-[13px]">
            Play again
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function AfterRace({ code, auto }: { readonly code: string; /** An auto room of /play: no host, it closes by itself. */ readonly auto?: { readonly test: boolean } }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  useEscHome();
  // An auto room has no host to reopen it: "Play again" goes back to /play, which matches into the next room.
  if (auto) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <Link href={auto.test ? '/play?test=1' : '/play'} className="rr-btn rr-btn-primary">
          Play again
        </Link>
        <Link href="/" className="rr-btn rr-btn-secondary" data-testid="race-back-to-menu">
          Back to menu
        </Link>
        <p className="text-center font-mono text-[11px] text-dim">A new room starts every 30 s. Change your mission, vehicle or driver on the way in.</p>
      </div>
    );
  }
  const raceAgain = (): void => {
    setWaiting(true);
    fetch(`/api/race/${code}`, { cache: 'no-store' })
      .then((response) => {
        if (response.status === 404) router.push('/race');
      })
      .catch(() => undefined); // Offline for a moment: stay seated; the room view reconnects on its own.
  };
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Link href="/" className="rr-btn rr-btn-secondary">
          Play solo
        </Link>
        <button type="button" onClick={raceAgain} className="rr-btn rr-btn-primary" aria-pressed={waiting}>
          Race again
        </button>
      </div>
      <p role="status" className="text-center font-mono text-[11px] text-dim">
        {waiting
          ? 'You keep your seat. This page switches by itself when the host reopens the room.'
          : 'Your seat is kept: Race again waits here for the host to reopen the room.'}
      </p>
      {waiting ? (
        <Link href="/race" className="text-center font-mono text-xs text-led underline">
          Join a different room instead
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The heavy half of the phone's race page: the run (sim driveController + the game's drive controls) and the 3D view.
 * Loaded on demand by RaceClient (next/dynamic), so three.js is never part of the join page.
 * Everything about the result (place, RACE TIME, DNF reason) is read from the server snapshot.
 */
export default function RaceRun({ snapshot, seat, me, now, clockOffsetMs }: RaceRunProps) {
  const { feed, drive, lateByS } = useDrive(snapshot, seat, me, clockOffsetMs);
  const view = useRunView(feed);
  const mission = MISSIONS[snapshot.missionId];
  const trackLengthM = compileTrack(mission.track).lengthM;
  const racing = snapshot.status === 'racing';
  const over = snapshot.status === 'finished';
  const place = rankPlayers(snapshot.players).findIndex((player) => player.id === me.id) + 1;
  // The local sim ending is not a result yet: the card waits for the server's.
  const localDone = view.done;
  const official = me.done;

  const verdict = over ? duelVerdict(snapshot.players) : null;
  // "JEV WINS" only when the winning bot is Jev; another model or the fixed rules winning is "AI WINS", as on /screen.
  const topBot = rankPlayers(snapshot.players).find((player) => player.kind === 'jev');
  const winnerIsOtherAi = topBot !== undefined && topBot.model !== undefined && topBot.model !== JEV_AGENT;
  const elapsedMs = snapshot.startAt === null ? 0 : Math.max(0, now - snapshot.startAt);
  const closesInS = snapshot.closesAt === null ? null : Math.max(0, Math.ceil((snapshot.closesAt - now) / 1000));
  const state = view.state;
  const agentDrives = me.kind === 'jev';
  const running = racing && !localDone && !official;
  // The pedals are for a human driver only; a picked agent's phone watches.
  const driving = running && !agentDrives;
  useRunHaptics(feed, driving);

  // [GAME] TELEMETRY and BRAIN, as on /run, fed by this phone's own run. Closed by default on a phone (the player's
  // choice is remembered per device); open by default from 1280 px wide until the player closes it there.
  const telemetryChosen = useTelemetryOpen();
  const wide = useMedia('(min-width: 1280px)');
  const [closedWide, setClosedWide] = useState(false);
  const telemetryOpen = running && (wide ? !closedWide : telemetryChosen);
  const toggleTelemetry = (): void => {
    if (wide) setClosedWide(!closedWide);
    else telemetry.toggle();
  };
  // The Brain card belongs to a robot whose brain decides on this phone. A lane replayed from a stored run has no
  // decisions to show ("Cached run of your pick" says so).
  const brainHere = running && agentDrives && !me.serverDriven;
  const brainOpen = brainIsOpen(useBrainChoice(), false);

  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-slate-ink">
      {racing || over ? <RunCanvas mission={mission} build={me.build} feed={feed} ghosts={NO_GHOSTS} hud={false} drive={drive} raise={telemetryOpen || (brainHere && brainOpen)} /> : null}

      {/* Race bar: the room's clock and this robot's place and gauges. */}
      {racing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto max-w-md px-2.5" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
          <div className="rounded-xl border border-slate-line bg-slate-ink/90 px-3 py-2 backdrop-blur">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="rr-label">Race time</p>
                <p className="font-mono text-2xl font-black leading-none tabular-nums">{formatRaceTime(official && me.raceMs !== null ? me.raceMs : elapsedMs)}</p>
              </div>
              <p className="font-mono text-2xl font-black leading-none text-safety">
                P{place}
                <span className="text-sm text-dim"> / {snapshot.players.length}</span>
              </p>
              <div className="text-right font-mono text-[11px] leading-tight text-slate-200">
                <p>{(state?.v ?? 0).toFixed(1)} m/s</p>
                <p className="text-ok">BAT {Math.round(state?.battery ?? 100)} %</p>
                <p className="text-bad">DMG {Math.round(state?.damage ?? 0)} %</p>
              </div>
            </div>
            {/* [GAME] The whole room on one line: a dot per lane on the mission's terrain strip, gliding between snapshots.
                It is part of the race bar, so it stays up after this phone's own finish, for as long as the room races. */}
            <div className="mt-1.5">
              <LaneProgress
                mission={mission}
                legend
                lanes={snapshot.players.map((player) => ({
                  id: player.id,
                  label: player.nickname,
                  agent: player.kind === 'jev' && player.model && player.model !== player.nickname ? player.model : undefined,
                  color: playerColor(player, me.id),
                  // Own lane while it runs: the local run's position, so the dot does not trail the robot on screen by a poll.
                  xM: player.id === me.id && !me.done ? (state?.x ?? player.x) : player.x,
                  me: player.id === me.id,
                }))}
              />
            </div>
          </div>
          {/* This phone's result is in and others still race: the result as a banner, the track stays in view. */}
          {(localDone || official) && !over ? (
            <ResultBanner
              line={official ? `P${place} of ${snapshot.players.length} · ${resultShort(me, trackLengthM)}` : 'Run complete · waiting for the official result'}
              finished={!official || me.finished}
              closesInS={closesInS}
              auto={snapshot.auto ? { test: snapshot.auto.test } : undefined}
            />
          ) : null}
          {running ? (
            <div className="float-left mt-2">
              <TelemetryButton open={telemetryOpen} onToggle={toggleTelemetry} />
            </div>
          ) : null}
          <div className="mt-2 ml-auto w-44 rounded-lg border border-slate-line bg-slate-ink/85 p-1.5 backdrop-blur">
            <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} limit={3} />
          </div>
        </div>
      ) : null}

      {/* The same touch controls as solo Drive mode (pedal halves, action button, keyboard). */}
      {driving ? (
        <div className="absolute inset-0 z-10">
          <DriveControls drive={drive} feed={feed} build={me.build} />
        </div>
      ) : null}

      {/* After a reload mid-race: say what happened to the run. */}
      {driving && lateByS !== null && (state?.x ?? 0) < RESTART_NOTE_M ? (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-[16] flex justify-center px-4">
          <p className="rr-mono rounded border border-[var(--rr-warn,#f5a524)] bg-black/80 px-3 py-2 text-center text-[11px] uppercase tracking-wider text-[var(--rr-warn,#f5a524)]">
            Page reloaded · back on the start line · the race clock kept running ({lateByS} s)
          </p>
        </div>
      ) : null}

      {running && agentDrives ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
          <p className="rr-mono rounded-lg border border-slate-line bg-black/80 px-3 py-2 text-center text-xs uppercase tracking-wider text-led">
            {me.serverDriven ? 'Cached run of your pick' : `${me.nickname} is driving your robot`}{me.plan ? ' · with the plan' : ''}
          </p>
        </div>
      ) : null}

      {/* [GAME] The telemetry drawer (a bottom sheet on a phone, a side panel in landscape) and, for an AI driver, the
          Brain card: one line at the bottom, tapped open into the sheet. Above the pedals, below the race bar and the result. */}
      {telemetryOpen ? (
        <div className="pointer-events-none absolute inset-0 z-[16]">
          <TelemetryDrawer feed={feed} build={me.build} drive={agentDrives ? undefined : drive} ghosts={NO_GHOSTS} onClose={toggleTelemetry} bottomPx={driving ? 118 : 0} brain={brainHere && wide} />
        </div>
      ) : brainHere ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[16] mx-auto max-w-[430px]">
          {brainOpen ? (
            <BrainHud pending={view.pending} last={view.decision} decisionCount={view.decisionCount} onCollapse={() => brainPanel.set(false)} />
          ) : (
            <BrainLine pending={view.pending} last={view.decision} onExpand={() => brainPanel.set(true)} />
          )}
        </div>
      ) : null}

      {/* The driver's alerts of solo Drive mode (scan prompt, next hazard, air, landing, blocked): above the pedals, below the race bar. */}
      {driving ? (
        <div className="pointer-events-none absolute inset-0 z-[15]">
          <RunAlerts mission={mission} feed={feed} build={me.build} />
        </div>
      ) : null}

      {/* Results only: the app header returns once the race is over. */}
      {over ? (
        <div className="absolute inset-x-0 top-0 z-30 bg-slate-ink/85 px-4 pb-1 backdrop-blur" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
          <div className="mx-auto max-w-md">
            <AppHeader back="/race" label="Room Race" />
          </div>
        </div>
      ) : null}

      {/* Result card: flat, centred, and only ever the server's numbers. Above the 3D view's own failure panel
          (z-40): once the run is over, the result is what matters. */}
      {over ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-3 pt-16">
          {/* Once the race is over the wrapper lets taps through, so the header's back arrow and menu above it answer. */}
          <div className="rr-panel pointer-events-auto max-h-full w-full max-w-md overflow-y-auto p-4">
            {!official ? (
              <>
                <p className="rr-label text-blueprint">Run complete</p>
                <p className="mt-1 font-mono text-2xl font-black text-safety">Waiting for the official result…</p>
                <p className="mt-1 text-sm text-slate-300">The room stamps every time from the same start signal.</p>
              </>
            ) : (
              <>
                <p className="rr-label text-blueprint">{over ? 'Final order' : 'Your result is in. Others are still racing.'}</p>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <p className="shrink-0 whitespace-nowrap font-mono text-5xl font-black leading-none text-safety">
                    P{place}
                    <span className="ml-2 text-base font-bold text-dim">of {snapshot.players.length}</span>
                  </p>
                  <p className={`min-w-0 text-right font-mono text-lg font-black ${me.finished ? 'text-ok' : 'text-bad'}`}>
                    {resultShort(me, trackLengthM)}
                    <span className="block text-[11px] font-normal text-dim">{me.finished ? `RACE TIME${penaltyNote(me) ? ` · ${penaltyNote(me)}` : ''}` : 'did not finish'}</span>
                  </p>
                </div>
              </>
            )}
            <div className="mt-3 max-h-[34vh] overflow-y-auto">
              <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} />
            </div>
            {verdict ? (
              <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${verdict.winner === 'jev' ? 'border-led/60 bg-led/10' : 'border-safety/60 bg-safety/10'}`}>
                <strong className={`font-mono tracking-wider ${verdict.winner === 'jev' ? 'text-led' : 'text-safety'}`}>{winnerIsOtherAi ? verdict.headline.replace('JEV WINS', 'AI WINS') : verdict.headline}</strong>
                <span className="text-slate-200"> · {verdict.detail}</span>
              </p>
            ) : null}
            {over ? (
              <AfterRace code={snapshot.code} auto={snapshot.auto ? { test: snapshot.auto.test } : undefined} />
            ) : (
              <p className="mt-3 text-center font-mono text-[11px] text-dim">Race time is wall-clock from the start signal, the same on every screen.</p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
