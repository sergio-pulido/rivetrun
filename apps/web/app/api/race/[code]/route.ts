import { apiError, parseJsonBody, parseWith } from '@/api/respond';
import { RaceActionSchema, RaceCodeSchema } from '../../../race/_lib/protocol';
import { applyAction, readRoom } from '../../_lib/raceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// GET /api/race/[code] — current snapshot.
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const code = parseWith(RaceCodeSchema, (await params).code);
  if (!code.ok) return code.response;
  const room = readRoom(code.data);
  return room ? Response.json(room.snapshot) : apiError(404, 'bad_request', 'No such room.');
}

// POST /api/race/[code] — join | start | reset | state (5 Hz from every phone).
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const code = parseWith(RaceCodeSchema, (await params).code);
  if (!code.ok) return code.response;
  const action = await parseJsonBody(request, RaceActionSchema);
  if (!action.ok) return action.response;
  const result = applyAction(code.data, action.data);
  if (!result.ok) return apiError(result.status, 'bad_request', result.error);
  return Response.json(result.data ?? { ok: true });
}
