import type { Metadata } from 'next';
import { resolveSiteUrl } from '../leaderboard/_lib/siteUrl';
import { RaceCodeSchema } from '../race/_lib/protocol';
import { RaceScreen } from './RaceScreen';
import { ScreenClient } from './ScreenClient';

export const metadata: Metadata = { title: 'Room Challenge · RivetRun' };
export const dynamic = 'force-dynamic';

interface ScreenPageProps {
  searchParams: Promise<{ room?: string | string[] }>;
}

// /screen — Room Challenge leaderboard. /screen?room=ABCD — that room's Room Race.
export default async function ScreenPage({ searchParams }: ScreenPageProps) {
  const siteUrl = await resolveSiteUrl();
  const room = RaceCodeSchema.safeParse((await searchParams).room);
  if (room.success) return <RaceScreen code={room.data} siteUrl={siteUrl} />;
  return <ScreenClient siteUrl={siteUrl} />;
}
