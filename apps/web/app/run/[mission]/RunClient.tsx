'use client';

import type { MissionId } from '@rivetrun/contracts';
import { useEffect, useMemo } from 'react';
import { MISSIONS, PRESETS, assessBuild } from '@rivetrun/sim';
import { RunCanvas } from '@/game';
import { useMissionAmbience } from '@/game/audio/samples';
import { useBuildStore } from '@/state/build';
import { personalBestTrace } from '@/state/personalBests';
import { useRunStore } from '@/state/run';
import { useRun } from './useRun';

export function RunClient({ missionId }: { readonly missionId: MissionId }) {
  const mission = MISSIONS[missionId];
  useMissionAmbience(mission); // RR-SOUND: the place's recorded ambience, quiet on a phone; silent when the pack has no file
  const build = useRunStore((store) => store.build);
  const priority = useRunStore((store) => store.priority);
  const briefing = useBuildStore((store) => store.briefing);
  const mode = useBuildStore((store) => store.mode);
  const rival = useBuildStore((store) => store.rival);
  // "Beat your ghost": the player's stored best with this robot on this mission. None stored = the Jev rival as usual.
  const rivalTrace = useMemo(() => (mode === 'drive' && rival === 'self' ? personalBestTrace(mission.id, build) : null), [mode, rival, mission.id, build]);
  const { feed, ghosts, drive, error, onSceneReady } = useRun({ mission, build, priority, briefing, mode, rivalTrace });

  // Dev only: lets QA time the strategy layer in a real browser (window.__rivetrunSim.assessBuild).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __rivetrunSim?: unknown }).__rivetrunSim = { assessBuild, MISSIONS, PRESETS };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-ink">
      <RunCanvas mission={mission} build={build} feed={feed} ghosts={ghosts} drive={drive} onReady={onSceneReady} />
      {error ? (
        <div className="absolute inset-x-4 top-1/2 rounded-lg border border-red-500/60 bg-slate-panel p-4 text-center text-sm text-red-300">
          The run could not start: {error}
        </div>
      ) : null}
    </main>
  );
}
