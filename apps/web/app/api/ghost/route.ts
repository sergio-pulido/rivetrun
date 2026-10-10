import { BriefingSchema, BuildSchema, MissionIdSchema, PrioritySchema, SeedSchema } from '@rivetrun/contracts';
import { z } from 'zod';
import { apiError, parseWith } from '@/api/respond';
import { requestGhost } from '../_lib/ghostStore';
import { jevFaultOf } from '../_lib/jevFault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = z.string().transform((text, context) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    context.addIssue({ code: 'custom', message: 'must be JSON' });
    return z.NEVER;
  }
});

const GhostQuerySchema = z.object({
  mission: MissionIdSchema,
  seed: z.coerce.number().pipe(SeedSchema),
  build: json.pipe(BuildSchema),
  priority: z.coerce.number().pipe(PrioritySchema).default(0.5),
  briefing: BriefingSchema.optional(),
});

// GET /api/ghost?mission=&seed=&build=<json>&priority=&briefing= — the Jev run for Drive mode's rival ghost.
// With &status=1: always 200 { status: 'ready' | 'computing' | 'unavailable' }, no trace (for a "Jev is ready" line).
// 200 { ghost, decisions, fallbacks } when ready. 202 while the server is still driving it (the first request
// starts it; ask again). 503 when Jev cannot drive it: the phone then races the heuristic ghost.
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const parsed = parseWith(GhostQuerySchema, {
    mission: params.get('mission') ?? undefined,
    seed: params.get('seed') ?? undefined,
    build: params.get('build') ?? undefined,
    priority: params.get('priority') ?? undefined,
    briefing: params.get('briefing') || undefined,
  });
  if (!parsed.ok) return parsed.response;
  const { mission, seed, build, priority, briefing } = parsed.data;

  const fault = jevFaultOf(request);
  const answer = requestGhost({ missionId: mission, seed, build, priority, briefing, ...(fault ? { fault } : {}) });
  // ?status=1: the Brief asks only whether Jev is ready (and starts the run if it is not), without the trace.
  if (params.get('status')) {
    const body = answer.status === 'ready' ? { status: 'ready', decisions: answer.body.decisions, fallbacks: answer.body.fallbacks } : answer.status === 'pending' ? { status: 'computing' } : { status: 'unavailable' };
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (answer.status === 'ready') return Response.json(answer.body);
  if (answer.status === 'pending') return Response.json({ status: 'computing' }, { status: 202, headers: { 'Retry-After': '2' } });
  return apiError(503, 'upstream_error', `No Jev ghost: ${answer.reason}`);
}
