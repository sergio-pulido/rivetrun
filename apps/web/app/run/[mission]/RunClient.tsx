'use client';

import type { MissionId } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { RunCanvas } from '@/game';
import { useBuildStore } from '@/state/build';
import { useRunStore } from '@/state/run';
import { useRun } from './useRun';

export function RunClient({ missionId }: { readonly missionId: MissionId }) {
  const mission = MISSIONS[missionId];
  const build = useRunStore((store) => store.build);
  const priority = useRunStore((store) => store.priority);
  const briefing = useBuildStore((store) => store.briefing);
  const { feed, ghosts, error } = useRun(mission, build, priority, briefing);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-ink">
      <RunCanvas mission={mission} build={build} feed={feed} ghosts={ghosts} />
      {error ? (
        <div className="absolute inset-x-4 top-1/2 rounded-lg border border-red-500/60 bg-slate-panel p-4 text-center text-sm text-red-300">
          The run could not start: {error}
        </div>
      ) : null}
    </main>
  );
}
