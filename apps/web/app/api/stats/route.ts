import type { StatsResponse } from '@rivetrun/contracts';
import { episodeCount } from '../_lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/stats — episodes submitted since the server started. In-memory.
export async function GET(): Promise<Response> {
  return Response.json({ episodes: episodeCount() } satisfies StatsResponse);
}
