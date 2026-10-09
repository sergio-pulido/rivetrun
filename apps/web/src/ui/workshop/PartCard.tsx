'use client';

import type { Part } from '@rivetrun/contracts';
import { Icon } from '@/ui/Icon';
import { specLine } from './slots';

interface PartCardProps {
  readonly part: Part;
  readonly selected: boolean;
  readonly locked: boolean;
  readonly affordable: boolean;
  readonly onTap: (part: Part) => void;
}

/** One part on the shelf: fitted (orange), available, or locked behind points. */
export function PartCard({ part, selected, locked, affordable, onTap }: PartCardProps) {
  const frame = selected
    ? 'border-safety bg-safety/10 shadow-[0_0_0_1px_var(--color-safety),0_8px_22px_-10px_rgb(255_106_19/0.7)]'
    : locked
      ? 'border-dashed border-slate-line bg-slate-deep/50'
      : 'border-slate-line bg-slate-panel/90';
  return (
    <button
      type="button"
      onClick={() => onTap(part)}
      aria-pressed={selected}
      className={`flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-[transform,background-color,border-color] duration-150 active:translate-y-0.5 ${frame}`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
          selected ? 'border-safety bg-safety text-slate-deep' : locked ? 'border-slate-line text-dim' : 'border-slate-line text-transparent'
        }`}
      >
        <Icon name={locked ? 'lock' : 'check'} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[15px] font-semibold ${locked ? 'text-slate-400' : ''}`}>{part.name}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-slate-200">€{part.costEur}</span>
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-dim">{part.blurb}</span>
        <span className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-dim">
          <span className="truncate text-blueprint">{specLine(part)}</span>
          <span className="shrink-0 tabular-nums">
            {part.massKg} kg{part.powerW > 0 ? ` · ${part.powerW} W` : ''}
          </span>
        </span>
        {locked ? (
          <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] font-bold ${affordable ? 'bg-safety text-slate-deep' : 'bg-slate-line text-slate-300'}`}>
            <Icon name="bolt" size={11} />
            {affordable ? `Tap to unlock · ${part.unlockPoints} pts` : `Locked · ${part.unlockPoints} pts`}
          </span>
        ) : null}
      </span>
    </button>
  );
}
