import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readRoom } from '../api/_lib/raceStore';
import { RaceCodeSchema } from './_lib/protocol';
import { JoinByCode } from './JoinByCode';

export const metadata: Metadata = { title: 'Room Race · RivetRun' };
export const dynamic = 'force-dynamic';

interface RaceIndexPageProps {
  searchParams: Promise<{ code?: string | string[] }>;
}

// /race — the code form. /race?code=ABCD (the form's own GET) — validated here, then redirected to the room.
export default async function RaceIndexPage({ searchParams }: RaceIndexPageProps) {
  const raw = (await searchParams).code;
  const typed = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 12);
  if (typed === undefined) return <JoinByCode />;

  const parsed = RaceCodeSchema.safeParse(typed);
  if (!parsed.success) {
    return <JoinByCode code={typed} error="A room code is 4 letters, like ABCD. Check the big screen and try again." />;
  }
  if (!readRoom(parsed.data)) {
    return <JoinByCode code={parsed.data} error={`There is no open room ${parsed.data}. Check the four letters on the big screen.`} />;
  }
  redirect(`/race/${parsed.data}`);
}
