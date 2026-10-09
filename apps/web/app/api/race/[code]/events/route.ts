import { apiError, parseWith } from '@/api/respond';
import { RaceCodeSchema } from '../../../../race/_lib/protocol';
import { readRoom } from '../../../_lib/raceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How often each stream checks the room for changes. */
const TICK_MS = 100;
/** A snapshot goes out at least this often, so clients can tell a quiet room from a dead stream. */
const HEARTBEAT_MS = 2000;

// GET /api/race/[code]/events — Server-Sent Events: one `data:` line with the full snapshot per change.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const code = parseWith(RaceCodeSchema, (await params).code);
  if (!code.ok) return code.response;
  if (!readRoom(code.data)) return apiError(404, 'bad_request', 'No such room.');

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let sentVersion = -1;
      let sentAt = 0;
      const close = (): void => {
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      const tick = (): void => {
        const room = readRoom(code.data);
        if (!room) {
          controller.enqueue(encoder.encode('event: gone\ndata: {}\n\n'));
          close();
          return;
        }
        const now = Date.now();
        if (room.version === sentVersion && now - sentAt < HEARTBEAT_MS) return;
        sentVersion = room.version;
        sentAt = now;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(room.snapshot)}\n\n`));
      };
      tick();
      timer = setInterval(tick, TICK_MS);
      request.signal.addEventListener('abort', close);
    },
    cancel() {
      if (timer !== undefined) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
