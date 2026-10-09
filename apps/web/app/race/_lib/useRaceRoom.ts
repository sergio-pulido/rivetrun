'use client';

import { useEffect, useState } from 'react';
import { RaceSnapshotSchema, type RaceSnapshot } from './protocol';

export interface RaceRoom {
  readonly snapshot: RaceSnapshot | null;
  readonly link: 'connecting' | 'live' | 'reconnecting' | 'missing';
  /** Add to Date.now() to get the server's clock. */
  readonly clockOffsetMs: number;
}

const INITIAL: RaceRoom = { snapshot: null, link: 'connecting', clockOffsetMs: 0 };

/** Subscribes to a room over Server-Sent Events. EventSource reconnects on its own. */
export function useRaceRoom(code: string): RaceRoom {
  const [room, setRoom] = useState<RaceRoom>(INITIAL);

  useEffect(() => {
    let closed = false;
    const source = new EventSource(`/api/race/${code}/events`);
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = RaceSnapshotSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;
      setRoom({ snapshot: parsed.data, link: 'live', clockOffsetMs: parsed.data.serverNow - Date.now() });
    };
    source.addEventListener('gone', () => {
      source.close();
      setRoom((previous) => ({ ...previous, link: 'missing' }));
    });
    source.onerror = () => {
      if (closed) return;
      setRoom((previous) => (previous.link === 'missing' ? previous : { ...previous, link: 'reconnecting' }));
      // A room that does not exist answers 404, which EventSource reports as a plain error.
      fetch(`/api/race/${code}`, { cache: 'no-store' })
        .then((response) => {
          if (response.status === 404 && !closed) {
            source.close();
            setRoom((previous) => ({ ...previous, link: 'missing' }));
          }
        })
        .catch(() => undefined);
    };
    return () => {
      closed = true;
      source.close();
    };
  }, [code]);

  return room;
}

/** Re-renders every `intervalMs` with the server's clock. */
export function useServerNow(clockOffsetMs: number, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);
  useEffect(() => {
    const tick = (): void => setNow(Date.now() + clockOffsetMs);
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [clockOffsetMs, intervalMs]);
  return now;
}

export async function postRaceAction(code: string, action: unknown): Promise<unknown> {
  const response = await fetch(`/api/race/${code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}
