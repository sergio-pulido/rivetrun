// Live decisions come first (docs/QA.md Q31). A visitor's run asks Jev through /api/decide and falls back to the
// fixed rules after 1200 ms. Background work on this server (warming Jev ghosts) drives whole missions in the same
// process: its sim steps and its own Jev calls compete with those answers. So background work asks here before
// each of its steps and waits while a live decision is in flight or one was answered a moment ago.
interface LiveTraffic {
  inFlight: number;
  lastAt: number;
}
const holder = globalThis as typeof globalThis & { __rivetrunLiveTraffic?: LiveTraffic };
const traffic: LiveTraffic = (holder.__rivetrunLiveTraffic ??= { inFlight: 0, lastAt: 0 });

/** How long after the last live decision the server still counts as busy: a run decides every second or so. */
export const QUIET_AFTER_LIVE_MS = 2000;
const POLL_MS = 100;
/** Background work is never held longer than this in one wait, so a busy room cannot starve it for good. */
const MAX_WAIT_MS = 60_000;

/** Wrap a live decision: `const done = liveDecisionStarted(); try { … } finally { done(); }` */
export function liveDecisionStarted(): () => void {
  traffic.inFlight += 1;
  traffic.lastAt = Date.now();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    traffic.inFlight = Math.max(0, traffic.inFlight - 1);
    traffic.lastAt = Date.now();
  };
}

export const liveIsQuiet = (now: number = Date.now()): boolean => traffic.inFlight === 0 && now - traffic.lastAt >= QUIET_AFTER_LIVE_MS;

/** Resolves once no live decision is in flight and none ended within QUIET_AFTER_LIVE_MS (or after MAX_WAIT_MS). */
export async function waitForQuiet(): Promise<void> {
  const started = Date.now();
  while (!liveIsQuiet() && Date.now() - started < MAX_WAIT_MS) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
