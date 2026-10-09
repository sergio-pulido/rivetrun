'use client';

import type { ControlInput, ControlSpecial, GhostTrace } from '@rivetrun/contracts';
import { availableActions, compileTrack, MISSIONS } from '@rivetrun/sim';
import { useEffect, useMemo, useRef, useState } from 'react';
import RunCanvas from '@/game/RunCanvas';
import { createRunFeed, useRunView } from '@/game/runFeed';
import { startHumanRun } from '../_lib/humanRun';
import { formatRaceTime, rankPlayers, resultText, type RacePlayer, type RaceSnapshot } from '../_lib/protocol';
import { Ranking } from '../_lib/Ranking';
import type { RaceSeat } from '../_lib/report';

const NO_GHOSTS: readonly GhostTrace[] = [];
const IDLE: ControlInput = { throttle: false, brake: false };

interface RaceRunProps {
  readonly snapshot: RaceSnapshot;
  readonly seat: RaceSeat;
  readonly me: RacePlayer;
  /** Server clock, epoch ms. */
  readonly now: number;
  readonly clockOffsetMs: number;
}

/** Drives this phone's run: starts on the start signal, steps the sim from the touch controls, reports at 5 Hz. */
function useDrive(snapshot: RaceSnapshot, seat: RaceSeat, me: RacePlayer, clockOffsetMs: number) {
  const feed = useMemo(() => createRunFeed(), []);
  const controls = useRef<ControlInput>(IDLE);
  const { code, raceNo, startAt, missionId, seed } = snapshot;
  const live = snapshot.status === 'countdown' || snapshot.status === 'racing';
  const build = me.build;

  useEffect(() => {
    if (!live || startAt === null) return undefined;
    controls.current = IDLE;
    let stop: (() => void) | undefined;
    const timer = setTimeout(
      () => {
        stop = startHumanRun({ code, raceNo, seat, mission: MISSIONS[missionId], seed, build, feed, controls });
      },
      Math.max(0, startAt - (Date.now() + clockOffsetMs)),
    );
    return () => {
      clearTimeout(timer);
      stop?.();
    };
    // The build is locked once the countdown starts and the clock offset is read once per race on purpose:
    // a change in either must not restart a run in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, raceNo, startAt, code, missionId, seed, seat, feed]);

  return { feed, controls };
}

/** Keyboard for laptops: → or Space = go, ← = brake, ↑ = the action button. */
function useKeyboard(controls: React.RefObject<ControlInput>, special: ControlSpecial | null, onSpecial: () => void): void {
  useEffect(() => {
    const set = (patch: Partial<ControlInput>): void => {
      controls.current = { ...controls.current, ...patch };
    };
    const handle = (down: boolean) => (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'd') set({ throttle: down });
      else if (event.key === 'ArrowLeft' || event.key === 'a') set({ brake: down });
      else if ((event.key === 'ArrowUp' || event.key === 'w') && down && !event.repeat && special) onSpecial();
      else return;
      event.preventDefault();
    };
    const [keydown, keyup] = [handle(true), handle(false)];
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [controls, special, onSpecial]);
}

const SPECIAL_LABEL: Readonly<Record<ControlSpecial, string>> = { jump: 'JUMP', winch: 'WINCH', climb: 'CLIMB' };

/**
 * The heavy half of the phone's race page: this phone's sim loop, the touch controls and the 3D run view.
 * Loaded on demand by RaceClient (next/dynamic), so three.js is never part of the join page.
 * Everything about the result (place, RACE TIME, DNF reason) is read from the server snapshot.
 */
export default function RaceRun({ snapshot, seat, me, now, clockOffsetMs }: RaceRunProps) {
  const { feed, controls } = useDrive(snapshot, seat, me, clockOffsetMs);
  const view = useRunView(feed);
  const mission = MISSIONS[snapshot.missionId];
  const trackLengthM = compileTrack(mission.track).lengthM;
  const racing = snapshot.status === 'racing';
  const over = snapshot.status === 'finished';
  const place = rankPlayers(snapshot.players).findIndex((player) => player.id === me.id) + 1;
  // The local sim ending is not a result yet: the card waits for the server's.
  const localDone = view.done;
  const official = me.done;

  // Action buttons: one per special action this build can perform.
  const specials = useMemo<readonly ControlSpecial[]>(() => {
    const can = new Set(availableActions(me.build));
    return [can.has('jump') ? 'jump' : null, can.has('deploy_winch') ? 'winch' : null, can.has('climb_mode') ? 'climb' : null].filter(
      (special): special is ControlSpecial => special !== null,
    );
  }, [me.build]);
  const [climbOn, setClimbOn] = useState(false);
  const hold = (patch: Partial<ControlInput>) => () => {
    controls.current = { ...controls.current, ...patch };
  };
  const press = (special: ControlSpecial): void => {
    if (special === 'jump') controls.current = { ...controls.current, special: 'jump' };
    if (special === 'winch') controls.current = { ...controls.current, special: 'winch' };
    if (special === 'climb') {
      const on = !climbOn;
      setClimbOn(on);
      controls.current = { ...controls.current, special: on ? 'climb' : undefined };
    }
  };
  // Releasing the winch (or a finished jump) falls back to climb mode when it is switched on.
  const release = (): void => {
    controls.current = { ...controls.current, special: climbOn ? 'climb' : undefined };
  };
  const keySpecial = specials[0] ?? null;
  useKeyboard(controls, keySpecial, () => keySpecial && press(keySpecial));

  const elapsedMs = snapshot.startAt === null ? 0 : Math.max(0, now - snapshot.startAt);
  const closesInS = snapshot.closesAt === null ? null : Math.max(0, Math.ceil((snapshot.closesAt - now) / 1000));
  const state = view.state;
  const driving = racing && !localDone && !official;

  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-slate-ink">
      {racing || over ? <RunCanvas mission={mission} build={me.build} feed={feed} ghosts={NO_GHOSTS} hud={false} /> : null}

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
            {closesInS !== null ? (
              <p className="mt-1.5 rounded-md bg-safety px-2 py-1 text-center font-mono text-xs font-black text-slate-deep">RACE CLOSES IN {closesInS} s</p>
            ) : null}
          </div>
          <div className="mt-2 ml-auto w-44 rounded-lg border border-slate-line bg-slate-ink/85 p-1.5 backdrop-blur">
            <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} limit={3} />
          </div>
        </div>
      ) : null}

      {/* Touch controls: hold the right half to go, the left half to brake. */}
      {driving ? (
        <div className="absolute inset-0 z-10 flex" style={{ touchAction: 'none' }} onContextMenu={(event) => event.preventDefault()}>
          <button
            type="button"
            aria-label="Brake (hold)"
            className="flex h-full w-1/2 items-end justify-start p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] active:bg-white/5"
            onPointerDown={hold({ brake: true })}
            onPointerUp={hold({ brake: false })}
            onPointerCancel={hold({ brake: false })}
            onPointerLeave={hold({ brake: false })}
          >
            <span className="rounded-xl border border-slate-line bg-slate-ink/80 px-4 py-3 font-mono text-sm font-black text-slate-200">◀ BRAKE</span>
          </button>
          <button
            type="button"
            aria-label="Throttle (hold)"
            className="flex h-full w-1/2 items-end justify-end p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] active:bg-white/5"
            onPointerDown={hold({ throttle: true })}
            onPointerUp={hold({ throttle: false })}
            onPointerCancel={hold({ throttle: false })}
            onPointerLeave={hold({ throttle: false })}
          >
            <span className="rounded-xl border border-safety bg-safety px-5 py-3 font-mono text-sm font-black text-slate-deep">HOLD TO GO ▶</span>
          </button>
          {specials.length > 0 ? (
            <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 gap-2">
              {specials.map((special) => {
                const on = special === 'climb' && climbOn;
                return (
                  <button
                    key={special}
                    type="button"
                    aria-pressed={special === 'climb' ? on : undefined}
                    className={`h-14 w-14 rounded-full border-2 border-led font-mono text-[10px] font-black ${on ? 'bg-led text-slate-deep' : 'bg-slate-ink/90 text-led'}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      press(special);
                    }}
                    onPointerUp={special === 'winch' ? release : undefined}
                    onPointerCancel={special === 'winch' ? release : undefined}
                    onPointerLeave={special === 'winch' ? release : undefined}
                  >
                    {SPECIAL_LABEL[special]}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Result card: flat, centred, and only ever the server's numbers. */}
      {localDone || official || over ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-3">
          <div className="rr-panel max-h-full w-full max-w-md overflow-y-auto p-4">
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
                  <p className="font-mono text-5xl font-black leading-none text-safety">
                    P{place}
                    <span className="ml-2 text-base font-bold text-dim">of {snapshot.players.length}</span>
                  </p>
                  <p className={`text-right font-mono text-lg font-black ${me.finished ? 'text-ok' : 'text-bad'}`}>
                    {resultText(me, trackLengthM)}
                    <span className="block text-[11px] font-normal text-dim">{me.finished ? 'RACE TIME' : 'did not finish'}</span>
                  </p>
                </div>
              </>
            )}
            {closesInS !== null && !over ? (
              <p className="mt-3 rounded-md bg-safety px-2 py-1 text-center font-mono text-xs font-black text-slate-deep">RACE CLOSES IN {closesInS} s</p>
            ) : null}
            <div className="mt-3 max-h-[40vh] overflow-y-auto">
              <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} />
            </div>
            <p className="mt-3 text-center font-mono text-[11px] text-dim">
              {over ? 'Stay here: the host can start the next race.' : 'Race time is wall-clock from the start signal, the same on every screen.'}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
