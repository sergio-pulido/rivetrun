'use client';

import { useBuildStore } from '@/state/build';
import { briefingName } from './BriefTheBrain';

/** Drive mode on the Brief: the two controls, and what the Jev ghost you race was told. */
export function DriveCard() {
  const briefing = useBuildStore((store) => store.briefing);
  const priority = useBuildStore((store) => store.priority);
  const rival = briefingName(briefing) ?? `priority ${Math.round(priority * 100)} % safety`;
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-[#3A2A1C] bg-[#17120D] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold leading-none text-orange">You drive</h2>
        <span className="text-right text-[11px] leading-tight text-[#B8C0C9]">One thumb. Let go to coast.</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5" aria-label="Controls">
        <div className="flex h-[58px] flex-col justify-center rounded-[10px] border border-line-3 px-3">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-muted">HOLD LEFT</span>
          <span className="font-display text-[15px] font-semibold">Brake</span>
        </div>
        <div className="flex h-[58px] flex-col justify-center rounded-[10px] border border-orange bg-orange-deep px-3">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">HOLD RIGHT</span>
          <span className="font-display text-[15px] font-semibold">Go</span>
        </div>
      </div>
      <p className="text-xs leading-snug text-[#B8C0C9]">
        The ghost is <span className="font-mono text-cyan">JEV</span> on this same robot and seed, driving with <span className="text-text">{rival}</span>. Change its orders in Jev mode.
      </p>
    </section>
  );
}
