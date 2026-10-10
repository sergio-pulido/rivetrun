import { apiError, parseJsonBody, parseWith } from '@/api/respond';
import { PickRequestSchema, RaceCodeSchema } from '../../../../race/_lib/protocol';
import { pickInRoom } from '../../../_lib/raceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/race/[code]/pick — /play: a phone's vehicle, agent and strategy (a PlayerPick). The last one sent stands;
// the server resolves the briefing and the priority, so a phone never sends free text.
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const code = parseWith(RaceCodeSchema, (await params).code);
  if (!code.ok) return code.response;
  const body = await parseJsonBody(request, PickRequestSchema);
  if (!body.ok) return body.response;
  const result = pickInRoom(code.data, body.data.playerId, body.data.token, body.data.pick, body.data.ready !== false);
  if (!result.ok) return apiError(result.status, 'bad_request', result.error);
  return Response.json({ ok: true });
}
