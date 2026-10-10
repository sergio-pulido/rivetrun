import { ApiErrorSchema, type BrainQuestion } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { POST as decide } from './decide/route';
import { GET as leaderboard } from './leaderboard/route';
import { POST as runs } from './runs/route';
import { GET as stats } from './stats/route';

const post = (path: string, body: string): Request =>
  new Request(`http://localhost${path}`, { method: 'POST', body, headers: { 'content-type': 'application/json' } });

const question: BrainQuestion = {
  missionId: 'M1',
  t: 0,
  trigger: 'start',
  perceived: {
    terrainAhead: 'unknown',
    terrainAheadDistanceM: 'unknown',
    obstacleAheadM: 'unknown',
    slipPct: 'unknown',
    tiltDeg: 'unknown',
    depthAheadCm: 'unknown',
  },
  status: { speedMps: 0, batteryPct: 100, damagePct: 0 },
  priority: 0.5,
  options: ['cruise', 'accelerate'],
  lookahead: [],
};

const expectError = async (response: Response, status: number, code: string): Promise<void> => {
  expect(response.status).toBe(status);
  const body = ApiErrorSchema.parse(await response.json());
  expect(body.code).toBe(code);
};

describe('API routes', () => {
  it('POST /api/decide: 400 on invalid JSON or shape, 503 without JEV_API_KEY', async () => {
    delete process.env.JEV_API_KEY;
    await expectError(await decide(post('/api/decide', '{not json')), 400, 'bad_request');
    await expectError(await decide(post('/api/decide', JSON.stringify({ missionId: 'M99' }))), 400, 'bad_request');
    await expectError(await decide(post('/api/decide', JSON.stringify(question))), 503, 'upstream_error');
  });

  it('POST /api/runs: 400 on an invalid episode', async () => {
    await expectError(await runs(post('/api/runs', JSON.stringify({ nickname: 'ada', episode: {} }))), 400, 'bad_request');
  });

  it('GET /api/leaderboard: 400 on an unknown mission, entries otherwise (default M5)', async () => {
    await expectError(await leaderboard(new Request('http://localhost/api/leaderboard?mission=M99')), 400, 'bad_request');
    const response = await leaderboard(new Request('http://localhost/api/leaderboard'));
    expect(await response.json()).toEqual({ missionId: 'M5', entries: [] });
  });

  it('GET /api/stats: episode count', async () => {
    expect(await (await stats()).json()).toEqual({ episodes: 0 });
  });
});
