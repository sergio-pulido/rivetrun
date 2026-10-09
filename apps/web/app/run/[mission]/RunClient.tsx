'use client';

import type { ComponentType } from 'react';
import type { Build, GhostTrace, Mission, MissionId } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { RunCanvas } from '@/game';
import type { RunFeed } from '@/game/runFeed';
import { useRunStore } from '@/state/run';
import { RunOverlay } from './RunOverlay';
import { useRun } from './useRun';

/** What the run page hands to the game session's canvas. */
export interface RunCanvasProps {
  readonly mission: Mission;
  readonly build: Build;
  readonly feed: RunFeed;
  readonly ghosts: readonly GhostTrace[];
}

// The scaffold canvas takes no props yet; the real one reads these.
const Canvas = RunCanvas as unknown as ComponentType<RunCanvasProps>;

export function RunClient({ missionId }: { readonly missionId: MissionId }) {
  const mission = MISSIONS[missionId];
  const build = useRunStore((store) => store.build);
  const priority = useRunStore((store) => store.priority);
  const { feed, ghosts, error } = useRun(mission, build, priority);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-ink">
      <Canvas mission={mission} build={build} feed={feed} ghosts={ghosts} />
      <RunOverlay mission={mission} feed={feed} ghosts={ghosts} />
      {error ? (
        <div className="absolute inset-x-4 top-1/2 rounded-lg border border-red-500/60 bg-slate-panel p-4 text-center text-sm text-red-300">
          The run could not start: {error}
        </div>
      ) : null}
    </main>
  );
}
