import { JEV_MODEL_ID } from '@rivetrun/brain';
import { MissionIdSchema, PlayStrategySchema, PresetIdSchema, SeedSchema } from '@rivetrun/contracts';
import { driveSeed, MISSIONS } from '@rivetrun/sim';
import { z } from 'zod';
import { apiError, parseWith } from '@/api/respond';
import { PLAY_MISSION } from '@/play/playMission';
import { ArenaBrainIdSchema } from '../../../race/_lib/protocol';
import { guardedGhost } from '../../_lib/ghostGuard';
import { resolveStrategy } from '../../_lib/playStrategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  mission: MissionIdSchema.default(PLAY_MISSION),
  preset: PresetIdSchema.default('all_rounder'),
  /** An arena brain id. 'human' has no run to precompute. */
  agent: ArenaBrainIdSchema.default(JEV_MODEL_ID as z.infer<typeof ArenaBrainIdSchema>),
  strategy: PlayStrategySchema.default('plan'),
  seed: z.coerce.number().pipe(SeedSchema).optional(),
});

// GET /api/play/ghost?mission=&preset=&agent=&strategy=&seed= — the run of a picked agent (RR-PLAN §4 and §6):
// the vehicle, the agent and the strategy a player tapped, driven once on the server and cached, so 40 phones that
// pick the same combination cost one run. The server resolves the strategy into a build, a briefing and a priority.
// 200 { ghost, decisions, fallbacks, medianLatencyMs?, pick } · 202 while it is being driven · 503 when it cannot be.
// With &status=1: always 200 { status: 'ready' | 'computing' | 'unavailable' } without the trace.
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const parsed = parseWith(QuerySchema, Object.fromEntries(['mission', 'preset', 'agent', 'strategy', 'seed'].flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : []))));
  if (!parsed.ok) return parsed.response;
  const { mission, preset, agent, strategy } = parsed.data;
  // One seed per mission for everyone, so the board compares like with like.
  const seed = parsed.data.seed ?? driveSeed(MISSIONS[mission]);
  const resolved = resolveStrategy(mission, preset, strategy);
  const pick = { mission, preset, agent, strategy, seed, plan: resolved.plan, label: resolved.label, briefing: resolved.briefing, priority: resolved.priority, ...(resolved.planModel ? { planModel: resolved.planModel } : {}) };

  const answer = guardedGhost(request, { missionId: mission, seed, build: resolved.build, priority: resolved.priority, briefing: resolved.briefing, ...(agent === JEV_MODEL_ID ? {} : { agent }) });
  // RR-GUARD: 'cached' = an earlier recorded run stands in for this pick; `label` is what the phone says.
  const served = answer.status === 'ready' && answer.served ? { served: answer.served, label: answer.label } : answer.status === 'unavailable' && answer.label ? { label: answer.label } : {};
  if (params.get('status')) {
    const status = answer.status === 'ready' ? 'ready' : answer.status === 'pending' ? 'computing' : 'unavailable';
    return Response.json({ status, pick, ...served, ...(answer.status === 'ready' ? { decisions: answer.body.decisions, fallbacks: answer.body.fallbacks, timeS: answer.body.ghost.outcome.timeS, finished: answer.body.ghost.outcome.finished } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (answer.status === 'ready') return Response.json({ ...answer.body, pick, ...served });
  if (answer.status === 'pending') return Response.json({ status: 'computing', pick }, { status: 202, headers: { 'Retry-After': '2' } });
  return apiError(503, 'upstream_error', `No run for this pick: ${answer.reason}`);
}
