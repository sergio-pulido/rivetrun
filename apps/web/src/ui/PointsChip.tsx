'use client';

import { useProgressStore } from '@/state/progress';
import { Icon } from './Icon';

/** Progression points, top right of every screen. */
export function PointsChip() {
  const points = useProgressStore((store) => store.points);
  return (
    <span className="rr-chip shrink-0 !border-safety/40 !text-safety-hi" title="Points earned from runs">
      <Icon name="bolt" size={13} />
      <span className="tabular-nums">{points.toLocaleString('en-US')}</span>
      <span className="text-dim">pts</span>
    </span>
  );
}
