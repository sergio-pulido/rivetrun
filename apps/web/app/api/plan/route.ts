import { MissionIdSchema, PresetIdSchema, type Plan } from '@rivetrun/contracts';
import { z } from 'zod';
import { apiError, parseJsonBody } from '@/api/respond';
import { makePlan } from '../_lib/planner';
import { isPublicRequest } from '../_lib/publicGuard';
import { readPlanFile, storedPlan } from '../_lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** A plan can take the planner 30 s and its fallback as long again. */
export const maxDuration = 90;

const PlanRequestSchema = z.object({ missionId: MissionIdSchema, presetId: PresetIdSchema.optional() });

// Live planning calls cost money: they share the live Arena's ledger and stop at the same cap (ARENA_LIVE_CAP_USD).
interface Ledger {
  spentUsd: number;
  calls: number;
}
const holder = globalThis as typeof globalThis & { __rivetrunLiveArena?: Ledger & Record<string, unknown> };
const ledger = (): Ledger => (holder.__rivetrunLiveArena ??= { contestants: new Map(), spentUsd: 0, calls: 0 });
const capUsd = (): number => Number(process.env.ARENA_LIVE_CAP_USD ?? 3);

interface PlanBody {
  readonly plan: Plan;
  /** 'model' = planned by the model just now · 'pregenerated' = the committed plan (the model was not usable, or the cap is reached). */
  readonly source: 'model' | 'pregenerated';
  readonly fellBackBecause?: string;
}

// GET /api/plan?missionId=M1 — the pregenerated plans of a mission, for /play. Never calls a model.
export function GET(request: Request): Response {
  const mission = MissionIdSchema.safeParse(new URL(request.url).searchParams.get('missionId'));
  if (!mission.success) return apiError(400, 'bad_request', 'missionId is not a mission');
  const file = readPlanFile(mission.data);
  if (!file) return apiError(404, 'bad_request', `no pregenerated plans for ${mission.data}`);
  return Response.json(file, { headers: { 'Cache-Control': 'no-store' } });
}

// POST /api/plan { missionId, presetId? } → { plan, source }. "Analyze scenario": a reasoning model plans a build and
// a strategy from the mission brief (PLAN_MODEL, default claude-sonnet-5-5; fallback GPT-6.1 Sol). Keys stay here.
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, PlanRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { missionId, presetId } = parsed.data;
  const stored = (preset: Parameters<typeof storedPlan>[1]): Plan | null => storedPlan(missionId, preset);

  // RR-GUARD: live planning is for the presenter. A visitor gets the committed plan, and no model is called.
  if (isPublicRequest(request)) {
    const plan = stored(presetId ?? 'all_rounder');
    if (plan) return Response.json({ plan, source: 'pregenerated', fellBackBecause: 'live planning is for the presenter; this is the stored plan' } satisfies PlanBody);
    return apiError(503, 'upstream_error', 'no stored plan for this mission');
  }
  if (ledger().spentUsd >= capUsd()) {
    const plan = stored(presetId ?? 'all_rounder');
    if (plan) return Response.json({ plan, source: 'pregenerated', fellBackBecause: 'the spending cap for live model calls is reached' } satisfies PlanBody);
    return apiError(503, 'upstream_error', 'the spending cap for live model calls is reached and no pregenerated plan exists');
  }
  try {
    const result = await makePlan(missionId, presetId, stored);
    const book = ledger();
    book.spentUsd += result.costUsd;
    book.calls += 1;
    return Response.json({ plan: result.plan, source: result.source, ...(result.fellBackBecause ? { fellBackBecause: result.fellBackBecause } : {}) } satisfies PlanBody);
  } catch (error) {
    console.error(`[plan] ${missionId}: ${error instanceof Error ? error.message.slice(0, 160) : 'failed'}`);
    return apiError(502, 'upstream_error', 'the planner gave no usable plan');
  }
}
