'use client';

import { useSyncExternalStore } from 'react';

/** What the viewer chose for the Brain panel: nothing yet (each place has its own default), open, or closed. */
export type BrainChoice = 'auto' | 'open' | 'closed';

let choice: BrainChoice = 'auto';
const listeners = new Set<() => void>();

/**
 * Whether the Brain panel is expanded. Not remembered across page loads: on a phone it starts as one line under the
 * track, inside the telemetry panel it starts expanded.
 */
export const brainPanel = {
  get: (): BrainChoice => choice,
  set: (open: boolean): void => {
    const next: BrainChoice = open ? 'open' : 'closed';
    if (next === choice) return;
    choice = next;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

const onServer = (): BrainChoice => 'auto';

export function useBrainChoice(): BrainChoice {
  return useSyncExternalStore(brainPanel.subscribe, brainPanel.get, onServer);
}

/** The panel is open if the viewer opened it, or has not chosen and this place opens it by default. */
export const brainIsOpen = (chosen: BrainChoice, byDefault: boolean): boolean => (chosen === 'auto' ? byDefault : chosen === 'open');
