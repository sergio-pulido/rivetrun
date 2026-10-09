import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RaceCodeSchema } from '../_lib/protocol';
import { RaceClient } from './RaceClient';

export const metadata: Metadata = { title: 'Room Race · RivetRun' };

export default async function RacePage({ params }: { params: Promise<{ code: string }> }) {
  const code = RaceCodeSchema.safeParse((await params).code);
  if (!code.success) notFound();
  return <RaceClient code={code.data} />;
}
