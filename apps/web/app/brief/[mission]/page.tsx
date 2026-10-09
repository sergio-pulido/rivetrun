import { notFound } from 'next/navigation';
import { Brief } from '@/ui/brief/Brief';
import { parseMissionParam } from '@/ui/missionParam';

interface BriefPageProps {
  params: Promise<{ mission: string }>;
}

export default async function BriefPage({ params }: BriefPageProps) {
  const missionId = parseMissionParam((await params).mission);
  if (!missionId) notFound();
  return <Brief missionId={missionId} />;
}
