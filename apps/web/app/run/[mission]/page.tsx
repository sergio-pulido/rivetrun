import { notFound } from 'next/navigation';
import { MISSIONS } from '@rivetrun/sim';
import { RunCanvas } from '@/game';
import { parseMissionParam } from '@/ui/missionParam';

interface RunPageProps {
  params: Promise<{ mission: string }>;
}

export default async function RunPage({ params }: RunPageProps) {
  const missionId = parseMissionParam((await params).mission);
  if (!missionId) notFound();
  const mission = MISSIONS[missionId];

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <RunCanvas />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3 font-mono text-xs">
        <span className="rounded bg-slate-panel/80 px-2 py-1 text-safety">
          {mission.id} · {mission.name}
        </span>
        <span className="rounded bg-slate-panel/80 px-2 py-1 text-slate-400">placeholder run</span>
      </div>
    </main>
  );
}
