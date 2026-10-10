import type { BrainQuestion } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { buildJevRequest } from '../index';
import { arenaPromptHash, buildArenaPrompt, parseArenaAnswer } from './prompt';

const question: BrainQuestion = {
  missionId: 'M1',
  t: 3,
  trigger: 'obstacle',
  perceived: { terrainAhead: 'mud', terrainAheadDistanceM: 2.4, obstacleAheadM: 1.2, slipPct: 'unknown', tiltDeg: 'unknown', depthAheadCm: 'unknown' },
  status: { speedMps: 1.4, batteryPct: 71, damagePct: 8 },
  priority: 0.5,
  options: ['cruise', 'slow_down', 'brake'],
  lookahead: [
    { action: 'cruise', progressM: 2.1, damagePct: 4, energyPct: 0.4 },
    { action: 'slow_down', progressM: 1.2, damagePct: 0, energyPct: 0.3 },
    { action: 'brake', progressM: 0.2, damagePct: 0, energyPct: 0.1 },
  ],
};

describe('arena prompt', () => {
  it('gives an LLM exactly what Jev is given: the same instructions and option descriptions', () => {
    const jev = buildJevRequest(question).questions.action;
    const prompt = buildArenaPrompt(question);
    expect(prompt.user).toContain(jev.instructions);
    for (const action of question.options) expect(prompt.user).toContain(`- ${action}: ${jev.criteria[action]}`);
    expect(prompt.system).toContain('{"choice"');
  });

  it('reads the answer, with or without a code fence, and clamps the confidence', () => {
    expect(parseArenaAnswer('{"choice": "slow_down", "confidence": 0.8}', question.options)).toEqual({ choice: 'slow_down', confidence: 0.8 });
    expect(parseArenaAnswer('```json\n{"choice":"brake","confidence":7}\n```', question.options)).toEqual({ choice: 'brake', confidence: 1 });
  });

  it('rejects a choice that is not an option, and a reply with no JSON', () => {
    expect(() => parseArenaAnswer('{"choice": "jump", "confidence": 1}', question.options)).toThrow();
    expect(() => parseArenaAnswer('I would slow down.', question.options)).toThrow();
  });

  it('fingerprints the prompt template', () => {
    expect(arenaPromptHash()).toMatch(/^[0-9a-f]{10}$/);
    expect(arenaPromptHash()).toBe(arenaPromptHash());
  });
});
