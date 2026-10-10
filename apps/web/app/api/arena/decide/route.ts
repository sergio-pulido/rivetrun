import { publicReason, resolveContestants, type Contestant } from '@rivetrun/brain/arena';
import { DecideRequestSchema, type BrainDecision } from '@rivetrun/contracts';
import { apiError, parseJsonBody } from '@/api/respond';
import { ARENA_DECIDE_TIMEOUT_MS, ArenaBrainIdSchema, type ArenaBrainId } from '../../../race/_lib/protocol';
import { decideFault, jevFaultOf } from '../../_lib/jevFault';
import { liveDecisionStarted } from '../../_lib/liveTraffic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The live Arena race (/screen?arena=1, docs/OVERNIGHT.md OVN-BRAIN-6): one bot per brain on the same seed.
// Each decision of a bot is one call to its model through the same adapters, prompt and parameters as the
// arena table (packages/brain/src/arena). Keys stay on the server. Nothing is cached: the latency is the point.
interface LiveArenaState {
  /** Each brain is checked against its provider once per server start (models endpoint, accepted mode). */
  readonly contestants: Map<ArenaBrainId, Promise<Contestant | null>>;
  spentUsd: number;
  calls: number;
}
const holder = globalThis as typeof globalThis & { __rivetrunLiveArena?: LiveArenaState };
const state: LiveArenaState = (holder.__rivetrunLiveArena ??= { contestants: new Map(), spentUsd: 0, calls: 0 });

const reasons = new Map<ArenaBrainId, string>();

/** Paid models stop answering once this much has been spent since the server started (their bots drive on the fixed rules). */
const capUsd = (): number => Number(process.env.ARENA_LIVE_CAP_USD ?? 1);

function contestantFor(id: ArenaBrainId): Promise<Contestant | null> {
  const known = state.contestants.get(id);
  if (known) return known;
  const resolved = resolveContestants((spec) => spec.id === id)
    .then((found) => {
      const mine = found.find((contestant) => contestant.id === id);
      // Why a brain is missing, in words fit for the big screen (never the provider's own error text).
      if (mine && mine.status !== 'ok') reasons.set(id, mine.status === 'not_configured' ? 'no API key on this server' : publicReason(mine.reason));
      return mine?.status === 'ok' ? mine : null;
    })
    .catch(() => null);
  state.contestants.set(id, resolved);
  return resolved;
}

const deadline = (ms: number): Promise<never> => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms));

// GET /api/arena/decide — which brains this server can call right now, and what the live races have cost so far.
export async function GET(): Promise<Response> {
  const ids = ArenaBrainIdSchema.options;
  const ready = await Promise.all(ids.map(async (id) => ({ id, available: (await contestantFor(id)) !== null, ...(reasons.has(id) ? { reason: reasons.get(id) } : {}) })));
  return Response.json({ brains: ready, calls: state.calls, spentUsd: Number(state.spentUsd.toFixed(4)), capUsd: capUsd() }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST /api/arena/decide?model=<id> — BrainQuestion → BrainDecision by that brain. Any failure is an error status:
// the bot's fixed rules then take that one decision and its lane says so.
export async function POST(request: Request): Promise<Response> {
  const model = ArenaBrainIdSchema.safeParse(new URL(request.url).searchParams.get('model'));
  if (!model.success) return apiError(400, 'bad_request', 'model must be one of the live Arena brains');
  const parsed = await parseJsonBody(request, DecideRequestSchema);
  if (!parsed.ok) return parsed.response;

  // Background ghost runs step aside while this is answered (liveTraffic.ts).
  const liveDone = liveDecisionStarted();
  try {
    const fault = jevFaultOf(request);
    if (fault) await decideFault(fault);
    const contestant = await contestantFor(model.data);
    if (!contestant) return apiError(503, 'upstream_error', `${model.data} is not available on this server`);
    if (contestant.price && state.spentUsd >= capUsd()) return apiError(503, 'upstream_error', 'the live Arena spending cap is reached');
    const answer = await Promise.race([contestant.forRun(0)(parsed.data), deadline(ARENA_DECIDE_TIMEOUT_MS)]);
    state.calls += 1;
    if (answer.usage && contestant.price) state.spentUsd += (answer.usage.inputTokens * contestant.price.in + answer.usage.outputTokens * contestant.price.out) / 1e6;
    const decision: BrainDecision = { probabilities: answer.probabilities, selected: answer.choice, policy: 'jev', fallback: false, latencyMs: answer.latencyMs, model: model.data };
    return Response.json(decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Short reason only: never the request, a header or a key.
    console.error(`[arena/decide] ${model.data}: ${message.slice(0, 120)}`);
    return message === 'timeout' || /no answer within|timeout/i.test(message) ? apiError(504, 'upstream_timeout', `${model.data} did not answer in time`) : apiError(502, 'upstream_error', `${model.data} failed`);
  } finally {
    liveDone();
  }
}
