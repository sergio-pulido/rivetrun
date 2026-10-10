import { z } from 'zod';
import { apiError, parseJsonBody } from '@/api/respond';
import { isPublicRequest, publicGuardStatus, setPublicAi } from '../../_lib/publicGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// RR-GUARD kill switch, for the presenter's machine only (a request that came to localhost, not through the tunnel).
//   curl -s localhost:3001/api/admin/public-ai                                   spend and what is left
//   curl -s -X POST localhost:3001/api/admin/public-ai -H 'content-type: application/json' -d '{"on":false}'
// Off = no visitor request makes a live AI call: cached runs and the fixed rules only. No restart needed.
const refuse = (): Response => apiError(403, 'bad_request', 'this route answers on the presenter machine only');

export function GET(request: Request): Response {
  if (isPublicRequest(request)) return refuse();
  return Response.json(publicGuardStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  if (isPublicRequest(request)) return refuse();
  const parsed = await parseJsonBody(request, z.object({ on: z.boolean() }));
  if (!parsed.ok) return parsed.response;
  setPublicAi(parsed.data.on);
  return Response.json(publicGuardStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
