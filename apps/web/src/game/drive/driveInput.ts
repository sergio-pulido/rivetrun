import type { ControlInput, ControlSpecial } from '@rivetrun/contracts';

/** What the controls overlay shows about itself. */
export interface DriveInputState {
  readonly throttle: boolean;
  readonly brake: boolean;
  /** Climb mode is a toggle: on until tapped again. */
  readonly climb: boolean;
  /** Winch is held, like the pedals. */
  readonly winch: boolean;
  /** performance.now() of the last jump press, for the cooldown ring. 0 = never. */
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
  readonly setThrottle: (held: boolean) => void;
  readonly setBrake: (held: boolean) => void;
  readonly setWinch: (held: boolean) => void;
  readonly toggleClimb: () => void;
  readonly jump: () => void;
  /** Releases everything: call when the run ends or the page loses focus. */
  readonly release: () => void;
}

const REST: DriveInputState = { throttle: false, brake: false, climb: false, winch: false, jumpAt: 0 };

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
      return { throttle: state.throttle, brake: state.brake, ...(special ? { special } : {}) };
    },
    peek: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setThrottle: (held) => set({ throttle: held }),
    setBrake: (held) => set({ brake: held }),
    setWinch: (held) => set({ winch: held }),
    toggleClimb: () => set({ climb: !state.climb }),
    jump: () => {
      jumpQueued = true;
      set({ jumpAt: typeof performance === 'undefined' ? 0 : performance.now() });
    },
    release: () => {
      jumpQueued = false;
      set({ throttle: false, brake: false, winch: false });
    },
  };
}
