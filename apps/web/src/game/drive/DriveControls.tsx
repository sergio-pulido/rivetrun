'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Build, ControlSpecial } from '@rivetrun/contracts';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { UI } from '../palette';
import { useRunView, type RunFeed } from '../runFeed';
import type { DriveInput, DriveInputState } from './driveInput';
import { haptic } from './haptics';

/** Uphill steeper than this: the action button offers the winch (or climb mode) instead of the jump. */
const STEEP_DEG = 6;
const RING_R = 38;
const RING_LENGTH = 2 * Math.PI * RING_R;

const NO_SELECT: CSSProperties = { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent' };

interface HoldHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** Press-and-hold with any number of fingers: held while at least one pointer is down on the element. */
function holdHandlers(set: (held: boolean) => void, onPress?: () => void): HoldHandlers {
  const pointers = new Set<number>();
  const up = (event: ReactPointerEvent<HTMLElement>): void => {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) set(false);
  };
  return {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.add(event.pointerId);
      set(true);
      onPress?.();
    },
    onPointerUp: up,
    onPointerCancel: up,
    onLostPointerCapture: up,
  };
}

/** Which special the one action button offers right now. JUMP and WINCH only exist with their parts. */
function contextualSpecial(build: Build, slopeDeg: number, winchHeld: boolean): ControlSpecial {
  const hasPiston = build.extras.includes('piston_jump');
  const hasWinch = build.extras.includes('winch');
  if (winchHeld) return 'winch';
  if (slopeDeg >= STEEP_DEG) return hasWinch ? 'winch' : 'climb';
  if (hasPiston) return 'jump';
  return 'climb';
}

const SPECIAL_LABEL: Readonly<Record<ControlSpecial, string>> = { jump: 'JUMP', winch: 'WINCH', climb: 'CLIMB' };

function Pad({ side, label, held, color }: { side: 'left' | 'right'; label: string; held: boolean; color: string }) {
  return (
    <div
      className="pointer-events-none absolute flex h-[84px] w-[112px] flex-col items-center justify-center gap-1 rounded-2xl font-display"
      style={{
        [side]: 14,
        bottom: 'max(18px, env(safe-area-inset-bottom))',
        background: held ? color : 'rgb(14 16 19 / 0.62)',
        border: `2px solid ${held ? color : 'rgb(237 239 242 / 0.28)'}`,
        color: held ? UI.ink : UI.text,
        transform: held ? 'scale(0.95)' : 'scale(1)',
        transition: 'transform 70ms ease-out, background 70ms ease-out',
        boxShadow: held ? `0 0 26px ${color}66` : '0 8px 20px rgb(0 0 0 / 0.35)',
      }}
    >
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {side === 'right' ? <path d="M4 4l7 7-7 7M14 4l7 7-7 7" /> : <path d="M6 4v14M13 4v14M20 4v14" />}
      </svg>
      <span className="text-[13px] font-bold leading-none tracking-[2px]">{label}</span>
    </div>
  );
}

export interface DriveControlsProps {
  /** The store the sim samples: `drive.read()` once per tick. */
  drive: DriveInput;
  /** The player's run: slope, airtime and the end of the run decide what the action button does. */
  feed: RunFeed;
  build: Build;
}

/**
 * Drive-mode touch controls: hold the right half to drive, the left half to brake, and one
 * contextual action button (JUMP / WINCH / CLIMB) with a cooldown ring. Arrow keys / A-D / Space
 * and W work on a laptop. Fills its parent; put it over the run canvas.
 */
