import { MissionIdSchema } from '@rivetrun/contracts';
import { z } from 'zod';
import { parseWith } from '@/api/respond';
import { createRoom } from '../_lib/raceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateRoomSchema = z.object({ missionId: MissionIdSchema.default('M5') });

// POST /api/race — create a Room Race room. Returns its first snapshot (4-letter code inside).
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = parseWith(CreateRoomSchema, body ?? {});
  if (!parsed.ok) return parsed.response;
  return Response.json(createRoom(parsed.data.missionId));
}
