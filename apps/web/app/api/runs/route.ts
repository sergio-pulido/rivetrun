import { SubmitRunRequestSchema, type SubmitRunResponse } from '@rivetrun/contracts';
import { apiError, parseJsonBody } from '@/api/respond';
import { recordHumanRun } from '../_lib/humanArena';
import { addRun } from '../_lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/runs — submit an Episode. Stored in server memory (lost on restart).
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, SubmitRunRequestSchema);
  if (!parsed.ok) return parsed.response;
  // A Drive run is replayed from its input log (humanArena.ts). One that replays to a different result is refused:
  // the posted time and score are not what that log produces. One that cannot be replayed is stored as before.
  if (parsed.data.episode.policy === 'human') {
    const check = recordHumanRun(parsed.data.nickname, parsed.data.episode);
    if (check.verdict === 'mismatch') return apiError(422, 'bad_request', `Run not accepted: ${check.reason}.`);
  }
  const { id, rank } = addRun(parsed.data.nickname, parsed.data.episode);
  return Response.json({ stored: true, id, rank } satisfies SubmitRunResponse);
}
