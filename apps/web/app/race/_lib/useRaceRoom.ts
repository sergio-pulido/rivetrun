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

/** How long the event stream may stay silent before the room switches to polling. The server sends at least every 2 s. */
const STREAM_SILENCE_MS = 3500;
const POLL_MS = 250;

/**
 * Subscribes to a room over Server-Sent Events (EventSource reconnects on its own).
 * Some proxies buffer event streams and never deliver them (Cloudflare quick tunnels do): when the stream
 * stays silent, the room falls back to polling the snapshot, which passes through anything.
 */
export function useRaceRoom(code: string, initial?: RaceSnapshot): RaceRoom {
  // `initial` is the snapshot the server rendered the page with; the clock offset comes with the first live one.
  const [room, setRoom] = useState<RaceRoom>(() => (initial ? { snapshot: initial, link: 'connecting', clockOffsetMs: 0 } : INITIAL));

  useEffect(() => {
    let closed = false;
    let poller: ReturnType<typeof setInterval> | undefined;
    let lastMessageAt = Date.now();
    // Polled answers can overtake each other on a slow link: a snapshot older than the one shown is dropped.
    let newestServerNow = 0;
    let polling = false;
    // The answer that travelled fastest gives the best estimate of the server's clock; slower ones only add delay.
    let offsetMs: number | null = null;

    const accept = (data: unknown): void => {
      const parsed = RaceSnapshotSchema.safeParse(data);
      if (!parsed.success || closed) return;
      lastMessageAt = Date.now();
      if (parsed.data.serverNow < newestServerNow) return;
      newestServerNow = parsed.data.serverNow;
      const measured = parsed.data.serverNow - Date.now();
      offsetMs = offsetMs === null ? measured : Math.max(offsetMs, measured);
      setRoom({ snapshot: parsed.data, link: 'live', clockOffsetMs: offsetMs });
    };
    const markMissing = (): void => {
      if (poller !== undefined) clearInterval(poller);
      source.close();
      setRoom((previous) => ({ ...previous, link: 'missing' }));
    };
    const readOnce = async (): Promise<void> => {
      if (polling) return; // one read at a time: a slow link must not pile requests up
      polling = true;
      try {
        const response = await fetch(`/api/race/${code}`, { cache: 'no-store' });
        if (closed) return;
        if (response.status === 404) markMissing();
        else if (response.ok) accept(await response.json());
      } catch {
        if (!closed) setRoom((previous) => (previous.link === 'missing' ? previous : { ...previous, link: 'reconnecting' }));
      } finally {
        polling = false;
      }
    };

    const source = new EventSource(`/api/race/${code}/events`);
    source.onmessage = (event: MessageEvent<string>) => {
      try {
        accept(JSON.parse(event.data));
      } catch {
        // A cut-off frame is not a snapshot: the next one replaces it.
      }
    };
    source.addEventListener('gone', markMissing);
    source.onerror = () => {
      if (closed || poller !== undefined) return;
      setRoom((previous) => (previous.link === 'missing' ? previous : { ...previous, link: 'reconnecting' }));
      // A room that does not exist answers 404, which EventSource reports as a plain error.
      void readOnce();
    };

    const watchdog = setInterval(() => {
      if (poller !== undefined || Date.now() - lastMessageAt < STREAM_SILENCE_MS) return;
      source.close();
      poller = setInterval(() => void readOnce(), POLL_MS);
      void readOnce();
    }, 500);

    return () => {
      closed = true;
      clearInterval(watchdog);
      if (poller !== undefined) clearInterval(poller);
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
