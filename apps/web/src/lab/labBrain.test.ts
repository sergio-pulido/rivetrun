import { describe, expect, it } from 'vitest';
import { LAB_DEFAULT_BUILDS, LAB_SCENARIOS, buildLabQuestion, createLab, labHeuristicDecide, type LabQuestion } from '@rivetrun/lab';
import { LAB_DECIDE_URL, jevIsLive, jevLabBrain } from './labBrain';

const question = ((): LabQuestion => {
  const state = createLab({ scenario: LAB_SCENARIOS.maze, seed: 1001, entries: [{ agentId: 'you', build: LAB_DEFAULT_BUILDS.maze }] });
  return buildLabQuestion(state, 'you', state.agents[0]!.trigger!)!;
})();
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const rules = labHeuristicDecide(question).choice;
const other = question.options.find((option) => option.id !== rules)!.id;

describe('Jev on Lab Missions', () => {
  it('posts the question and takes Jev at its word', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return json({ choice: other, probabilities: { [other]: 0.8 }, latencyMs: 231, policy: 'jev', model: 'jev-1' });
    };
    const decision = await jevLabBrain({ fetchImpl }).decide(question);
    expect(decision).toMatchObject({ choice: other, latencyMs: 231, policy: 'jev', model: 'jev-1' });
    expect(decision.fallback).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(LAB_DECIDE_URL);
    expect((calls[0]!.body as LabQuestion).labVersion).toBe(question.labVersion);
  });

  it('falls back to the fixed rules on an error, a bad body or a choice that was not on offer', async () => {
    const cases: (() => Promise<Response>)[] = [
      async () => json({ error: 'Jev failed' }, 502),
      async () => json({ selected: other }),
      async () => json({ choice: 'fly', latencyMs: 100 }),
      async () => { throw new Error('network down'); },
    ];
    for (const respond of cases) {
      const decision = await jevLabBrain({ fetchImpl: respond }).decide(question);
      expect(decision).toMatchObject({ choice: rules, policy: 'heuristic', fallback: true });
    }
  });

  it('does not wait past its budget: a slow Jev is cut off and the wait is what the thread shows', async () => {
    const never: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const started = performance.now();
    const decision = await jevLabBrain({ fetchImpl: never, timeoutMs: 40 }).decide(question);
    expect(decision).toMatchObject({ choice: rules, fallback: true, policy: 'heuristic' });
    expect(decision.latencyMs).toBeGreaterThanOrEqual(35);
    expect(performance.now() - started).toBeLessThan(600);
  });

  it('marks an answer the server took from its cache, so the thread does not pass it off as Jev speed', async () => {
    const answer = { choice: other, latencyMs: 0, policy: 'jev' };
    const hit: typeof fetch = async () => new Response(JSON.stringify(answer), { status: 200, headers: { 'x-rivetrun-cache': 'hit' } });
    const miss: typeof fetch = async () => new Response(JSON.stringify({ ...answer, latencyMs: 394 }), { status: 200, headers: { 'x-rivetrun-cache': 'miss' } });
    expect((await jevLabBrain({ fetchImpl: hit }).decide(question)).cached).toBe(true);
    expect((await jevLabBrain({ fetchImpl: miss }).decide(question)).cached).toBeUndefined();
  });

  it('says Jev is live only when the route answers and its key is set', async () => {
    expect(await jevIsLive(async () => json({ ok: true, model: 'jev-1.13.0', configured: true }))).toBe(true);
    // No key: every question would come back 503 and fall back.
    expect(await jevIsLive(async () => json({ ok: true, model: 'jev-1.13.0', configured: false }))).toBe(false);
    expect(await jevIsLive(async () => json({ error: 'not found' }, 404))).toBe(false);
    expect(await jevIsLive(async () => { throw new Error('offline'); })).toBe(false);
  });
});
