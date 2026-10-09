import { LeaderboardQuerySchema } from '@rivetrun/contracts';
import { notImplemented, parseWith } from '@/api/respond';

export const runtime = 'nodejs';

// GET /api/leaderboard?mission=M5 — top 20, best per nickname. Scaffold: validates, then 501.
export async function GET(request: Request): Promise<Response> {
  const mission = new URL(request.url).searchParams.get('mission') ?? undefined;
  const parsed = parseWith(LeaderboardQuerySchema, { mission });
  if (!parsed.ok) return parsed.response;
  return notImplemented('GET /api/leaderboard');
}
