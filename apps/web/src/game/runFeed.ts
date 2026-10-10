'use client';

import { useSyncExternalStore } from 'react';
import { DECISION_CHIPS, decisionChipText, type DecisionChip } from './hud/decisionChip';
import type {
  BrainDecision,
  BrainQuestion,
  Action,
  DamageCause,
  DecisionLog,
  DnfReason,
  Observation,
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
  /** Every applied decision of this run with the sim's log, oldest first: the brain's thread (telemetry console). */
  readonly log: readonly DecisionLog[];
  /**
   * What the robot's sensors report: per tick when the sim sends it (`live`), otherwise the Observation of
   * the last question. `control` is the player's pedals in Drive mode.
   */
  readonly observation: { readonly value: Observation; readonly t: number; readonly live: boolean; readonly control?: { readonly throttle: number; readonly brake: number; readonly action: Action } } | null;
  /** The decision log as chips, oldest first: the last few decisions, hints and blind hits (Brain v3). */
  readonly chips: readonly DecisionChip[];
  readonly lastDamage: {
    readonly cause: DamageCause;
    readonly amountPct: number;
    readonly at: number;
    /** What the sim says was hit: an obstacle (and whether it stopped the robot) or rough ground entered too fast. */
    readonly obstacle?: Obstacle;
    readonly blocked?: boolean;
    readonly roughEntry?: TerrainId;
  } | null;
  /** The last obstacle the robot ran into (other damage does not replace it): the HUD's blind-hit chip reads it. */
  readonly lastHit: { readonly t: number; readonly xM: number; readonly obstacle: Obstacle; readonly blind: boolean } | null;
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
  chips: [],
  log: [],
  observation: null,
  lastDamage: null,
  lastHit: null,
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

const withChip = (chips: readonly DecisionChip[], chip: DecisionChip): readonly DecisionChip[] => [...chips, chip].slice(-DECISION_CHIPS);

const MAX_LOG = 200;

/** Between per-tick samples, a question's Observation is the freshest thing known. A live sample is never replaced by it. */
function asked(view: RunView, question: BrainQuestion, t: number): RunView['observation'] {
  if (!question.observation || view.observation?.live) return view.observation;
  return { value: question.observation, t, live: false };
}

function reduce(view: RunView, event: RunEvent): RunView {
  switch (event.type) {
    case 'frame':
      return { ...view, state: event.state, stateAt: now() };
    case 'decisionPending':
      return { ...view, pending: { question: event.question, since: now() }, observation: asked(view, event.question, event.t) };
    case 'decision':
      return {
        ...view,
        pending: null,
        decision: { question: event.question, decision: event.decision, t: event.t, at: now() },
        decisionCount: view.decisionCount + 1,
        // A Drive-mode hint is not this robot's decision: it stays out of the thread.
        log: event.log && !event.advisory ? [...view.log, event.log].slice(-MAX_LOG) : view.log,
        observation: asked(view, event.question, event.t),
        chips: withChip(view.chips, {
          id: `d${view.decisionCount}`,
          t: event.t,
          text: decisionChipText(event.question, event.decision, event.log),
          // A hint in Drive mode is shown, not applied.
          tone: event.advisory ? 'hint' : event.decision.fallback ? 'fallback' : 'decision',
        }),
      };
    case 'damage':
      return {
        ...view,
        lastDamage: {
          cause: event.cause, amountPct: event.amountPct, at: now(),
          obstacle: event.obstacle, blocked: event.blocked, roughEntry: event.roughEntry,
        },
        lastHit: event.obstacle ? { t: event.t, xM: view.state?.x ?? 0, obstacle: event.obstacle, blind: event.blind === true } : view.lastHit,
        // "BLIND · hit rock at 22 m: no distance sensor": the sim's own words.
        chips: event.blind && event.label ? withChip(view.chips, { id: `b${event.t}`, t: event.t, text: event.label, tone: 'blind' }) : view.chips,
      };
    case 'finish':
      return { ...view, pending: null, outcome: event.outcome, done: true };
    case 'dnf':
      return { ...view, pending: null, outcome: event.outcome, dnfReason: event.reason, done: true };
    case 'landed':
      return { ...view, lastLanding: { impactMps: event.impactMps, airtimeS: event.airtimeS, damagePct: event.damagePct, at: now() } };
    case 'fell':
      return { ...view, lastFall: { falls: event.falls, respawnX: event.respawnX, at: now() } };
    case 'observation':
      return { ...view, observation: { value: event.observation, t: event.t, live: true, control: event.control } };
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
