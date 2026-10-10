import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveDecisionStarted, liveIsQuiet, QUIET_AFTER_LIVE_MS, waitForQuiet } from './liveTraffic';

// docs/QA.md Q31: a visitor's live decision comes before any background ghost run on the same server.
describe('live decisions come first', () => {
  beforeEach(() => vi.useFakeTimers({ now: 5_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('background work waits while a live decision is in flight and for 2 s after the last one', async () => {
    expect(liveIsQuiet()).toBe(true);
    const done = liveDecisionStarted();
    let released = false;
    const waiting = waitForQuiet().then(() => (released = true));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(released).toBe(false); // still in flight, however long it takes

    done();
    done(); // ending twice changes nothing
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_LIVE_MS - 300);
    expect(released).toBe(false);

    // Another decision inside the quiet window pushes the wait back.
    liveDecisionStarted()();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_LIVE_MS - 300);
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(500);
    await waiting;
    expect(released).toBe(true);
  });

  it('is never held for good: after a minute the background work goes on', async () => {
    liveDecisionStarted(); // a decision that never ends
    let released = false;
    void waitForQuiet().then(() => (released = true));
    await vi.advanceTimersByTimeAsync(61_000);
    expect(released).toBe(true);
  });
});
