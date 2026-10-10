import type { ControlInput, ControlSpecial } from '@rivetrun/contracts';

/** What the controls overlay shows about itself. */
export interface DriveInputState {
  /** 0–1 (gameplay v3): how far the right thumb is up its slider. */
  readonly throttle: number;
  /** 0–1: the left thumb. */
  readonly brake: number;
  /** Climb mode is a toggle: on until tapped again. */
  readonly climb: boolean;
  /** Winch is held, like the pedals. */
  readonly winch: boolean;
  /** The jump button is held: the piston is charging and fires when it is let go (gameplay v3 P2). */
  readonly jumpHeld: boolean;
  /** performance.now() of the last jump (press, or release of a charge), for the cooldown ring. 0 = never. */
  readonly jumpAt: number;
}

/**
 * The player's hands, as a tiny store. The overlay (and the keyboard) write to it;
 * the sim reads it once per tick: `const input = drive.read()` at 20 Hz.
 */
export interface DriveInput {
  /**
   * One sample for the sim. `special` is:
   * - 'jump' in exactly one read after each press (it is consumed here),
   * - 'winch' for as long as the button is held,
   * - 'climb' for as long as climb mode is toggled on.
   */
  readonly read: () => ControlInput;
  /** Current state without consuming anything (UI, robot face). */
  readonly peek: () => DriveInputState;
  readonly subscribe: (listener: () => void) => () => void;
  /** 0–1. A boolean still works: true = 1. */
  readonly setThrottle: (value: number | boolean) => void;
  readonly setBrake: (value: number | boolean) => void;
  readonly setWinch: (held: boolean) => void;
  readonly toggleClimb: () => void;
  /** Fires at once at full power. */
  readonly jump: () => void;
  /** Hold to charge, let go to fire: 0.3–1.0 s of hold gives 40–100 % of the impulse (the sim does the counting). */
  readonly setJumpHeld: (held: boolean) => void;
  /** Lets go of everything held (pedals, winch, a charging jump): the page lost focus. Climb mode stays as it was. */
  readonly release: () => void;
  /** Back to rest, climb mode off and the jump re-armed: the run is over, the next one starts clean on the same store. */
  readonly reset: () => void;
}

const REST: DriveInputState = { throttle: 0, brake: 0, climb: false, winch: false, jumpHeld: false, jumpAt: 0 };

const level = (value: number | boolean): number => (typeof value === 'number' ? Math.min(1, Math.max(0, value)) : value ? 1 : 0);

export function createDriveInput(): DriveInput {
  let state = REST;
  let jumpQueued = false;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<DriveInputState>): void => {
    const next = { ...state, ...patch };
    const changed = (Object.keys(next) as Array<keyof DriveInputState>).some((key) => next[key] !== state[key]);
    if (!changed) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    read: () => {
      const special: ControlSpecial | undefined = jumpQueued ? 'jump' : state.winch ? 'winch' : state.climb ? 'climb' : undefined;
      jumpQueued = false;
      return { throttle: state.throttle, brake: state.brake, ...(special ? { special } : {}), ...(state.jumpHeld ? { jumpHeld: true } : {}) };
    },
    peek: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setThrottle: (value) => set({ throttle: level(value) }),
    setBrake: (value) => set({ brake: level(value) }),
    setWinch: (held) => set({ winch: held }),
    toggleClimb: () => set({ climb: !state.climb }),
    jump: () => {
      jumpQueued = true;
      set({ jumpAt: typeof performance === 'undefined' ? 0 : performance.now() });
    },
    setJumpHeld: (held) => {
      if (held) set({ jumpHeld: true });
      else if (state.jumpHeld) set({ jumpHeld: false, jumpAt: typeof performance === 'undefined' ? 0 : performance.now() });
    },
    reset: () => {
      jumpQueued = false;
      set(REST);
    },
    release: () => {
      jumpQueued = false;
      set({ throttle: 0, brake: 0, winch: false, jumpHeld: false });
    },
  };
}
