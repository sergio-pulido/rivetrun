import { createJevBrain, JevError } from '@rivetrun/brain';
import { DecideRequestSchema, type DecideResponse } from '@rivetrun/contracts';
import { apiError, parseJsonBody } from '@/api/respond';
import { decideFault, jevFaultOf } from '../_lib/jevFault';
import { cacheDecision, decisionKey, getCachedDecision } from '../_lib/store';
import { liveDecisionStarted } from '../_lib/liveTraffic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const jev = createJevBrain();

// Calls to Jev that are in flight, by question key. In a full room many phones reach the same decision point
// in the same state within a few hundred ms: they share one call instead of each making their own.
const holder = globalThis as typeof globalThis & { __rivetrunDecideInFlight?: Map<string, Promise<DecideResponse>> };
const inFlight: Map<string, Promise<DecideResponse>> = (holder.__rivetrunDecideInFlight ??= new Map());

// POST /api/decide — BrainQuestion → BrainDecision (policy 'jev'). The key never leaves the server.
// On any Jev failure this returns an error; the client brain falls back to the heuristic.
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, DecideRequestSchema);
  if (!parsed.ok) return parsed.response;

  const started = performance.now();
  const key = decisionKey(parsed.data);
  // The test switch (jevFault.ts) comes before the cache: a faulted client must not be served a stored answer.
  const fault = jevFaultOf(request);
  const cached = fault ? undefined : getCachedDecision(key);
  if (cached) {
    const hit: DecideResponse = { ...cached, latencyMs: Math.round(performance.now() - started) };
    return Response.json(hit, { headers: { 'x-rivetrun-cache': 'hit' } });
  }

  // Background ghost runs step aside while this is answered (liveTraffic.ts).
  const liveDone = liveDecisionStarted();
  try {
    if (fault) await decideFault(fault);
    const joined = inFlight.get(key);
    const call =
      joined ??
      jev
        .decide(parsed.data)
        .then((decision) => {
          cacheDecision(key, decision);
          return decision;
        })
        .finally(() => inFlight.delete(key));
    if (!joined) inFlight.set(key, call);
    const decision = await call;
    // A request that joined a call already under way waited only for the rest of it: it reports its own wait.
    const answer: DecideResponse = joined ? { ...decision, latencyMs: Math.round(performance.now() - started) } : decision;
    return Response.json(answer, { headers: { 'x-rivetrun-cache': joined ? 'joined' : 'miss' } });
  } catch (error) {
    if (error instanceof JevError) {
      console.error(`[decide] jev ${error.code}: ${error.message}`);
      if (error.code === 'timeout') return apiError(504, 'upstream_timeout', error.message);
      if (error.code === 'missing_key') return apiError(503, 'upstream_error', 'JEV_API_KEY is not set');
      return apiError(502, 'upstream_error', `Jev failed (${error.code})`);
    }
    console.error('[decide] unexpected', error);
    return apiError(500, 'internal', 'decide failed');
  } finally {
    liveDone();
  }
}
