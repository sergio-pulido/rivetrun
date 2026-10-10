'use client';

import { useEffect, useState } from 'react';
import type { MissionId } from '@rivetrun/contracts';
import { useBuildStore } from '@/state/build';
import { personalBestTrace, usePersonalBestsStore } from '@/state/personalBests';
import { Icon } from '@/ui/Icon';
import { briefingName } from './BriefTheBrain';

/** Drive mode on the Brief: the two sliders, and who the ghost you race is (Jev with its orders, or your own best run). */
interface DriveCardProps {
  readonly missionId: MissionId;
  /** The sim's warning for a player who would just hold the throttle here, with what to do instead. */
  readonly tip?: string | null;
}

export function DriveCard({ missionId, tip = null }: DriveCardProps) {
  const build = useBuildStore((store) => store.build);
  const briefing = useBuildStore((store) => store.briefing);
  const priority = useBuildStore((store) => store.priority);
  const rival = useBuildStore((store) => store.rival);
  const bests = usePersonalBestsStore((store) => store.bests);
  // The run races your own ghost only when one is stored for this robot on this mission; otherwise it is Jev.
  const [ownGhost, setOwnGhost] = useState(false);
  useEffect(() => setOwnGhost(rival === 'self' && personalBestTrace(missionId, build) !== null), [rival, missionId, build, bests]);
  const orders = briefingName(briefing) ?? `priority ${Math.round(priority * 100)} % safety`;
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-[#3A2A1C] bg-[#17120D] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold leading-none text-orange">You drive</h2>
        <span className="text-right text-[11px] leading-tight text-[#B8C0C9]">Two sliders. Let go to coast.</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5" aria-label="Controls">
        <div className="flex h-[58px] flex-col justify-center rounded-[10px] border border-line-3 px-3">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-muted">SLIDE UP · LEFT</span>
          <span className="font-display text-[15px] font-semibold">Brake</span>
        </div>
        <div className="flex h-[58px] flex-col justify-center rounded-[10px] border border-orange bg-orange-deep px-3">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">SLIDE UP · RIGHT</span>
          <span className="font-display text-[15px] font-semibold">Throttle</span>
        </div>
      </div>
      {tip ? (
        <p role="status" className="flex items-start gap-2 rounded-[10px] border border-warn/50 px-2.5 py-2 text-xs leading-snug text-warn">
          <Icon name="warn" size={14} className="mt-px shrink-0" />
          {tip}
        </p>
      ) : null}
      <p className="text-xs leading-snug text-[#B8C0C9]">
        {ownGhost ? (
          <>
            The ghost is <span className="font-mono text-orange-soft">YOUR BEST RUN</span> with this robot on this mission.
          </>
        ) : (
          <>
            The ghost is <span className="font-mono text-cyan">JEV</span> on this same robot and seed, driving with <span className="text-text">{orders}</span>. Change its orders in Jev mode.
          </>
        )}
      </p>
    </section>
  );
}
