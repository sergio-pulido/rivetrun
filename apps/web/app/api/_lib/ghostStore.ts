import { createJevBrain } from '@rivetrun/brain';
import type { Build, GhostTrace, MissionId } from '@rivetrun/contracts';
import { driveSeed, MISSION_IDS, MISSIONS, runHeadless } from '@rivetrun/sim';
import { faultedJev, type JevFault } from './jevFault';
import { CACHE_VERSION } from './version';

// Jev ghosts for Drive mode: the server drives the same mission, seed, build and briefing once with Jev and
// every phone that asks for that combination gets the same recorded run. In memory, like everything else.
export interface GhostRequest {
  readonly missionId: MissionId;
  readonly seed: number;
  readonly build: Build;
  readonly priority: number;
  readonly briefing?: string;
  /** Test switch (jevFault.ts): drive this ghost with a Jev that fails or never answers in time. */
  readonly fault?: JevFault;
}

export interface GhostBody {
  readonly ghost: GhostTrace;
  /** Decisions in the run, and how many of them the heuristic made because Jev failed or was slow. */
  readonly decisions: number;
  readonly fallbacks: number;
  /** Median response time of the decisions Jev itself answered, ms. Absent when it answered none. */
  readonly medianLatencyMs?: number;
}

type Entry =
  | { readonly state: 'pending'; readonly since: number }
  | { readonly state: 'ready'; readonly body: GhostBody }
  | { readonly state: 'failed'; readonly at: number; readonly reason: string };

export type GhostAnswer = { status: 'ready'; body: GhostBody } | { status: 'pending' } | { status: 'unavailable'; reason: string };

const MAX_ENTRIES = 300;
/** Jev runs in flight at once: each is one call at a time, so this is also the peak Jev request concurrency from ghosts. */
const MAX_CONCURRENT = 4;
const RETRY_AFTER_FAILURE_MS = 30_000;

interface Waiting {
  readonly key: string;
  readonly start: () => void;
  /** Warm-up work nobody has asked for yet: runs only in spare capacity and gives way to requested ghosts. */
  low: boolean;
}

interface GhostState {
  readonly entries: Map<string, Entry>;
  readonly waiting: Waiting[];
  active: number;
}
// V2: the queue holds named entries with a priority (a dev server keeps the old object across hot reloads).
const holder = globalThis as typeof globalThis & { __rivetrunGhostsV2?: GhostState };
const state: GhostState = (holder.__rivetrunGhostsV2 ??= { entries: new Map(), waiting: [], active: 0 });
/** Warm-up runs in flight at once; the rest of MAX_CONCURRENT stays free for ghosts a player is waiting for. */
const MAX_WARMING = 2;
/** Warm-up runs waiting at once: beyond this, new warm-ups are skipped rather than queued. */
const MAX_WARM_QUEUE = 18;
/** Requested ghosts waiting at once; beyond this a request is turned away instead of queued. */
const MAX_REQUEST_QUEUE = 24;

/** Starts whatever may run now: requested ghosts first, warm-ups only while few runs are active. */
function pump(): void {
  for (;;) {
    const index = state.active < MAX_CONCURRENT ? state.waiting.findIndex((item) => !item.low) : -1;
    const pick = index >= 0 ? index : state.active < MAX_WARMING ? state.waiting.findIndex((item) => item.low) : -1;
    if (pick < 0) return;
    const [next] = state.waiting.splice(pick, 1);
    state.active += 1;
    next!.start();
  }
}

const jev = createJevBrain();

/** Same parts in a different order are the same robot. */
const keyOf = (request: GhostRequest): string =>
  JSON.stringify([
    CACHE_VERSION,
    // Bumped when the shape of a stored trace changes: v2 = log entries carry the trigger's stable eventId.
    'trace-v2',
    request.missionId,
    request.seed,
    { ...request.build, sensors: [...request.build.sensors].sort(), extras: [...request.build.extras].sort() },
    request.priority,
    request.briefing ?? '',
    request.fault ?? '',
  ]);

function remember(key: string, entry: Entry): void {
  if (!state.entries.has(key) && state.entries.size >= MAX_ENTRIES) {
    const oldest = [...state.entries].find(([, value]) => value.state !== 'pending')?.[0];
    if (oldest !== undefined) state.entries.delete(oldest);
  }
  state.entries.set(key, entry);
}

