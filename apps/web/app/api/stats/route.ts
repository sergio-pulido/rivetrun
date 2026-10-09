import { notImplemented } from '@/api/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/stats — episode count. Scaffold: 501.
export async function GET(): Promise<Response> {
  return notImplemented('GET /api/stats');
}
