'use client';

import { useSyncExternalStore } from 'react';
import type {
  BrainDecision,
  BrainQuestion,
  DamageCause,
  DnfReason,
  Obstacle,
  Outcome,
  RunEvent,
  SimState,
  TerrainId,
} from '@rivetrun/contracts';

/** Everything the renderer and the HUD know about the run, reduced from RunEvents. */
export interface RunView {
  readonly state: SimState | null;
  /** performance.now() when `state` arrived: the scene extrapolates from it. */
  readonly stateAt: number;
  readonly pending: { readonly question: BrainQuestion; readonly since: number } | null;
  readonly decision: {
    readonly question: BrainQuestion;
    readonly decision: BrainDecision;
    readonly t: number;
    readonly at: number;
  } | null;
  readonly decisionCount: number;
  readonly lastDamage: {
    readonly cause: DamageCause;
    readonly amountPct: number;
    readonly at: number;
    /** What the sim says was hit: an obstacle (and whether it stopped the robot) or rough ground entered too fast. */
    readonly obstacle?: Obstacle;
    readonly blocked?: boolean;
    readonly roughEntry?: TerrainId;
  } | null;
  /** Last touchdown after airtime (gameplay v2): drives landing dust, shake and haptics. */
  readonly lastLanding: { readonly impactMps: number; readonly airtimeS: number; readonly damagePct: number; readonly at: number } | null;
  /** Last fall into a gap: the robot respawns at `respawnX`. */
  readonly lastFall: { readonly falls: number; readonly respawnX: number; readonly at: number } | null;
  readonly outcome: Outcome | null;
  readonly dnfReason: DnfReason | null;
  readonly done: boolean;
}

const EMPTY: RunView = {
  state: null,
  stateAt: 0,
  pending: null,
  decision: null,
  decisionCount: 0,
  lastDamage: null,
  lastLanding: null,
  lastFall: null,
  outcome: null,
  dnfReason: null,
  done: false,
};

export interface RunFeed {
  /** Pass straight to the sim: `runController(config, brain, { onEvent: feed.push })`. */
  readonly push: (event: RunEvent) => void;
  readonly reset: () => void;
  readonly get: () => RunView;
  readonly subscribe: (listener: () => void) => () => void;
}

const now = (): number => (typeof performance === 'undefined' ? 0 : performance.now());

function reduce(view: RunView, event: RunEvent): RunView {
  switch (event.type) {
    case 'frame':
      return { ...view, state: event.state, stateAt: now() };
    case 'decisionPending':
      return { ...view, pending: { question: event.question, since: now() } };
    case 'decision':
      return {
        ...view,
        pending: null,
        decision: { question: event.question, decision: event.decision, t: event.t, at: now() },
        decisionCount: view.decisionCount + 1,
      };
    case 'damage':
      return {
        ...view,
        lastDamage: { cause: event.cause, amountPct: event.amountPct, at: now(), obstacle: event.obstacle, blocked: event.blocked, roughEntry: event.roughEntry },
      };
    case 'finish':
      return { ...view, pending: null, outcome: event.outcome, done: true };
    case 'dnf':
      return { ...view, pending: null, outcome: event.outcome, dnfReason: event.reason, done: true };
    case 'landed':
      return { ...view, lastLanding: { impactMps: event.impactMps, airtimeS: event.airtimeS, damagePct: event.damagePct, at: now() } };
    case 'fell':
      return { ...view, lastFall: { falls: event.falls, respawnX: event.respawnX, at: now() } };
    // Height while airborne comes with every frame (SimState.heightM): nothing to keep from these.
    case 'terrainEnter':
    case 'airborne':
      return view;
  }
}

/** A tiny external store. The scene reads it every frame; the HUD subscribes. */
export function createRunFeed(): RunFeed {
  let view = EMPTY;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    push: (event) => {
      const next = reduce(view, event);
      if (next === view) return;
      view = next;
      notify();
    },
    reset: () => {
      view = EMPTY;
      notify();
    },
    get: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const getEmpty = (): RunView => EMPTY;

export function useRunView(feed: RunFeed): RunView {
  return useSyncExternalStore(feed.subscribe, feed.get, getEmpty);
}
