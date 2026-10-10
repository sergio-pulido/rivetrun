import type { BrainDecision, BrainQuestion, DecisionLog, DecisionRecord } from '@rivetrun/contracts';
import { ACTION_LABEL, TERRAIN_LOOK } from '../palette';

export type DecisionChipTone = 'decision' | 'fallback' | 'hint' | 'blind';

/** One line of the decision log as the run HUD and the big screen show it. */
export interface DecisionChip {
  readonly id: string;
  /** Sim time, seconds: chips are ordered by it. */
  readonly t: number;
  readonly text: string;
  readonly tone: DecisionChipTone;
}

/** How many chips the HUD and the big screen show (docs/BRAIN_V3_SENSING.md). */
export const DECISION_CHIPS = 3;

/** What fired, for questions older than Brain v3 (no `cause`): built from what the brain perceived. */
function firedBy(question: BrainQuestion): string {
  const p = question.perceived;
  switch (question.trigger) {
    case 'start':
      return 'START';
    case 'obstacle':
      return typeof p.obstacleAheadM === 'number' ? `OBSTACLE · ${p.obstacleAheadM.toFixed(1)} m` : 'OBSTACLE';
    case 'terrain_ahead':
    case 'terrain_enter': {
      if (p.terrainAhead === 'unknown') return question.trigger === 'terrain_enter' ? 'NEW TERRAIN' : 'TERRAIN AHEAD';
      const name = TERRAIN_LOOK[p.terrainAhead].label.toLowerCase();
      return typeof p.terrainAheadDistanceM === 'number' && question.trigger === 'terrain_ahead' ? `TERRAIN · ${name} ${p.terrainAheadDistanceM.toFixed(0)} m` : `TERRAIN · ${name}`;
    }
    case 'slip':
      return typeof p.slipPct === 'number' ? `SLIP · ${Math.round(p.slipPct)} %` : 'SLIP';
    case 'damage':
      return 'IMPACT';
    case 'energy':
      return 'ENERGY';
    case 'actuator':
      return 'ACTUATOR';
    case 'interval':
      return 'CHECK-IN';
  }
}

/**
 * Chip text for one decision, e.g. "LIDAR · obstacle 11 m → ease (71 %) · 340 ms". The sim's decision
 * log carries it ready-made (Brain v3); a decision without a log gets the same shape from its question.
 */
export function decisionChipText(question: BrainQuestion, decision: BrainDecision, log?: DecisionLog): string {
  if (log) return log.chip;
  const probability = decision.probabilities[decision.selected];
  const share = probability === undefined ? '' : ` (${Math.round(probability * 100)} %)`;
  return `${question.cause?.label ?? firedBy(question)} → ${ACTION_LABEL[decision.selected].toLowerCase()}${share} · ${Math.round(decision.latencyMs)} ms`;
}

/**
 * A Drive-mode hint: what the fixed rules would do right now, and the reading that made them look.
 * Not "saw X → do Y": the choice weighs everything the robot knows (the hint "water in 6 m → climb mode"
 * was the rules gearing down for a rock on a descent), so the action comes first and the reading is
 * named as what was just seen. No probability and no latency: they mean nothing to a driver.
 */
export function hintChipText(question: BrainQuestion, decision: BrainDecision, log?: DecisionLog): string {
  const seen = log?.trigger.label ?? question.cause?.label ?? firedBy(question);
  return `rules would pick ${ACTION_LABEL[log?.choice ?? decision.selected].toUpperCase()} now · just seen: ${seen}`;
}

/** The last chips of a recorded run (a ghost, a Room Race seat) up to sim time `t`: the big screen reads these. */
export function chipsFromRecords(records: readonly DecisionRecord[], t = Infinity, count = DECISION_CHIPS): DecisionChip[] {
  const chips: DecisionChip[] = [];
  records.forEach((record, i) => {
    if (record.t > t) return;
    const share = record.probabilities[record.selected];
    const plain = `${(record.trigger ?? 'decision').replace('_', ' ').toUpperCase()} → ${ACTION_LABEL[record.selected].toLowerCase()}${share === undefined ? '' : ` (${Math.round(share * 100)} %)`} · ${Math.round(record.latencyMs)} ms`;
    chips.push({ id: `d${i}`, t: record.t, text: record.log?.chip ?? plain, tone: record.fallback ? 'fallback' : 'decision' });
  });
  return chips.slice(-count);
}
