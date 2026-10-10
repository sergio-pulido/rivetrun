'use client';

import Link from 'next/link';
import type { MissionId } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { buildStats } from '@/ui/buildStats';
import { PlayLink } from '@/ui/coach/PlayLink';
import { Icon } from '@/ui/Icon';
import { useRivalPrefetch } from '@/ui/useRivalPrefetch';

const BUTTON = 'flex h-[68px] items-center justify-between rounded-2xl bg-orange px-[22px] text-on-orange transition-transform active:scale-[0.98]';

/** PLAY NOW as the way into /play: the robot, the brain and the plan are picked there, in the room's 30 seconds. */
export function PlayNowPicker({ missionId }: { readonly missionId?: MissionId }) {
  return (
    // The Play mission goes with the link, so /play opens with it highlighted and one tap continues.
    <Link href={missionId ? `/play?mission=${missionId}` : '/play'} className={BUTTON} data-testid="home-play">
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-2xl font-bold leading-none tracking-[2px]">PLAY NOW</span>
        <span className="text-[13px] font-medium leading-tight">Pick a robot, a brain and a plan · 30 s</span>
      </span>
      <Icon name="next" size={28} />
    </Link>
  );
}

/** Zero choices: straight into one mission with the robot on the bench (the All-rounder on a first visit), in the chosen mode (Drive by default). */
export function PlayNow({ missionId = 'M1' }: { readonly missionId?: MissionId }) {
  const FIRST = MISSIONS[missionId];
  const FIRST_LENGTH_M = FIRST.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  const build = useBuildStore((store) => store.build);
  const mode = useBuildStore((store) => store.mode);
  // Play Now skips the Brief, so the Jev ghost for this mission is requested from here.
  useRivalPrefetch(FIRST);
  const overBudgetEur = buildStats(build).overBudgetEur;
  // The sim does not check the budget, so every way into a run has to.
  if (overBudgetEur > 0) {
    return (
      <Link href="/workshop" className="flex h-[68px] items-center justify-between rounded-2xl border border-line-3 bg-panel-2 px-[22px] transition-transform active:scale-[0.98]">
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-xl font-bold leading-none tracking-[1px] text-bad">OVER BUDGET BY €{overBudgetEur}</span>
          <span className="text-[13px] font-medium leading-tight text-text-2">Fix your robot in the Workshop to play</span>
        </span>
        <Icon name="wrench" size={24} />
      </Link>
    );
  }
  return (
    <PlayLink href={`/run/${FIRST.id}`} className={BUTTON}>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-2xl font-bold leading-none tracking-[2px]">PLAY NOW</span>
        <span className="text-[13px] font-medium leading-tight">
          Mission 0{FIRST.id.slice(1)} · {mode === 'drive' ? 'you drive' : 'Jev drives'} · {FIRST_LENGTH_M} m
        </span>
      </span>
      <Icon name="next" size={28} />
    </PlayLink>
  );
}
