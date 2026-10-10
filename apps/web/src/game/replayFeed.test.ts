import { MISSIONS, PRESETS, heuristicBrain, runController } from '@rivetrun/sim';
import type { GhostTrace, SimState } from '@rivetrun/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replayTrace } from './replayFeed';
import { createRunFeed } from './runFeed';

async function recorded(): Promise<GhostTrace> {
  const frames: SimState[] = [];
  const episode = await runController({ mission: MISSIONS.M1, seed: 1, build: PRESETS.all_rounder.build, priority: 0.5 }, heuristicBrain, {
    onEvent: (event) => {
      if (event.type === 'frame') frames.push(event.state);
    },
    timeScale: 300,
  }).start();
  return { policy: 'heuristic', frames, outcome: episode.outcome };
}

describe('replayTrace', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('moves the robot along the recording on its own clock and ends as the recording did', async () => {
    vi.useRealTimers();
    const trace = await recorded();
    vi.useFakeTimers();
    const last = trace.frames[trace.frames.length - 1]!;
    expect(last.x).toBeGreaterThan(5);
    const feed = createRunFeed();
    const stop = replayTrace(trace, feed);
    expect(feed.get().state?.x ?? 0).toBeLessThan(0.5);
    vi.advanceTimersByTime((last.t * 1000) / 2);
    const halfway = feed.get().state!.x;
    expect(halfway).toBeGreaterThan(1);
    expect(halfway).toBeLessThan(last.x);
    expect(feed.get().done).toBe(false);
    vi.advanceTimersByTime((last.t * 1000) / 2 + 200);
    expect(feed.get().state!.x).toBeCloseTo(last.x, 3);
    expect(feed.get().done).toBe(true);
    expect(feed.get().dnfReason === null).toBe(trace.outcome.finished);
    stop();
  });

  it('picks the run up where it is for a phone that joins late', async () => {
    vi.useRealTimers();
    const trace = await recorded();
    vi.useFakeTimers();
    const last = trace.frames[trace.frames.length - 1]!;
    const feed = createRunFeed();
    const stop = replayTrace(trace, feed, { elapsedMs: (last.t * 1000) / 2 });
    expect(feed.get().state!.x).toBeGreaterThan(1);
    stop();
  });

  it('waits on the line before the start signal', async () => {
    vi.useRealTimers();
    const trace = await recorded();
    vi.useFakeTimers();
    const feed = createRunFeed();
    const stop = replayTrace(trace, feed, { elapsedMs: -2000 });
    vi.advanceTimersByTime(1500);
    expect(feed.get().state!.x).toBeCloseTo(trace.frames[0]!.x, 3);
    expect(feed.get().done).toBe(false);
    stop();
  });
});
