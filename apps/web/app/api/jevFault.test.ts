import { driveSeed, MISSIONS, PRESETS } from '@rivetrun/sim';
import { ApiErrorSchema, type BrainQuestion } from '@rivetrun/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JEV_FAULT_COOKIE, JEV_FAULT_HEADER, JEV_FAULT_SLOW_MS } from './_lib/jevFault';
import { POST as decide } from './decide/route';
import { GET as ghost } from './ghost/route';

const question: BrainQuestion = {
  missionId: 'M1',
  t: 0,
  trigger: 'start',
  perceived: { terrainAhead: 'unknown', terrainAheadDistanceM: 'unknown', obstacleAheadM: 'unknown', slipPct: 'unknown', tiltDeg: 'unknown', depthAheadCm: 'unknown' },
  status: { speedMps: 0, batteryPct: 100, damagePct: 0 },
  priority: 0.5,
  options: ['cruise', 'accelerate'],
  lookahead: [],
};

const ask = (headers: Record<string, string>): Promise<Response> =>
  decide(new Request('http://localhost/api/decide', { method: 'POST', body: JSON.stringify(question), headers: { 'content-type': 'application/json', ...headers } }));

/** Drive mode's own seed for the mission: the only seed the route computes a ghost for. */
const ghostUrl = (mission: 'M1' | 'M2', seed: number = driveSeed(MISSIONS[mission])): string => `http://localhost/api/ghost?mission=${mission}&seed=${seed}&build=${encodeURIComponent(JSON.stringify(PRESETS.all_rounder.build))}`;

const code = async (response: Response): Promise<string> => ApiErrorSchema.parse(await response.json()).code;

// The fallback path of the demo: "Jev unavailable or slow → the heuristic drives, the game never stalls".
describe('Jev fault switch', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fail: /api/decide answers 502 at once, so the client brain falls back', async () => {
    const started = performance.now();
    const response = await ask({ [JEV_FAULT_HEADER]: 'fail' });
    expect(response.status).toBe(502);
    expect(await code(response)).toBe('upstream_error');
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('slow: /api/decide stays silent for 3 s and then answers 504 (the cookie works like the header)', async () => {
    const started = performance.now();
    const response = await ask({ cookie: `theme=dark; ${JEV_FAULT_COOKIE}=slow` });
    expect(response.status).toBe(504);
    expect(await code(response)).toBe('upstream_timeout');
    expect(performance.now() - started).toBeGreaterThanOrEqual(JEV_FAULT_SLOW_MS - 50);
  }, 10_000);

  it('fail: /api/ghost has no Jev ghost to serve (503), so Drive mode races the heuristic', async () => {
    const request = (): Promise<Response> => ghost(new Request(ghostUrl('M1'), { headers: { [JEV_FAULT_HEADER]: 'fail' } }));
    expect((await request()).status).toBe(202);
    await vi.waitFor(async () => expect((await request()).status).toBe(503), { timeout: 20_000, interval: 250 });
    expect(await code(await request())).toBe('upstream_error');
  }, 30_000);

  it('slow: the ghost run never waits for Jev past the decision deadline and ends as "no Jev ghost" (503)', async () => {
    const request = (): Promise<Response> => ghost(new Request(ghostUrl('M2'), { headers: { [JEV_FAULT_HEADER]: 'slow' } }));
    expect((await request()).status).toBe(202);
    await vi.waitFor(async () => expect((await request()).status).toBe(503), { timeout: 110_000, interval: 1000 });
  }, 120_000);

  it('/api/ghost refuses a seed that is not the mission\'s Drive seed: no Jev run is started for it', async () => {
    expect((await ghost(new Request(ghostUrl('M1', 4242)))).status).toBe(400);
  });

  it('is ignored in a production build unless the server opted in', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JEV_API_KEY', '');
    // No fault applied: the request goes on to Jev and stops at the missing key, as any request would here.
    const response = await ask({ [JEV_FAULT_HEADER]: 'fail' });
    expect(response.status).toBe(503);
    vi.stubEnv('RIVETRUN_JEV_FAULT_SWITCH', '1');
    expect((await ask({ [JEV_FAULT_HEADER]: 'fail' })).status).toBe(502);
  });
});
