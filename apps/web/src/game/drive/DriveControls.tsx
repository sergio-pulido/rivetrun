'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Build, ControlSpecial } from '@rivetrun/contracts';
import { PARTS_BY_ID, deriveSpec, safeContactSpeedMps } from '@rivetrun/sim';
import { UI } from '../palette';
import { useRunView, type RunFeed } from '../runFeed';
import type { DriveInput, DriveInputState } from './driveInput';
import { haptic } from './haptics';
import { BRAKE_MARKS, THROTTLE_MARKS, brakeBand, hazardWarning, throttleBand } from './hazard';

/** Uphill steeper than this: the action button offers the winch (or climb mode) instead of the jump. */
const STEEP_DEG = 6;
const RING_R = 38;
const RING_LENGTH = 2 * Math.PI * RING_R;

const NO_SELECT: CSSProperties = { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent' };

/** Touch-down is this much throttle (or brake); sliding up adds, sliding down takes away. */
const TOUCH_START = 0.3;
/** Finger travel for the whole 0–100 % range, px. */
const TRAVEL_PX = 200;

interface Thumb {
  readonly id: number;
  /** Where the finger went down, in the overlay's own pixels. */
  readonly x: number;
  readonly y: number;
}

interface SlideHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * One half of the screen as a slider: the first finger down sets 30 %, sliding up goes to 100 %,
 * sliding down to 0 %, letting go is 0 %. A second finger on the same half is ignored.
 */
function useSlide(set: (value: number) => void): { thumb: Thumb | null; handlers: SlideHandlers } {
  const [thumb, setThumb] = useState<Thumb | null>(null);
  const active = useRef<{ id: number; clientY: number } | null>(null);
  const handlers = useMemo<SlideHandlers>(() => {
    const end = (event: ReactPointerEvent<HTMLElement>): void => {
      if (active.current?.id !== event.pointerId) return;
      active.current = null;
      setThumb(null);
      set(0);
    };
    return {
      onPointerDown: (event) => {
        if (active.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const frame = event.currentTarget.parentElement?.getBoundingClientRect();
        active.current = { id: event.pointerId, clientY: event.clientY };
        setThumb({ id: event.pointerId, x: event.clientX - (frame?.left ?? 0), y: event.clientY - (frame?.top ?? 0) });
        set(TOUCH_START);
        haptic(6);
      },
      onPointerMove: (event) => {
        const origin = active.current;
        if (!origin || origin.id !== event.pointerId) return;
        set(Math.min(1, Math.max(0, TOUCH_START + (origin.clientY - event.clientY) / TRAVEL_PX)));
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
    };
  }, [set]);
  return { thumb, handlers };
}

interface GaugeProps {
  thumb: Thumb;
  value: number;
  side: 'left' | 'right';
  color: string;
  band: string;
  marks: ReadonlyArray<{ readonly at: number; readonly label: string }>;
}

/** The gauge that appears beside the thumb: the whole range, the sim's bands, and where the thumb is on it. */
function Gauge({ thumb, value, side, color, band, marks }: GaugeProps) {
  // Beside the thumb, on the side towards the middle of the screen, so the hand does not cover it.
  const left = side === 'right' ? thumb.x - 74 : thumb.x + 60;
  const top = thumb.y - (1 - TOUCH_START) * TRAVEL_PX;
  return (
    <div className="pointer-events-none absolute" style={{ left, top, width: 14, height: TRAVEL_PX }}>
      <div className="absolute inset-0 overflow-hidden rounded-full" style={{ background: 'rgb(14 16 19 / 0.78)', border: '1px solid rgb(237 239 242 / 0.35)' }}>
        <div className="absolute inset-x-0 bottom-0" style={{ height: `${value * 100}%`, background: color }} />
      </div>
      {marks.map((mark) => (
        <div key={mark.label} className="absolute flex items-center gap-1" style={{ bottom: `calc(${mark.at * 100}% - 5px)`, [side === 'right' ? 'right' : 'left']: 18 }}>
          {side === 'left' && <span className="h-px w-2" style={{ background: 'rgb(237 239 242 / 0.6)' }} />}
          <span className="font-mono text-[8px] leading-[10px] tracking-[1px]" style={{ color: value >= mark.at ? UI.text : UI.dim }}>
            {mark.label}
          </span>
          {side === 'right' && <span className="h-px w-2" style={{ background: 'rgb(237 239 242 / 0.6)' }} />}
        </div>
      ))}
      <div
        className="absolute whitespace-nowrap rounded-md px-1.5 py-1 font-mono text-[11px] font-semibold leading-none tabular-nums"
        style={{ bottom: `calc(${value * 100}% - 10px)`, [side === 'right' ? 'left' : 'right']: 20, background: color, color: UI.ink }}
      >
        {Math.round(value * 100)} % {band}
      </div>
    </div>
  );
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

interface PadProps {
  side: 'left' | 'right';
  /** 0–1: how far the pedal is down. */
  value: number;
  color: string;
  /** Big line (with an optional unit) and small line. */
  title: string;
  unit?: string;
  caption: string;
  /** Text colour of the big line (the speedometer turns red above the safe speed). */
  tone?: string;
  /** Amber frame: the wheels are spinning. */
  alert?: boolean;
}

/** The resting pedals in the bottom corners. The right one is the speedometer; both fill with the pedal's value. */
function Pad({ side, value, color, title, unit, caption, tone, alert = false }: PadProps) {
  const down = value > 0;
  return (
    <div
      className="pointer-events-none absolute flex h-[84px] w-[112px] flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl font-display"
      style={{
        [side]: 14,
        bottom: 'max(18px, env(safe-area-inset-bottom))',
        background: 'rgb(14 16 19 / 0.62)',
        border: `2px solid ${alert ? UI.warn : down ? color : 'rgb(237 239 242 / 0.28)'}`,
        color: UI.text,
        boxShadow: down ? `0 0 26px ${color}55` : '0 8px 20px rgb(0 0 0 / 0.35)',
      }}
    >
      <div className="absolute inset-x-0 bottom-0" style={{ height: `${value * 100}%`, background: color, opacity: 0.55 }} />
      <span className="relative text-[24px] font-bold leading-none tabular-nums" style={{ color: tone ?? UI.text }}>
        {title}
        {unit && <span className="ml-1 font-mono text-[10px] font-semibold tracking-[1px]">{unit}</span>}
      </span>
      <span className="relative whitespace-nowrap font-mono text-[9px] font-semibold leading-none tracking-[1.5px]" style={{ color: alert ? UI.warn : UI.text }}>
        {caption}
      </span>
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
 * Drive-mode touch controls (gameplay v3): the right half of the screen is the throttle slider, the
 * left half the brake (touch = 30 %, slide up to 100 %, down to 0 %), with a gauge beside the thumb.
 * The right pedal is the speedometer: red above the safe speed of the hazard ahead, SLIP when the
 * wheels spin. One contextual action button (JUMP / WINCH / CLIMB) with a cooldown ring.
 * Keyboard: Up / W full throttle (Shift = 50 %), Down / S brake, Space / J the action button.
 * Fills its parent; put it over the run canvas.
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
  const ready = !done && !(special === 'jump' && !input.jumpHeld && (cooling || airborne));

  // The ring only needs frames while it is filling.
  useEffect(() => {
    if (!cooling) return undefined;
    const id = window.setInterval(() => setTick((n) => n + 1), 50);
    return () => window.clearInterval(id);
  }, [cooling, input.jumpAt]);
  void tick;

  useEffect(() => {
    if (input.throttle > 0) setDriven(true);
  }, [input.throttle]);

  const throttle = useSlide(drive.setThrottle);
  const brake = useSlide(drive.setBrake);
  const safeContactMps = useMemo(() => safeContactSpeedMps(deriveSpec(build)), [build]);
  const speed = view.state?.v ?? 0;
  const warning = hazardWarning(view.observation?.value ?? null, speed, safeContactMps);
  const slipping = view.state?.effects.includes('slip') === true && !airborne;

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
      // The piston charges while the button is held and fires when it is let go.
      if (kind === 'jump') drive.setJumpHeld(true);
      else if (kind === 'climb') drive.toggleClimb();
      else drive.setWinch(true);
    };
    const letGo = (): void => {
      drive.setWinch(false);
      drive.setJumpHeld(false);
    };
    return { fire, letGo };
  }, [drive]);

  // Keyboard, for laptops: Up / W (or → / D) full throttle, with Shift 50 %; Down / S (or ← / A) brake; Space / J the action button.
  useEffect(() => {
    const key = (event: KeyboardEvent, down: boolean): void => {
      if (event.repeat || done) return;
      const code = event.code;
      if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowRight' || code === 'KeyD') drive.setThrottle(down ? (event.shiftKey ? 0.5 : 1) : 0);
      else if (code === 'ArrowDown' || code === 'KeyS' || code === 'ArrowLeft' || code === 'KeyA') drive.setBrake(down);
      else if (code === 'Space' || code === 'KeyJ') {
        if (down && ready) press.fire(special);
        if (!down) press.letGo();
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

  // Charging: the sim reports how much of the impulse is in the piston (0.4 for a tap, 1 after a full second).
  const charging = special === 'jump' && input.jumpHeld;
  const charge = view.state?.jumpCharge ?? 0;
  const fraction = charging ? charge : cooling ? sinceJump / cooldownMs : 1;
  const active = (special === 'climb' && input.climb) || (special === 'winch' && input.winch) || charging;
  const accent = active ? UI.safety : ready ? UI.text : UI.dim;

  return (
    <div className="absolute inset-0" style={NO_SELECT} onContextMenu={(event) => event.preventDefault()}>
      <div className="absolute inset-y-0 left-0 w-1/2" style={NO_SELECT} aria-label="Brake: touch the left half and slide up for more" role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(input.brake * 100)} {...brake.handlers} />
      <div className="absolute inset-y-0 right-0 w-1/2" style={NO_SELECT} aria-label="Throttle: touch the right half and slide up for more" role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(input.throttle * 100)} {...throttle.handlers} />

      {!done && (
        <>
          {/* In the air the pedals are the attitude: throttle lifts the nose, brake drops it (gameplay v3 P2). */}
          <Pad side="left" value={input.brake} color={UI.bad} title={input.brake > 0 ? `${Math.round(input.brake * 100)} %` : airborne ? 'NOSE' : 'BRAKE'} caption={airborne ? 'NOSE DOWN' : input.brake > 0 ? `BRAKE ${brakeBand(input.brake)}` : 'SLIDE UP'} />
          <Pad
            side="right"
            value={input.throttle}
            color={UI.safety}
            title={Math.abs(speed).toFixed(1)}
            unit="m/s"
            caption={airborne ? 'NOSE UP' : slipping ? 'SLIP · EASE OFF' : input.throttle > 0 ? `${throttleBand(input.throttle)} ${Math.round(input.throttle * 100)} %` : 'COAST'}
            tone={warning?.over ? UI.bad : undefined}
            alert={slipping}
          />
          {brake.thumb && <Gauge thumb={brake.thumb} value={input.brake} side="left" color={UI.bad} band={brakeBand(input.brake)} marks={BRAKE_MARKS} />}
          {throttle.thumb && <Gauge thumb={throttle.thumb} value={input.throttle} side="right" color={UI.safety} band={throttleBand(input.throttle)} marks={THROTTLE_MARKS} />}

          <button
            type="button"
            disabled={!ready}
            aria-label={`${SPECIAL_LABEL[special]}${cooling ? ', re-arming' : ''}`}
            aria-pressed={active}
            onPointerDown={(event) => {
              event.stopPropagation();
              // Captured: the hold lasts until the finger lifts, even if it slides off the button or the label under it changes.
              event.currentTarget.setPointerCapture(event.pointerId);
              if (ready) press.fire(special);
            }}
            onPointerUp={press.letGo}
            onPointerCancel={press.letGo}
            onLostPointerCapture={press.letGo}
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
            {cooling ? (
              // Re-arming: the seconds left are the headline, so a jump spent on a log is felt before the gap.
              <span className="relative flex flex-col items-center gap-0.5">
                <span className="font-mono text-[24px] font-semibold leading-none tabular-nums" style={{ color: UI.safetyHi }}>
                  {((cooldownMs - sinceJump) / 1000).toFixed(1)}
                </span>
                <span className="font-mono text-[9px] leading-none tracking-[1px]" style={{ color: UI.dim }}>
                  s · JUMP
                </span>
              </span>
            ) : (
              <span className="relative flex flex-col items-center gap-0.5">
                <span className="text-[15px] font-bold leading-none tracking-[1.5px] tabular-nums">{charging ? `${Math.round(charge * 100)} %` : SPECIAL_LABEL[special]}</span>
                <span className="font-mono text-[9px] leading-none tracking-[1px]" style={{ color: UI.dim }}>
                  {special === 'climb' ? (input.climb ? 'ON' : 'OFF') : special === 'winch' ? 'HOLD' : charging ? 'LET GO' : airborne ? 'AIR' : 'HOLD'}
                </span>
              </span>
            )}
          </button>

          {!driven && (
            <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: 'calc(max(18px, env(safe-area-inset-bottom)) + 104px)' }}>
              <span className="rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[1.5px]" style={{ background: 'rgb(14 16 19 / 0.8)', border: `1px solid ${UI.line}`, color: UI.text }}>
                SLIDE UP: RIGHT DRIVES · LEFT BRAKES
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
