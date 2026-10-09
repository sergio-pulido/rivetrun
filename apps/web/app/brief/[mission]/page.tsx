import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MISSIONS } from '@rivetrun/sim';
import { Placeholder } from '@/ui/Placeholder';
import { parseMissionParam } from '@/ui/missionParam';

interface BriefPageProps {
  params: Promise<{ mission: string }>;
}

export default async function BriefPage({ params }: BriefPageProps) {
  const missionId = parseMissionParam((await params).mission);
  if (!missionId) notFound();
  const mission = MISSIONS[missionId];

  return (
    <Placeholder title={`${mission.id} · ${mission.name}`} note={mission.description}>
      <p className="font-mono text-xs text-slate-400">
        Weather: {mission.weather} · {mission.track.segments.map((s) => s.terrain).join(' → ')}
      </p>
      <Link
        href={`/run/${mission.id}`}
        className="flex min-h-14 items-center justify-center rounded-lg bg-safety text-lg font-bold text-slate-ink"
      >
        Deploy
      </Link>
    </Placeholder>
  );
}
