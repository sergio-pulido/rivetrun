import { BrainDecisionSchema, type BrainQuestion } from '@rivetrun/contracts';
import { heuristicBrain, MISSIONS, PRESETS, runHeadless } from '@rivetrun/sim';
import { beforeAll, describe, expect, it } from 'vitest';
import { JEV_FAULT_HEADER } from '../../_lib/jevFault';
import { POST } from './route';

let question: BrainQuestion;
beforeAll(async () => {
  await runHeadless(MISSIONS.M1, 1001, PRESETS.all_rounder.build, { decide: (asked) => ((question ??= asked), heuristicBrain.decide(asked)) }, { priority: 0.5 });
});

const ask = (model: string, headers: Record<string, string> = {}): Promise<Response> =>
  POST(new Request(`http://localhost/api/arena/decide?model=${model}`, { method: 'POST', body: JSON.stringify(question), headers: { 'content-type': 'application/json', ...headers } }));

// The live Arena race on /screen?arena=1: one bot per brain, each decision one call.
describe('POST /api/arena/decide', () => {
  it('refuses a model that is not one of the live Arena brains', async () => {
    expect((await ask('some-other-model')).status).toBe(400);
  });

  it('answers with one of the offered actions (the fixed rules need no key and no network)', async () => {
    const response = await ask('heuristic');
    expect(response.status).toBe(200);
    const decision = BrainDecisionSchema.parse(await response.json());
    expect(question.options).toContain(decision.selected);
    expect(decision.model).toBe('heuristic');
  });

  it('a model this server has no key for is 503: its bot drives that decision on the fixed rules', async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await ask('gpt-6-luna')).status).toBe(503);
  });

  it('honours the fault switch like the other decide routes', async () => {
    expect((await ask('heuristic', { [JEV_FAULT_HEADER]: 'fail' })).status).toBe(502);
  });
});
