import { LeaderboardQuerySchema, type LeaderboardResponse } from '@rivetrun/contracts';
import { parseWith } from '@/api/respond';
import { leaderboard } from '../_lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/leaderboard?mission=M5 — top 20, best per nickname. In-memory.
export async function GET(request: Request): Promise<Response> {
  const mission = new URL(request.url).searchParams.get('mission') ?? undefined;
  const parsed = parseWith(LeaderboardQuerySchema, { mission });
  if (!parsed.ok) return parsed.response;
  const missionId = parsed.data.mission;
  return Response.json({ missionId, entries: leaderboard(missionId) } satisfies LeaderboardResponse);
}
