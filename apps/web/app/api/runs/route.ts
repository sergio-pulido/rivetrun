import { SubmitRunRequestSchema } from '@rivetrun/contracts';
import { notImplemented, parseJsonBody } from '@/api/respond';

export const runtime = 'nodejs';

// POST /api/runs — submit an Episode. Scaffold: validates, then 501.
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, SubmitRunRequestSchema);
  if (!parsed.ok) return parsed.response;
  return notImplemented('POST /api/runs');
}
