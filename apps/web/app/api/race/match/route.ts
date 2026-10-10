import { parseWith } from '@/api/respond';
import { MatchRequestSchema } from '../../../race/_lib/protocol';
import { autoRooms, matchRoom } from '../../_lib/raceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/race/match — /play: seat this phone in an auto room (RR-PLAN §5). No room code.
// 200 { code, endsAt, playerId, token, nickname, serverNow } · 503 { error, retryInS } when every room is busy.
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = parseWith(MatchRequestSchema, body ?? {});
  if (!parsed.ok) return parsed.response;
  const result = matchRoom(parsed.data);
  if (!result.ok) return Response.json({ error: result.error, retryInS: result.retryInS }, { status: result.status, headers: { 'Retry-After': String(result.retryInS) } });
  return Response.json(result.data);
}

// GET /api/race/match — the live auto rooms, for the /screen?mode=play grid. `?test=1` lists load-test rooms instead.
export async function GET(request: Request): Promise<Response> {
  const test = new URL(request.url).searchParams.get('test') === '1';
  return Response.json({ rooms: autoRooms({ test }), serverNow: Date.now() });
}
