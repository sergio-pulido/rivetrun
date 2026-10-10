import { createJevBrain } from '@rivetrun/brain';
import type { Build, GhostTrace, MissionId } from '@rivetrun/contracts';
import { MISSIONS, runHeadless } from '@rivetrun/sim';
import { CACHE_VERSION } from './version';

// Jev ghosts for Drive mode: the server drives the same mission, seed, build and briefing once with Jev and
// every phone that asks for that combination gets the same recorded run. In memory, like everything else.
export interface GhostRequest {
  readonly missionId: MissionId;
  readonly seed: number;
  readonly build: Build;
  readonly priority: number;
  readonly briefing?: string;
}

export interface GhostBody {
  readonly ghost: GhostTrace;
  /** Decisions in the run, and how many of them the heuristic made because Jev failed or was slow. */
  readonly decisions: number;
  readonly fallbacks: number;
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

interface GhostState {
  readonly entries: Map<string, Entry>;
  readonly queue: (() => void)[];
  active: number;
}
const holder = globalThis as typeof globalThis & { __rivetrunGhosts?: GhostState };
const state: GhostState = (holder.__rivetrunGhosts ??= { entries: new Map(), queue: [], active: 0 });
const jev = createJevBrain();

/** Same parts in a different order are the same robot. */
const keyOf = (request: GhostRequest): string =>
  JSON.stringify([
    CACHE_VERSION,
    request.missionId,
    request.seed,
    { ...request.build, sensors: [...request.build.sensors].sort(), extras: [...request.build.extras].sort() },
    request.priority,
    request.briefing ?? '',
  ]);

function remember(key: string, entry: Entry): void {
  if (!state.entries.has(key) && state.entries.size >= MAX_ENTRIES) {
    const oldest = [...state.entries].find(([, value]) => value.state !== 'pending')?.[0];
    if (oldest !== undefined) state.entries.delete(oldest);
  }
  state.entries.set(key, entry);
}

async function compute(key: string, request: GhostRequest): Promise<void> {
  if (state.active >= MAX_CONCURRENT) await new Promise<void>((resolve) => state.queue.push(resolve));
  state.active += 1;
  try {
    const { episode, ghost } = await runHeadless(MISSIONS[request.missionId], request.seed, request.build, jev, {
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
      remember(key, { state: 'ready', body: { ghost, decisions, fallbacks } });
    }
  } catch (error) {
    console.error('[ghost] run failed', error);
    remember(key, { state: 'failed', at: Date.now(), reason: 'the ghost run failed' });
  } finally {
    state.active -= 1;
    state.queue.shift()?.();
  }
}

/** The ghost if it is ready; otherwise starts computing it (once) and says so. */
export function requestGhost(request: GhostRequest): GhostAnswer {
  const key = keyOf(request);
  const entry = state.entries.get(key);
  if (entry?.state === 'ready') return { status: 'ready', body: entry.body };
  if (entry?.state === 'pending') return { status: 'pending' };
  if (entry?.state === 'failed' && Date.now() - entry.at < RETRY_AFTER_FAILURE_MS) return { status: 'unavailable', reason: entry.reason };
  if (!process.env.JEV_API_KEY) return { status: 'unavailable', reason: 'JEV_API_KEY is not set' };
  remember(key, { state: 'pending', since: Date.now() });
  void compute(key, request);
  return { status: 'pending' };
}

export const ghostStats = (): { ready: number; pending: number } => {
  const entries = [...state.entries.values()];
  return { ready: entries.filter((e) => e.state === 'ready').length, pending: entries.filter((e) => e.state === 'pending').length };
};
