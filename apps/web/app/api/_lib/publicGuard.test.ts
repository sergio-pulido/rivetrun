import { PRESETS } from '@rivetrun/sim';
import type { BrainQuestion } from '@rivetrun/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as adminGet, POST as adminPost } from '../admin/public-ai/route';
import { POST as decide } from '../decide/route';
import { POST as plan } from '../plan/route';
import { guardedGhost } from './ghostGuard';
import {
  clientOf, countPublicAi, countPublicJev, guardDecision, GUARD_LABEL, isPublicRequest, publicGuardStatus, resetPublicGuard, RUN_WINDOW_MS, setPublicAi, startPublicRun,
} from './publicGuard';

const req = (host: string, headers: Record<string, string> = {}, init: RequestInit = {}): Request => new Request(`http://${host}/x`, { ...init, headers: { host, ...headers } });
const TUNNEL = 'quiet-words.trycloudflare.com';

// RR-GUARD: what a request through the public URL may cost.
describe('public traffic guard', () => {
  beforeEach(() => resetPublicGuard());
  afterEach(() => vi.unstubAllEnvs());

  it('classifies by host: localhost is the presenter, everything else is public', () => {
    for (const host of ['localhost:3001', '127.0.0.1:3001', 'localhost', '[::1]:3001']) expect(isPublicRequest(req(host)), host).toBe(false);
    for (const host of [TUNNEL, '192.168.0.14:3001', 'rivetrun.example', 'localhost.evil.example']) expect(isPublicRequest(req(host)), host).toBe(true);
    // Relayed by Cloudflare: public whatever the Host header says.
    expect(isPublicRequest(req('localhost:3001', { 'cf-connecting-ip': '203.0.113.9' }))).toBe(true);
    expect(clientOf(req(TUNNEL, { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientOf(req(TUNNEL, { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }))).toBe('198.51.100.4');
  });

  it('per client: three live runs in ten minutes, then refused until the window moves on', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(startPublicRun('a', 'jev', now + i)).toBeNull();
    expect(startPublicRun('a', 'jev', now + 10)).toBe('client_runs');
    expect(startPublicRun('b', 'jev', now + 10)).toBeNull(); // another phone is not affected
    expect(startPublicRun('a', 'jev', now + RUN_WINDOW_MS + 5)).toBeNull();
  });

  it('a refused run stays refused for its later decisions; an allowed run keeps going; the presenter is never limited', () => {
    const phone = (): Request => req(TUNNEL, { 'cf-connecting-ip': '203.0.113.9' });
    for (let i = 0; i < 3; i++) expect(guardDecision(phone(), 'jev', true)).toBeNull();
    expect(guardDecision(phone(), 'jev', false)).toBeNull(); // a decision of the third run
    expect(guardDecision(phone(), 'jev', true)).toBe('client_runs'); // the fourth run
    expect(guardDecision(phone(), 'jev', false)).toBe('client_runs'); // and everything it asks afterwards
    for (let i = 0; i < 20; i++) expect(guardDecision(req('localhost:3001'), 'jev', true)).toBeNull();
  });

  it('budgets: the Jev call cap and the model spend cap each stop their own provider', () => {
    vi.stubEnv('PUBLIC_JEV_CALLS_CAP', '5');
    vi.stubEnv('PUBLIC_AI_CAP_USD', '0.5');
    countPublicJev(5);
    expect(startPublicRun('a', 'jev')).toBe('jev_budget');
    expect(startPublicRun('a', 'llm')).toBeNull();
    countPublicAi(0.5);
    expect(startPublicRun('b', 'llm')).toBe('ai_budget');
    expect(publicGuardStatus()).toMatchObject({ jev: { calls: 5, cap: 5, left: 0 }, ai: { spentUsd: 0.5, capUsd: 0.5, leftUsd: 0 }, refused: { jev_budget: 1, ai_budget: 1 } });
  });

  it('the kill switch stops every visitor call at once and comes back without a restart', () => {
    setPublicAi(false);
    expect(startPublicRun('a', 'jev')).toBe('off');
    expect(startPublicRun('a', 'llm')).toBe('off');
    setPublicAi(true);
    expect(startPublicRun('a', 'jev')).toBeNull();
  });

  it('the kill switch route answers on the presenter machine only', async () => {
    const body = JSON.stringify({ on: false });
    const post = (host: string, headers: Record<string, string> = {}): Promise<Response> => adminPost(req(host, { 'content-type': 'application/json', ...headers }, { method: 'POST', body }));
    expect((await post(TUNNEL)).status).toBe(403);
    expect((await post('localhost:3001', { 'cf-connecting-ip': '203.0.113.9' })).status).toBe(403);
    expect(adminGet(req(TUNNEL)).status).toBe(403);
    expect(publicGuardStatus().on).toBe(true); // nothing changed
    const ok = await post('localhost:3001');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { on: boolean }).on).toBe(false);
    expect(((await adminGet(req('localhost:3001')).json()) as { on: boolean }).on).toBe(false);
  });

  it('over a limit /api/decide answers 429 with the label a phone shows, and never calls Jev', async () => {
    setPublicAi(false);
    const question: BrainQuestion = {
      missionId: 'M1', t: 0, trigger: 'start',
      perceived: { terrainAhead: 'unknown', terrainAheadDistanceM: 'unknown', obstacleAheadM: 'unknown', slipPct: 'unknown', tiltDeg: 'unknown', depthAheadCm: 'unknown' },
      status: { speedMps: 0, batteryPct: 100, damagePct: 0 }, priority: 0.31, options: ['cruise', 'accelerate'], lookahead: [],
    };
    const response = await decide(req(TUNNEL, { 'content-type': 'application/json' }, { method: 'POST', body: JSON.stringify(question) }));
    expect(response.status).toBe(429);
    expect(response.headers.get('x-rivetrun-guard')).toBe('off');
    expect(((await response.json()) as { error: string }).error).toBe(GUARD_LABEL.off);
    expect(publicGuardStatus().jev.calls).toBe(0);
  });

  it('a visitor asking for a ghost nobody has driven gets no new run over the limit: a label, not an error screen', () => {
    setPublicAi(false);
    const ghost = { missionId: 'M2' as const, seed: 987654, build: PRESETS.speedster.build, priority: 0.5 };
    const answer = guardedGhost(req(TUNNEL), ghost);
    expect(answer).toMatchObject({ status: 'unavailable', label: GUARD_LABEL.off });
    expect(publicGuardStatus().refused.off).toBe(1);
  });

  it('live planning is for the presenter: a visitor gets the stored plan and no model is asked', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(new URL('../../..', import.meta.url).pathname.replace(/\/$/, ''));
    const response = await plan(req(TUNNEL, { 'content-type': 'application/json' }, { method: 'POST', body: JSON.stringify({ missionId: 'M1', presetId: 'speedster' }) }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { source: string; plan: { presetId: string } };
    expect(body.source).toBe('pregenerated');
    expect(body.plan.presetId).toBe('speedster');
  });
});
