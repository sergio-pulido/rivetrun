'use client';

import { TUNING } from '@rivetrun/sim';
import { WorkshopCanvas } from '@/game';
import { POLICY_LABEL } from '@/game/palette';
import { useBuildStore } from '@/state/build';
import { useRunStore } from '@/state/run';
import { buildName } from '@/ui/buildStats';

/** The last decision of the last run, when there is one in memory. */
function useLastDecision(): { head: string; body: string } {
  const decision = useRunStore((store) => store.result?.episode.decisions.at(-1));
  if (!decision) return { head: 'JEV · STANDING BY', body: `decides every ${TUNING.decision.intervalS} s` };
  const probability = decision.probabilities[decision.selected];
  return {
    head: `${decision.fallback ? 'FALLBACK' : POLICY_LABEL[decision.policy]} · ${Math.round(decision.latencyMs)} ms`,
    body: `${decision.selected.replace('_', ' ')}${probability === undefined ? '' : ` ${Math.round(probability * 100)}%`}`,
  };
}

/** The bench: the player's current robot in 3D, with the brain's last call pinned beside it. */
export function Bench() {
  const build = useBuildStore((store) => store.build);
  const last = useLastDecision();
  return (
    <div className="relative h-[270px] shrink-0 overflow-hidden rounded-[18px] border border-[#262B33] bg-panel">
      <span className="rr-label rr-blink pointer-events-none absolute inset-0 grid place-items-center">Powering up the bench</span>
      <div className="absolute inset-0 top-6">
        <WorkshopCanvas build={build} spin={0.5} />
      </div>
      <span className="pointer-events-none absolute left-[18px] top-4 max-w-[45%] font-mono text-[11px] font-medium uppercase leading-snug tracking-[1.5px] text-muted">
        Bench · {buildName(build)}
      </span>
      <div className="pointer-events-none absolute right-3.5 top-3.5 flex flex-col gap-0.5 rounded-[10px] border border-cyan bg-ground px-2.5 py-2" title="The brain's last decision in your last run">
        <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-cyan">{last.head}</span>
        <span className="font-mono text-sm font-semibold">{last.body}</span>
      </div>
    </div>
  );
}
