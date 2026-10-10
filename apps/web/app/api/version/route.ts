import { GAMEPLAY_VERSION } from '@rivetrun/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/version — which commit this server was built from. `pnpm demo:stable` bakes the commit and the ref
// (e.g. a demo-good-* tag) into the build; on the dev server both are null.
export async function GET(): Promise<Response> {
  return Response.json({
    commit: process.env.NEXT_PUBLIC_DEMO_COMMIT ?? null,
    ref: process.env.NEXT_PUBLIC_DEMO_REF ?? null,
    gameplayVersion: GAMEPLAY_VERSION,
  });
}
