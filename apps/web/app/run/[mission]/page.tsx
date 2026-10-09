import { notFound } from 'next/navigation';
import { parseMissionParam } from '@/ui/missionParam';
import { RunClient } from './RunClient';

interface RunPageProps {
  params: Promise<{ mission: string }>;
}

export default async function RunPage({ params }: RunPageProps) {
  const missionId = parseMissionParam((await params).mission);
  if (!missionId) notFound();
  return <RunClient missionId={missionId} />;
}
