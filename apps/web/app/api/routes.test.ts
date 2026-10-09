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

describe('API routes (scaffold)', () => {
  it('POST /api/decide: 400 on invalid JSON or shape, 501 on a valid question', async () => {
    await expectError(await decide(post('/api/decide', '{not json')), 400, 'bad_request');
    await expectError(await decide(post('/api/decide', JSON.stringify({ missionId: 'M9' }))), 400, 'bad_request');
    await expectError(await decide(post('/api/decide', JSON.stringify(question))), 501, 'not_implemented');
  });

  it('POST /api/runs: 400 on an invalid episode', async () => {
    await expectError(await runs(post('/api/runs', JSON.stringify({ nickname: 'ada', episode: {} }))), 400, 'bad_request');
  });

  it('GET /api/leaderboard: 400 on an unknown mission, 501 otherwise (default M5)', async () => {
    await expectError(await leaderboard(new Request('http://localhost/api/leaderboard?mission=M9')), 400, 'bad_request');
    await expectError(await leaderboard(new Request('http://localhost/api/leaderboard')), 501, 'not_implemented');
  });

  it('GET /api/stats: 501', async () => {
    await expectError(await stats(), 501, 'not_implemented');
  });
});
