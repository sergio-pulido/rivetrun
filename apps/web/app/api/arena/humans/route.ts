import { humanArena } from '../../_lib/humanArena';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/arena/humans — the best human per mission, for a "Human" row next to the brains (docs/BRAIN_ARENA.md).
// Only Drive runs the server replayed from their input log and reproduced. In memory.
export function GET(): Response {
  return Response.json(humanArena(), { headers: { 'Cache-Control': 'no-store' } });
}
