import type { BrainQuestion } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { buildJevRequest, createJevBrain, JEV_MODEL_ID, JevError, parseJevResponse } from './index';

const question: BrainQuestion = {
  missionId: 'M1',
  t: 3,
  trigger: 'terrain_ahead',
  perceived: {
    terrainAhead: 'mud',
    terrainAheadDistanceM: 2.4,
    obstacleAheadM: 'unknown',
    slipPct: 12,
    tiltDeg: 'unknown',
    depthAheadCm: 'unknown',
  },
  status: { speedMps: 1.4, batteryPct: 71, damagePct: 8 },
  priority: 0.8,
  options: ['cruise', 'slow_down', 'brake'],
  lookahead: [
    { action: 'cruise', progressM: 2.1, damagePct: 4, energyPct: 0.4 },
    { action: 'slow_down', progressM: 1.2, damagePct: 0, energyPct: 0.3 },
    { action: 'brake', progressM: 0.2, damagePct: 0, energyPct: 0.1 },
  ],
};

describe('brain', () => {
  it('pins a versioned model id, not an alias', () => {
    expect(JEV_MODEL_ID).toMatch(/^jev-\d+\.\d+\.\d+$/);
  });

  it('builds one choice question: options with lookahead numbers, priority in the instructions', () => {
    const request = buildJevRequest(question);
    expect(request.model).toBe(JEV_MODEL_ID);
    expect(request.state).toEqual({ perceived: question.perceived, robot: { ...question.status, motion: 'moving' } });
    expect(Object.keys(request.questions.action.criteria)).toEqual(question.options);
    expect(request.questions.action.criteria.cruise).toContain('progress 2.1 m');
    expect(request.questions.action.instructions).toContain('0.8');
  });

  it('parses probabilities, renormalised over the available options', () => {
    const parsed = parseJevResponse(
      {
        model: 'jev-1.13.0',
        answers: { action: { type: 'choice', choice: 'slow_down', probabilities: { cruise: 0.1, slow_down: 0.7 } } },
      },
      question.options,
    );
    expect(parsed.selected).toBe('slow_down');
    expect(parsed.probabilities.slow_down).toBeCloseTo(0.875);
    expect(parsed.probabilities.brake).toBe(0);
  });

  it('fails loudly without a key and on timeout', async () => {
    await expect(createJevBrain({ apiKey: '' }).decide(question)).rejects.toMatchObject({ code: 'missing_key' });
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const slow = createJevBrain({ apiKey: 'k', timeoutMs: 20, fetch: hang });
    await expect(slow.decide(question)).rejects.toBeInstanceOf(JevError);
    await expect(slow.decide(question)).rejects.toMatchObject({ code: 'timeout' });
  });
});
