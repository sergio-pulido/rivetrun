import type { Metadata } from 'next';
import { resolveSiteUrl } from '../leaderboard/_lib/siteUrl';
import { RaceCodeSchema } from '../race/_lib/protocol';
import { RaceScreen } from './RaceScreen';
import { ScreenClient } from './ScreenClient';

export const metadata: Metadata = { title: 'Room Challenge · RivetRun' };
export const dynamic = 'force-dynamic';

interface ScreenPageProps {
  searchParams: Promise<{ room?: string | string[]; arena?: string | string[] }>;
}

// /screen — Room Challenge leaderboard. /screen?room=ABCD — that room's Room Race. Add &arena=1 for the live Arena race.
export default async function ScreenPage({ searchParams }: ScreenPageProps) {
  const siteUrl = await resolveSiteUrl();
  const params = await searchParams;
  const room = RaceCodeSchema.safeParse(params.room);
  // ?arena=1: the host bar offers one bot per brain (the live Arena race) instead of JEV bots.
  if (room.success) return <RaceScreen code={room.data} siteUrl={siteUrl} arena={params.arena === '1'} />;
  return <ScreenClient siteUrl={siteUrl} />;
}
