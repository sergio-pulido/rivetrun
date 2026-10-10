import { createHash } from 'node:crypto';
import { askJevChoice, JEV_MODEL_ID, JevError } from '@rivetrun/brain';
import { buildLabJevRequest, LAB_QUESTION_VERSION } from '@rivetrun/brain/lab';
import { LabQuestionSchema, type LabDecision } from '@rivetrun/lab';
import { apiError, parseJsonBody } from '@/api/respond';
import { decideFault, jevFaultOf } from '../../_lib/jevFault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Answers and calls in flight, by question. In memory like /api/decide; a Lab question repeats when two visitors
// play the same scenario with the same build and make the same moves.
const MAX_CACHE = 2000;
interface LabDecideState {
  readonly cache: Map<string, LabDecision>;
  readonly inFlight: Map<string, Promise<LabDecision>>;
}
const holder = globalThis as typeof globalThis & { __rivetrunLabDecide?: LabDecideState };
const state: LabDecideState = (holder.__rivetrunLabDecide ??= { cache: new Map(), inFlight: new Map() });

/** Everything the answer depends on: the request Jev would get, the lab version and the wording version. */
const keyOf = (labVersion: number, request: unknown): string =>
  createHash('sha256').update(JSON.stringify([labVersion, LAB_QUESTION_VERSION, JEV_MODEL_ID, request])).digest('hex');

// GET /api/lab/decide — tells the page the route is here and which model answers. No Jev call.
export function GET(): Response {
  return Response.json({ ok: true, model: JEV_MODEL_ID, configured: Boolean(process.env.JEV_API_KEY) }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST /api/lab/decide — LabQuestion → LabDecision (policy 'jev'): Jev picks one of the question's option ids.
// The key never leaves the server. On any Jev failure this returns an error and the page's fixed rules decide.
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, LabQuestionSchema);
  if (!parsed.ok) return parsed.response;
  const question = parsed.data;

  const started = performance.now();
  const jevRequest = buildLabJevRequest(question);
  const optionIds = question.options.map((option) => option.id);
  const key = keyOf(question.labVersion, jevRequest);
  // The test switch (jevFault.ts) comes before the cache, as on /api/decide.
  const fault = jevFaultOf(request);
  const cached = fault ? undefined : state.cache.get(key);
  if (cached) return Response.json({ ...cached, latencyMs: Math.round(performance.now() - started) } satisfies LabDecision, { headers: { 'x-rivetrun-cache': 'hit' } });

  try {
    if (fault) await decideFault(fault);
    const joined = state.inFlight.get(key);
    const call =
      joined ??
      askJevChoice(jevRequest, optionIds)
        .then((answer): LabDecision => {
          const decision: LabDecision = { choice: answer.choice, probabilities: answer.probabilities as Record<string, number>, latencyMs: answer.latencyMs, policy: 'jev', model: answer.model };
          if (state.cache.size >= MAX_CACHE) state.cache.delete(state.cache.keys().next().value as string);
          state.cache.set(key, decision);
          return decision;
        })
        .finally(() => state.inFlight.delete(key));
    if (!joined) state.inFlight.set(key, call);
    const decision = await call;
    const answer: LabDecision = joined ? { ...decision, latencyMs: Math.round(performance.now() - started) } : decision;
    return Response.json(answer, { headers: { 'x-rivetrun-cache': joined ? 'joined' : 'miss' } });
  } catch (error) {
    if (error instanceof JevError) {
      console.error(`[lab/decide] jev ${error.code}: ${error.message}`);
      if (error.code === 'timeout') return apiError(504, 'upstream_timeout', error.message);
      if (error.code === 'missing_key') return apiError(503, 'upstream_error', 'JEV_API_KEY is not set');
      return apiError(502, 'upstream_error', `Jev failed (${error.code})`);
    }
    console.error('[lab/decide] unexpected', error);
    return apiError(500, 'internal', 'lab decide failed');
  }
}
