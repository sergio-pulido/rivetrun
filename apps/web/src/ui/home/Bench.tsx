'use client';

import { POLICY_LABEL } from '@/game/palette';
import { useBuildStore } from '@/state/build';
import { useRunStore } from '@/state/run';
import { buildName } from '@/ui/buildStats';
import { formatSeconds } from '@/ui/format';
import { Bench3D } from '@/ui/three/Bench3D';

interface Readout {
  readonly head: string;
  readonly body: string;
  /** Orange for the player's own business, cyan for the brain's. */
  readonly tone: 'player' | 'brain';
}

/** Jev mode: the brain's last decision in the last run. Drive mode: the rival and, after a run, its time to beat. */
function useReadout(): Readout {
  const mode = useBuildStore((store) => store.mode);
  const result = useRunStore((store) => store.result);
  if (mode === 'drive') {
    const rival = result?.episode.policy === 'human' ? result.ghosts[0] : undefined;
    if (!rival) return { head: 'YOUR RIVAL · JEV', body: 'same robot, same track', tone: 'player' };
    const name = POLICY_LABEL[rival.policy];
    return {
      head: `YOUR RIVAL · ${name}`,
      body: rival.outcome.finished ? `${formatSeconds(rival.outcome.timeS)} s to beat on ${result?.missionId}` : `did not finish ${result?.missionId}`,
      tone: 'player',
    };
  }
  const decision = result?.episode.decisions.at(-1);
  // Since Brain v3 Jev decides on events, not on a clock: no interval to quote here.
  if (!decision) return { head: 'JEV · STANDING BY', body: 'decides on events', tone: 'brain' };
  const probability = decision.probabilities[decision.selected];
  return {
    head: `${decision.fallback ? 'FALLBACK' : POLICY_LABEL[decision.policy]} · ${Math.round(decision.latencyMs)} ms`,
    body: `${decision.selected.replace('_', ' ')}${probability === undefined ? '' : ` ${Math.round(probability * 100)}%`}`,
    tone: 'brain',
  };
}

/** The bench: the player's current robot in 3D, with a readout for the chosen mode pinned beside it. */
export function Bench() {
  const build = useBuildStore((store) => store.build);
  const readout = useReadout();
  return (
    <div className="relative h-[270px] shrink-0 overflow-hidden rounded-[18px] border border-[#262B33] bg-panel">
      <Bench3D build={build} spin={0.5} className="top-6" />
      <span className="pointer-events-none absolute left-[18px] top-4 flex max-w-[40%] flex-col gap-1 font-mono text-[11px] font-medium uppercase leading-none tracking-[1.5px] text-muted">
        <span>Bench</span>
        <span className="truncate text-text-2">{buildName(build)}</span>
      </span>
      <div className={`pointer-events-none absolute right-3.5 top-3.5 flex flex-col gap-0.5 rounded-[10px] border bg-ground px-2.5 py-2 ${readout.tone === 'player' ? 'border-orange' : 'border-cyan'}`}>
        <span className={`font-mono text-[10px] font-medium tracking-[1.5px] ${readout.tone === 'player' ? 'text-orange-soft' : 'text-cyan'}`}>{readout.head}</span>
        <span className="font-mono text-sm font-semibold">{readout.body}</span>
      </div>
    </div>
  );
}
