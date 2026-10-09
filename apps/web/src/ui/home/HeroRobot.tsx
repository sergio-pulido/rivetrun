'use client';

import { WorkshopCanvas } from '@/game';
import { useBuildStore } from '@/state/build';
import { buildName, buildStats } from '@/ui/buildStats';

/** The player's current robot on the turntable, annotated like a blueprint. */
export function HeroRobot() {
  const build = useBuildStore((store) => store.build);
  const stats = buildStats(build);
  return (
    <div className="relative -mx-4 h-[212px]">
      {/* Work-lamp pool so the stage never reads as empty while three.js loads. */}
      <div className="pointer-events-none absolute inset-x-8 bottom-4 top-10 rounded-[50%] bg-[radial-gradient(closest-side,rgb(59_130_196/0.28),transparent)]" />
      <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_80%,transparent)]">
        <WorkshopCanvas build={build} spin={0.5} />
      </div>
      <div className="pointer-events-none absolute left-4 top-2">
        <div className="rr-label !text-blueprint">Fig. 1 · your robot</div>
        <div className="mt-1.5 font-mono text-xs font-bold tracking-wide text-slate-200">{buildName(build).toUpperCase()}</div>
      </div>
      <div className="pointer-events-none absolute right-4 top-2 text-right font-mono text-[11px] leading-relaxed text-dim">
        <div>
          <span className="text-slate-200">€{stats.costEur}</span> parts
        </div>
        <div>
          <span className="text-slate-200">{stats.massKg.toFixed(1)} kg</span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
        <span className="rr-label">drag to spin</span>
      </div>
    </div>
  );
}