export function DriveControls({ drive, feed, build }: DriveControlsProps) {
  const input = useSyncExternalStore<DriveInputState>(drive.subscribe, drive.peek, drive.peek);
  const view = useRunView(feed);
  const [tick, setTick] = useState(0);
  const [driven, setDriven] = useState(false);
  const done = view.done;
  const airborne = view.state?.airborne === true;
  const special = contextualSpecial(build, view.state?.slopeDeg ?? 0, input.winch);
  const cooldownMs = (PARTS_BY_ID.get('piston_jump')?.effects.cooldownS ?? 3) * 1000;
  const sinceJump = input.jumpAt > 0 ? performance.now() - input.jumpAt : Infinity;
  const cooling = special === 'jump' && sinceJump < cooldownMs;
  const ready = !done && !(special === 'jump' && (cooling || airborne));

  // The ring only needs frames while it is filling.
  useEffect(() => {
    if (!cooling) return undefined;
    const id = window.setInterval(() => setTick((n) => n + 1), 50);
    return () => window.clearInterval(id);
  }, [cooling, input.jumpAt]);
  void tick;

  useEffect(() => {
    if (input.throttle) setDriven(true);
  }, [input.throttle]);

  // Hands off when the run ends or the tab goes away: nothing stays "held".
  useEffect(() => {
    if (done) drive.release();
    const release = (): void => drive.release();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      drive.release();
    };
  }, [drive, done]);

  const press = useMemo(() => {
    const fire = (kind: ControlSpecial): void => {
      haptic(10);
      if (kind === 'jump') drive.jump();
      else if (kind === 'climb') drive.toggleClimb();
      else drive.setWinch(true);
    };
    return {
      throttle: holdHandlers(drive.setThrottle, () => haptic(6)),
      brake: holdHandlers(drive.setBrake, () => haptic(6)),
      fire,
    };
  }, [drive]);

  // Keyboard, for laptops: → / D / Space drive, ← / A brake, ↑ / W / J the action button.
  useEffect(() => {
    const key = (event: KeyboardEvent, down: boolean): void => {
      if (event.repeat || done) return;
      const code = event.code;
      if (code === 'ArrowRight' || code === 'KeyD' || code === 'Space') drive.setThrottle(down);
      else if (code === 'ArrowLeft' || code === 'KeyA') drive.setBrake(down);
      else if (code === 'ArrowUp' || code === 'KeyW' || code === 'KeyJ') {
        if (down && ready) press.fire(special);
        if (!down) drive.setWinch(false);
      } else return;
      event.preventDefault();
    };
    const down = (event: KeyboardEvent): void => key(event, true);
    const up = (event: KeyboardEvent): void => key(event, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [drive, done, ready, special, press]);

  const fraction = cooling ? sinceJump / cooldownMs : 1;
  const active = (special === 'climb' && input.climb) || (special === 'winch' && input.winch);
  const accent = active ? UI.safety : ready ? UI.text : UI.dim;

  return (
    <div className="absolute inset-0" style={NO_SELECT} onContextMenu={(event) => event.preventDefault()}>
      <div className="absolute inset-y-0 left-0 w-1/2" style={NO_SELECT} aria-label="Brake: hold the left half" role="button" {...press.brake} />
      <div className="absolute inset-y-0 right-0 w-1/2" style={NO_SELECT} aria-label="Drive: hold the right half" role="button" {...press.throttle} />

      {!done && (
        <>
          <Pad side="left" label="BRAKE" held={input.brake} color="#f8514a" />
          <Pad side="right" label="DRIVE" held={input.throttle} color={UI.safety} />

          <button
            type="button"
            disabled={!ready}
            aria-label={`${SPECIAL_LABEL[special]}${cooling ? ', re-arming' : ''}`}
            aria-pressed={active}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (ready) press.fire(special);
            }}
            onPointerUp={() => drive.setWinch(false)}
            onPointerCancel={() => drive.setWinch(false)}
            onPointerLeave={() => drive.setWinch(false)}
            className="absolute left-1/2 flex h-[88px] w-[88px] -translate-x-1/2 items-center justify-center rounded-full font-display"
            style={{
              ...NO_SELECT,
              bottom: 'max(16px, env(safe-area-inset-bottom))',
              background: active ? 'rgb(255 122 26 / 0.22)' : 'rgb(14 16 19 / 0.78)',
              color: accent,
              opacity: ready ? 1 : 0.75,
              boxShadow: '0 8px 22px rgb(0 0 0 / 0.4)',
            }}
          >
            <svg width="88" height="88" viewBox="0 0 88 88" className="absolute inset-0" aria-hidden>
              <circle cx="44" cy="44" r={RING_R} fill="none" stroke="rgb(237 239 242 / 0.18)" strokeWidth="5" />
              {/* Cooldown ring: fills clockwise from the top as the piston re-arms. */}
              <circle
                cx="44"
                cy="44"
                r={RING_R}
                fill="none"
                stroke={active ? UI.safety : cooling ? UI.safetyHi : UI.safety}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={RING_LENGTH * (1 - Math.min(1, fraction))}
                transform="rotate(-90 44 44)"
              />
            </svg>
            <span className="relative flex flex-col items-center gap-0.5">
              <span className="text-[15px] font-bold leading-none tracking-[1.5px]">{SPECIAL_LABEL[special]}</span>
              <span className="font-mono text-[9px] leading-none tracking-[1px]" style={{ color: UI.dim }}>
                {cooling ? `${((cooldownMs - sinceJump) / 1000).toFixed(1)} s` : special === 'climb' ? (input.climb ? 'ON' : 'OFF') : special === 'winch' ? 'HOLD' : airborne ? 'AIR' : 'READY'}
              </span>
            </span>
          </button>

          {!driven && (
            <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: 'calc(max(18px, env(safe-area-inset-bottom)) + 104px)' }}>
              <span className="rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[1.5px]" style={{ background: 'rgb(14 16 19 / 0.8)', border: `1px solid ${UI.line}`, color: UI.text }}>
                HOLD RIGHT TO DRIVE · LEFT TO BRAKE
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
