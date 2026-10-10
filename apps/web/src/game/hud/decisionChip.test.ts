import { describe, expect, it } from 'vitest';
import type { BrainDecision, BrainQuestion, DecisionLog } from '@rivetrun/contracts';
import { decisionChipText, hintChipText } from './decisionChip';

const question = { trigger: 'terrain_ahead', perceived: { terrainAhead: 'water', terrainAheadDistanceM: 5.98 } } as unknown as BrainQuestion;
const decision = { selected: 'climb_mode', probabilities: { climb_mode: 0.29 }, latencyMs: 0 } as unknown as BrainDecision;
const log = { trigger: { label: 'CAMERA · water in 5.98 m' }, choice: 'climb_mode', chip: 'CAMERA · water in 5.98 m → climb mode (29 %) · 0 ms' } as unknown as DecisionLog;

describe('chip text', () => {
  it("a decision shows the sim's own chip", () => {
    expect(decisionChipText(question, decision, log)).toBe(log.chip);
  });

  it('a hint leads with the action and names the reading as what was just seen, with no arrow, % or ms', () => {
    const text = hintChipText(question, decision, log);
    expect(text).toBe('rules would pick CLIMB MODE now · just seen: CAMERA · water in 5.98 m');
    expect(text).not.toMatch(/→|%| ms/);
  });

  it('a hint without a log still reads from the question', () => {
    expect(hintChipText(question, decision)).toBe('rules would pick CLIMB MODE now · just seen: TERRAIN · water 6 m');
  });
});
