'use client';

import Link from 'next/link';
import { MISSIONS } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { matchPreset } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';

const FIRST = MISSIONS.M1;
const FIRST_LENGTH_M = FIRST.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);

/** Zero choices: straight into mission 01 with whatever robot is on the bench (the All-rounder on a first visit). */
export function PlayNow() {
  const build = useBuildStore((store) => store.build);
  return (
    <Link href={`/run/${FIRST.id}`} className="flex h-[68px] items-center justify-between rounded-2xl bg-orange px-[22px] text-on-orange transition-transform active:scale-[0.98]">
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-2xl font-bold leading-none tracking-[2px]">PLAY NOW</span>
        <span className="text-[13px] font-medium leading-tight">
          Mission 01 · {matchPreset(build) ? 'ready-made robot' : 'your robot'} · {FIRST_LENGTH_M} m
        </span>
      </span>
      <Icon name="next" size={28} />
    </Link>
  );
}
