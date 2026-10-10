'use client';

import { useEffect, useMemo } from 'react';
import type { GhostTrace } from '@rivetrun/contracts';
import { createRunFeed, type RunFeed } from './runFeed';

// A recorded run played as if it were live. RR-PLAN: a phone whose picked agent is served from a stored run has no
// local sim to draw, so its robot stood on the start line. The stored run's frames, pushed into a feed on the
// recording's own clock from the room's start signal, make the run view draw it like any other run.

/** How often the feed gets the recording's current frame. The scene eases between frames, as it does for a live sim. */
const STEP_MS = 33;

export interface ReplayOptions {
  /**
   * Milliseconds since the run began, when the replay starts. Positive for a phone that joined late (the replay
   * picks up there); negative before the start signal (the robot waits on the line until zero).
   */
  elapsedMs?: number;
}

/**
 * Plays `trace` into `feed`: the frame for the current moment on every step, then the recording's own ending
 * (finish, or the DNF and its reason). Returns a function that stops it. The feed is reset first.
 */
export function replayTrace(trace: GhostTrace, feed: RunFeed, { elapsedMs = 0 }: ReplayOptions = {}): () => void {
  const frames = trace.frames;
  const last = frames[frames.length - 1];
  feed.reset();
  if (!last) return () => undefined;
  const began = performance.now() - elapsedMs;
  let index = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const step = (): void => {
    const t = (performance.now() - began) / 1000;
    let next = index;
    while (next + 1 < frames.length && frames[next + 1]!.t <= t) next += 1;
    if (next !== index || t <= frames[0]!.t || index === 0) feed.push({ type: 'frame', state: frames[next]! });
    index = next;
    if (t < last.t) return;
    clearInterval(timer);
    const outcome = trace.outcome;
    feed.push(outcome.finished ? { type: 'finish', t: last.t, outcome } : { type: 'dnf', t: last.t, reason: outcome.dnfReason ?? 'timeout', outcome });
  };
  step();
  if (index < frames.length - 1 || (performance.now() - began) / 1000 < last.t) timer = setInterval(step, STEP_MS);
  return () => clearInterval(timer);
}

/**
 * A feed that plays `trace` from the moment the run began. `startAtMs` is that moment on the Date.now() clock (a
 * room's start signal, already corrected for the server's clock); null means not started, and the feed stays empty.
 * Hand the feed to `<RunCanvas feed={…} />`.
 */
export function useReplayFeed(trace: GhostTrace | null | undefined, startAtMs: number | null | undefined): RunFeed {
  const feed = useMemo(() => createRunFeed(), []);
  useEffect(() => {
    if (!trace || startAtMs === null || startAtMs === undefined) {
      feed.reset();
      return undefined;
    }
    return replayTrace(trace, feed, { elapsedMs: Date.now() - startAtMs });
  }, [trace, startAtMs, feed]);
  return feed;
}
