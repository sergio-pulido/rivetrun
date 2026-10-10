'use client';

import { useSyncExternalStore } from 'react';
import { mk2Requested, type Mk2Scope } from './flag';

// Which robot is really on screen, as a tiny store: the frame-rate badge and the `data-robot` attribute on the
// stage wrappers read it, so QA can tell the MK-II from the fallback without touching WebGL.

let robots = 0;
let fallbacks = 0;
let reason: string | null = null;
const listeners = new Set<() => void>();
const changed = (): void => listeners.forEach((listener) => listener());

export const mk2Live = {
  /** MK-II robots on screen. */
  get robots(): number {
    return robots;
  },
  /** Why the last robot fell back to the procedural model. */
  get reason(): string | null {
    return reason;
  },
  /** A robot drawn from the kit mounted (returns the unmount). */
  mount(): () => void {
    robots += 1;
    changed();
    return () => {
      robots -= 1;
      changed();
    };
  },
  /** A robot that should have been the MK-II is drawn procedurally (returns the unmount). */
  fallback(why: string): () => void {
    fallbacks += 1;
    reason = why;
    changed();
    return () => {
      fallbacks -= 1;
      changed();
    };
  },
  fail(why: string): void {
    reason = why;
    changed();
  },
};

export type RobotSignal = 'mk2' | 'procedural' | 'loading';

/** `mk2|`, `loading|` or `procedural|<reason>`: one string so the store's snapshot is stable. */
function snapshot(scope: Mk2Scope): string {
  if (!mk2Requested(scope)) return 'procedural|override: the procedural robot was asked for';
  if (robots > 0) return 'mk2|';
  if (fallbacks > 0) return `procedural|${reason ?? 'the kit did not load'}`;
  return 'loading|';
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Props for a stage wrapper: `data-robot="mk2" | "procedural" | "loading"` and, on the fallback,
 * `data-robot-reason`. Updated when the kit arrives. Works in production builds.
 */
export function useRobotSignal(scope: Mk2Scope): { 'data-robot': RobotSignal; 'data-robot-reason'?: string } {
  const value = useSyncExternalStore(subscribe, () => snapshot(scope), () => 'loading|');
  const [robot, why] = value.split('|') as [RobotSignal, string];
  return why ? { 'data-robot': robot, 'data-robot-reason': why } : { 'data-robot': robot };
}
