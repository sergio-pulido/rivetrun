// The decision thread shown by the telemetry console: for each decision, what the brain was told and how it
// split its probability. Jev returns a choice with probabilities and nothing else, so an entry holds inputs
// and numbers only. Nothing here is, or may be presented as, the model's reasoning.
import type { Action, BrainDecision, BrainQuestion, DecisionLog, Perception, Policy } from '@rivetrun/contracts';

export interface ThreadEntry {
  /** Stable key: who decided and when. */
  readonly id: string;
  /** Whose decision this is, e.g. "JEV-1". */
  readonly who: string;
  /** Sim time the decision was requested, seconds. */
  readonly t: number;
  /** Why it was requested, e.g. "LIDAR · obstacle 11 m". */
  readonly trigger: string;
  /** Sensor lines the brain was given. */
  readonly knew: readonly string[];
  /** What it could not know. */
  readonly unknown: readonly string[];
  /** Options with the probability the brain returned for each, highest first. */
  readonly options: readonly { readonly action: Action; readonly probability: number }[];
  readonly choice: Action;
  /** Who actually answered: 'heuristic' with fallback = Jev did not answer in time. */
  readonly policy: Policy;
  readonly fallback: boolean;
  readonly latencyMs: number;
}

// Triggers of questions older than Brain v3, which carry no `cause`.
const LEGACY_TRIGGER: Readonly<Record<BrainQuestion['trigger'], string>> = {
  start: 'START',
  terrain_ahead: 'terrain change seen',
  terrain_enter: 'new terrain reached',
  obstacle: 'obstacle in range',
  slip: 'slip',
  damage: 'damage',
  interval: 'check-in',
  energy: 'energy',
  actuator: 'actuator',
};

const reading = <T>(value: T | 'unknown', known: (value: T) => string | null): string | null => (value === 'unknown' ? null : known(value));

/** Pre-v3 questions have no Observation: the same readings, as lines. */
function perceivedLines(perceived: Perception): { knew: string[]; unknown: string[] } {
  const lines = [
    perceived.terrainAhead !== 'unknown' && perceived.terrainAheadDistanceM !== 'unknown'
      ? `terrain: ${perceived.terrainAhead} ${perceived.terrainAheadDistanceM} m`
      : null,
    reading(perceived.obstacleAheadM, (m) => (m === null ? 'no obstacle in range' : `obstacle ${m} m`)),
    perceived.gapAheadM === undefined ? null : reading(perceived.gapAheadM, (m) => (m === null ? null : `gap ${m} m`)),
    reading(perceived.slipPct, (pct) => `slip ${Math.round(pct)} %`),
    reading(perceived.tiltDeg, (deg) => `tilt ${deg}°`),
    reading(perceived.depthAheadCm, (cm) => `depth ${cm} cm`),
  ];
  const missing = [
    perceived.terrainAhead === 'unknown' ? 'terrain ahead' : null,
    perceived.obstacleAheadM === 'unknown' ? 'obstacles' : null,
    perceived.slipPct === 'unknown' ? 'slip and tilt' : null,
    perceived.depthAheadCm === 'unknown' ? 'water depth' : null,
  ];
  return {
    knew: lines.flatMap((line) => (line ? [line] : [])),
    unknown: missing.flatMap((line) => (line ? [`${line}: no sensor`] : [])),
  };
}

const ranked = (options: readonly { action: Action; probability: number }[]) => [...options].sort((a, b) => b.probability - a.probability);

/** From the sim's own log entry (Brain v3). */
export function entryFromLog(who: string, log: DecisionLog): ThreadEntry {
  return {
    id: `${who}@${log.t}`,
    who,
    t: log.t,
    trigger: log.trigger.label,
    knew: log.knew,
    unknown: log.unknown,
    options: ranked(log.options.map(({ action, probability }) => ({ action, probability }))),
    choice: log.choice,
    policy: log.policy,
    fallback: log.fallback,
    latencyMs: log.latencyMs,
  };
}

/** From a decision event that carries no log yet: the question that was asked and the answer that came back. */
export function entryFromDecision(who: string, t: number, question: BrainQuestion, decision: BrainDecision): ThreadEntry {
  const lines = question.observation
    ? { knew: question.observation.lines, unknown: question.observation.unknown }
    : perceivedLines(question.perceived);
  return {
    id: `${who}@${t}`,
    who,
    t,
    trigger: question.cause?.label ?? LEGACY_TRIGGER[question.trigger],
    knew: lines.knew,
    unknown: lines.unknown,
    options: ranked(question.options.map((action) => ({ action, probability: decision.probabilities[action] ?? 0 }))),
    choice: decision.selected,
    policy: decision.policy,
    fallback: decision.fallback,
    latencyMs: decision.latencyMs,
  };
}
