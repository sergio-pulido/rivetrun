import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readRoom } from '../../api/_lib/raceStore';
import { RaceCodeSchema } from '../_lib/protocol';
import { RaceClient } from './RaceClient';

export const metadata: Metadata = { title: 'Room Race · RivetRun' };
export const dynamic = 'force-dynamic';

export default async function RacePage({ params }: { params: Promise<{ code: string }> }) {
  const raw = (await params).code;
  const code = RaceCodeSchema.safeParse(raw);
  // A bad or closed code goes back to the form, which explains what is wrong without any client code.
  if (!code.success) redirect(`/race?code=${encodeURIComponent(raw.slice(0, 12))}`);
  const room = readRoom(code.data);
  if (!room) redirect(`/race?code=${code.data}`);
  // The first snapshot ships with the page, so the room renders as soon as it hydrates.
  return <RaceClient code={code.data} initial={room.snapshot} />;
}
