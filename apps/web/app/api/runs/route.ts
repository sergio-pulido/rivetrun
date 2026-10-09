import { SubmitRunRequestSchema, type SubmitRunResponse } from '@rivetrun/contracts';
import { parseJsonBody } from '@/api/respond';
import { addRun } from '../_lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/runs — submit an Episode. Stored in server memory (lost on restart).
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, SubmitRunRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { id, rank } = addRun(parsed.data.nickname, parsed.data.episode);
  return Response.json({ stored: true, id, rank } satisfies SubmitRunResponse);
}
