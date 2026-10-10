'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'rivetrun.telemetry';

let open: boolean | null = null;
const listeners = new Set<() => void>();

/** Storage can throw (private mode, blocked site data): the drawer then simply starts closed. */
function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'open';
  } catch {
    return false;
  }
}

const get = (): boolean => {
  if (open === null) open = typeof window === 'undefined' ? false : read();
  return open;
};

/** Whether the telemetry drawer is open on this device. Remembered across runs. */
export const telemetry = {
  get,
  set: (next: boolean): void => {
    if (next === get()) return;
    open = next;
    try {
      window.localStorage.setItem(KEY, next ? 'open' : 'closed');
    } catch {
      // Not remembered this time; the drawer still opens and closes.
    }
    listeners.forEach((listener) => listener());
  },
  toggle: (): void => telemetry.set(!get()),
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

const closedOnServer = (): boolean => false;

export function useTelemetryOpen(): boolean {
  return useSyncExternalStore(telemetry.subscribe, telemetry.get, closedOnServer);
}
