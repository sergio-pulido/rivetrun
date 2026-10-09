'use client';

import { useProgressStore } from '@/state/progress';

/** Progression points. */
export function PointsChip() {
  const points = useProgressStore((store) => store.points);
  return (
    <span className="flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-line-2 bg-panel-2 px-3 font-mono text-[13px]" title="Points earned from runs">
      <span className="font-semibold tabular-nums text-orange">{points.toLocaleString('en-US')}</span>
      <span className="text-muted">pts</span>
    </span>
  );
}
