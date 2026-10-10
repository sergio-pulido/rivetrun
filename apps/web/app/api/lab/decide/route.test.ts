import { ApiErrorSchema } from '@rivetrun/contracts';
import { LAB_DEFAULT_BUILDS, labHeuristicBrain, runLabHeadless, type LabQuestion } from '@rivetrun/lab';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JEV_FAULT_HEADER } from '../../_lib/jevFault';
import { GET, POST } from './route';

let question: LabQuestion;
beforeAll(async () => {
  // A real first question of the Maze, as the page would post it.
  await runLabHeadless('maze', 1001, LAB_DEFAULT_BUILDS.maze, { decide: (asked) => ((question ??= asked), labHeuristicBrain.decide(asked)) });
});

const post = (body: string, headers: Record<string, string> = {}): Promise<Response> =>
  POST(new Request('http://localhost/api/lab/decide', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }));
const code = async (response: Response): Promise<string> => ApiErrorSchema.parse(await response.json()).code;

describe('POST /api/lab/decide', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('GET says the route is live and which model answers, without calling it', async () => {
    const body = (await GET().json()) as { ok: boolean; model: string };
    expect(body.ok).toBe(true);
    expect(body.model).toMatch(/^jev-\d/);
  });

  it('400 on invalid JSON or a body that is not a LabQuestion', async () => {
    expect((await post('{not json')).status).toBe(400);
    expect((await post(JSON.stringify({ scenarioId: 'maze' }))).status).toBe(400);
    expect((await post(JSON.stringify({ ...question, options: [] }))).status).toBe(400);
  });

  it('503 without JEV_API_KEY: the page lets the fixed rules decide', async () => {
    vi.stubEnv('JEV_API_KEY', '');
    const response = await post(JSON.stringify(question));
    expect(response.status).toBe(503);
    expect(await code(response)).toBe('upstream_error');
  });

  it('the fault switch works here as on /api/decide: fail is a 502 at once', async () => {
    const response = await post(JSON.stringify(question), { [JEV_FAULT_HEADER]: 'fail' });
    expect(response.status).toBe(502);
    expect(await code(response)).toBe('upstream_error');
  });
});
