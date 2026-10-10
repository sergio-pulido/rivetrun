// Whether the Jev ghost for the next Drive run is ready on the server (GET /api/ghost…&status=1). The run only waits
// briefly for it and races the built-in driver otherwise, so the Brief says which it will be.

/** 'idle' = not asked (Jev mode, a blocked build, racing your own ghost); 'unknown' = asked, no usable answer. */
export type RivalStatus = 'idle' | 'computing' | 'ready' | 'unavailable' | 'unknown';

export function parseRivalStatus(body: unknown): RivalStatus {
  const status = typeof body === 'object' && body !== null ? (body as { readonly status?: unknown }).status : undefined;
  return status === 'ready' || status === 'computing' || status === 'unavailable' ? status : 'unknown';
}

/** A cold ghost takes up to about 17 s; well past that, a server still "computing" is asked less often. */
const FAST_POLLS = 45;

/**
 * When to ask again: every second while it computes (every five once that has gone on far longer than a ghost takes),
 * rarely when Jev could not drive (the server retries on its own), never once ready. `asked` = answers received so far.
 */
export function nextPollMs(status: RivalStatus, asked = 0): number | null {
  if (status === 'ready' || status === 'idle') return null;
  if (status === 'computing') return asked < FAST_POLLS ? 1000 : 5000;
  return status === 'unavailable' ? 20_000 : 6000;
}

export interface RivalLine {
  readonly tone: 'ok' | 'wait' | 'warn';
  readonly text: string;
}

export function rivalStatusLine(status: RivalStatus): RivalLine | null {
  if (status === 'ready') return { tone: 'ok', text: 'Jev is ready to race you.' };
  if (status === 'computing') return { tone: 'wait', text: 'Jev is getting ready… Start now and you race the built-in driver instead.' };
  if (status === 'unavailable') return { tone: 'warn', text: 'Jev could not drive this one: you will race the built-in driver.' };
  return null;
}