async function compute(key: string, request: GhostRequest, low = false): Promise<void> {
  await new Promise<void>((start) => {
    state.waiting.push({ key, start, low });
    pump();
  });
  try {
    const { episode, ghost } = await runHeadless(MISSIONS[request.missionId], request.seed, request.build, request.fault ? faultedJev(request.fault) : jev, {
      priority: request.priority,
      policy: 'jev',
      briefing: request.briefing,
    });
    const decisions = episode.decisions.length;
    const fallbacks = episode.decisions.filter((decision) => decision.fallback).length;
    // A run Jev never answered is the heuristic's run: it must not be served under Jev's name.
    if (decisions > 0 && fallbacks === decisions) {
      remember(key, { state: 'failed', at: Date.now(), reason: 'Jev answered none of the decisions' });
    } else {
      // The telemetry console replays this thread against the ghost's clock. Only entries the sim logged are
      // passed on: nothing is reconstructed here, and Jev's answer is a choice with probabilities, never text.
      const log = episode.decisions.flatMap((decision) => (decision.log ? [decision.log] : []));
      // The reaction duel on the Result compares the player's reaction time with this.
      const answered = episode.decisions.filter((decision) => !decision.fallback).map((decision) => decision.latencyMs).sort((a, b) => a - b);
      const mid = Math.floor(answered.length / 2);
      const medianLatencyMs = answered.length === 0 ? undefined : answered.length % 2 === 1 ? answered[mid]! : Math.round((answered[mid - 1]! + answered[mid]!) / 2);
      remember(key, { state: 'ready', body: { ghost: { ...ghost, log }, decisions, fallbacks, ...(medianLatencyMs === undefined ? {} : { medianLatencyMs }) } });
    }
  } catch (error) {
    console.error('[ghost] run failed', error);
    remember(key, { state: 'failed', at: Date.now(), reason: 'the ghost run failed' });
  } finally {
    state.active -= 1;
    pump();
  }
}

/** The mission the Room Challenge is played on: warmed with whatever a visitor opens first. */
const ROOM_MISSION: MissionId = 'M5';
const DEFAULT_PRIORITY = 0.5;

/**
 * A ghost takes 4 to 17 s to drive (docs/QA.md Q17), so the two a visitor is most likely to want next are started
 * ahead: the mission after the one asked for, and the Room Challenge. Only for the default priority with no
 * briefing, because the Jev quota is shared by every phone in the room; everything else waits for its own Brief.
 */
function warmSiblings(request: GhostRequest): void {
  if (request.fault || request.briefing || request.priority !== DEFAULT_PRIORITY) return;
  if (request.seed !== driveSeed(MISSIONS[request.missionId])) return;
  const next = MISSION_IDS[MISSION_IDS.indexOf(request.missionId) + 1];
  for (const missionId of new Set([next, ROOM_MISSION])) {
    if (missionId === undefined || missionId === request.missionId) continue;
    if (state.waiting.filter((item) => item.low).length >= MAX_WARM_QUEUE) return;
    const sibling: GhostRequest = { ...request, missionId, seed: driveSeed(MISSIONS[missionId]) };
    const key = keyOf(sibling);
    if (state.entries.has(key)) continue;
    remember(key, { state: 'pending', since: Date.now() });
    void compute(key, sibling, true);
  }
}

/** The ghost if it is ready; otherwise starts computing it (once) and says so. */
export function requestGhost(request: GhostRequest): GhostAnswer {
  const key = keyOf(request);
  const entry = state.entries.get(key);
  if (entry?.state === 'ready') return { status: 'ready', body: entry.body };
  if (entry?.state === 'pending') {
    // Somebody wants it now: a warm-up still waiting its turn moves up.
    const waiting = state.waiting.find((item) => item.key === key);
    if (waiting?.low) {
      waiting.low = false;
      pump();
    }
    return { status: 'pending' };
  }
  if (entry?.state === 'failed' && Date.now() - entry.at < RETRY_AFTER_FAILURE_MS) return { status: 'unavailable', reason: entry.reason };
  if (!request.fault && !process.env.JEV_API_KEY) return { status: 'unavailable', reason: 'JEV_API_KEY is not set' };
  // Each new ghost is a full run of Jev calls: when this many are already waiting, the phone races the fixed rules.
  if (state.waiting.filter((item) => !item.low).length >= MAX_REQUEST_QUEUE) return { status: 'unavailable', reason: 'too many ghosts are being prepared' };
  remember(key, { state: 'pending', since: Date.now() });
  void compute(key, request);
  warmSiblings(request);
  return { status: 'pending' };
}

export const ghostStats = (): { ready: number; pending: number } => {
  const entries = [...state.entries.values()];
  return { ready: entries.filter((e) => e.state === 'ready').length, pending: entries.filter((e) => e.state === 'pending').length };
};
