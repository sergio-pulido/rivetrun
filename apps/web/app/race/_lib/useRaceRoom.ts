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
/** /screen polls fast enough to draw a race; a phone only needs its room's state once a second. */
export const SCREEN_POLL_MS = 250;
export const PHONE_POLL_MS = 1000;

/**
 * Should this page skip the event stream and poll from the start (RR-PLAN §6)?
 * Cloudflare Quick Tunnels do not deliver Server-Sent Events and allow 200 requests in flight: every phone opening an
 * EventSource first, waiting 3.5 s of silence and then polling four times a second is what fills that limit.
 * True on *.trycloudflare.com, with NEXT_PUBLIC_RACE_TRANSPORT=poll at build time, or with ?transport=poll in the URL.
 * A server started with RACE_TRANSPORT=poll refuses the stream (409), which switches the page to polling at once.
 */
export function pollOnly(hostname: string, search = '', configured: string | undefined = process.env.NEXT_PUBLIC_RACE_TRANSPORT): boolean {
  return hostname.endsWith('.trycloudflare.com') || configured === 'poll' || new URLSearchParams(search).get('transport') === 'poll';
}

/** Poll interval for the page: the big screen draws the race, a phone watches its own room. */
export const pollMsFor = (pathname: string): number => (pathname.startsWith('/screen') ? SCREEN_POLL_MS : PHONE_POLL_MS);

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
    const pollMs = pollMsFor(window.location.pathname);
    let source: EventSource | undefined;
    const startPolling = (): void => {
      if (poller !== undefined || closed) return;
      source?.close();
      poller = setInterval(() => void readOnce(), pollMs);
      void readOnce();
    };
    const markMissing = (): void => {
      if (poller !== undefined) clearInterval(poller);
      source?.close();
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

    // Through a quick tunnel, or when told to, there is no event stream at all: one request at a time per client.
    if (pollOnly(window.location.hostname, window.location.search)) {
      startPolling();
      return () => {
        closed = true;
        if (poller !== undefined) clearInterval(poller);
      };
    }

    source = new EventSource(`/api/race/${code}/events`);
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
      // The server refused the stream for good (RACE_TRANSPORT=poll answers 409): poll instead of waiting for silence.
      if (source?.readyState === EventSource.CLOSED) {
        startPolling();
        return;
      }
      setRoom((previous) => (previous.link === 'missing' ? previous : { ...previous, link: 'reconnecting' }));
      // A room that does not exist answers 404, which EventSource reports as a plain error.
      void readOnce();
    };

    const watchdog = setInterval(() => {
      if (poller !== undefined || Date.now() - lastMessageAt < STREAM_SILENCE_MS) return;
      startPolling();
    }, 500);

    return () => {
      closed = true;
      clearInterval(watchdog);
      if (poller !== undefined) clearInterval(poller);
      source?.close();
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
