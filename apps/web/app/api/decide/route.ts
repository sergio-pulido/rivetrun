import { DecideRequestSchema } from '@rivetrun/contracts';
import { notImplemented, parseJsonBody } from '@/api/respond';

export const runtime = 'nodejs';

// POST /api/decide — BrainQuestion → BrainDecision. Scaffold: validates, then 501.
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, DecideRequestSchema);
  if (!parsed.ok) return parsed.response;
  return notImplemented('POST /api/decide');
}
