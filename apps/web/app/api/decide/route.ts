import { createJevBrain, JevError } from '@rivetrun/brain';
import { DecideRequestSchema, type DecideResponse } from '@rivetrun/contracts';
import { apiError, parseJsonBody } from '@/api/respond';
import { cacheDecision, decisionKey, getCachedDecision } from '../_lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const jev = createJevBrain();

// POST /api/decide — BrainQuestion → BrainDecision (policy 'jev'). The key never leaves the server.
// On any Jev failure this returns an error; the client brain falls back to the heuristic.
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, DecideRequestSchema);
  if (!parsed.ok) return parsed.response;

  const started = performance.now();
  const key = decisionKey(parsed.data);
  const cached = getCachedDecision(key);
  if (cached) {
    const hit: DecideResponse = { ...cached, latencyMs: Math.round(performance.now() - started) };
    return Response.json(hit, { headers: { 'x-rivetrun-cache': 'hit' } });
  }

  try {
    const decision: DecideResponse = await jev.decide(parsed.data);
    cacheDecision(key, decision);
    return Response.json(decision, { headers: { 'x-rivetrun-cache': 'miss' } });
  } catch (error) {
    if (error instanceof JevError) {
      console.error(`[decide] jev ${error.code}: ${error.message}`);
      if (error.code === 'timeout') return apiError(504, 'upstream_timeout', error.message);
      if (error.code === 'missing_key') return apiError(503, 'upstream_error', 'JEV_API_KEY is not set');
      return apiError(502, 'upstream_error', `Jev failed (${error.code})`);
    }
    console.error('[decide] unexpected', error);
    return apiError(500, 'internal', 'decide failed');
  }
}
