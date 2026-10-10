'use client';

import Link from 'next/link';
import type { Part } from '@rivetrun/contracts';
import { Icon } from '@/ui/Icon';
import { PartGlyph } from './PartGlyph';
import { effectLine } from './partInfo';

interface PartCardProps {
  readonly part: Part;
  /** Who makes the real component the part stands for, e.g. "Pololu". */
  readonly model: string | null;
  readonly equipped: boolean;
  readonly locked: boolean;
  readonly affordable: boolean;
  /** Swap the part in (or unlock it when locked). */
  readonly onAct: (part: Part) => void;
}

/** One part on the shelf. The card opens the part sheet; the strip at the bottom acts on the build. */
export function PartCard({ part, model, equipped, locked, affordable, onAct }: PartCardProps) {
  const frame = equipped ? 'border-cyan bg-[#10181C]' : locked ? 'border-dashed border-line-3 bg-[#111418]' : 'border-line-2 bg-panel-3';
  return (
    <div className={`flex h-[166px] flex-col rounded-[14px] border p-2.5 ${frame}`}>
      <Link href={`/workshop/part/${part.id}`} className="flex min-h-0 flex-1 flex-col gap-1" aria-label={`${part.name}: details`}>
        <span className={`flex h-[54px] items-center justify-center ${locked ? 'opacity-75' : ''}`}>
          <PartGlyph id={part.id} width={88} />
        </span>
        <span className="flex items-baseline justify-between gap-1">
          <span className="truncate font-display text-[15px] font-semibold leading-tight">{part.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted">€{part.costEur}</span>
        </span>
        <span className="truncate font-mono text-[10px] text-muted">{model ?? part.slot}</span>
        <span className="truncate text-xs text-text-2">{effectLine(part)}</span>
      </Link>
      {equipped ? (
        <span className="mt-auto flex h-[30px] items-center font-mono text-[10px] font-medium tracking-[1px] text-cyan">● EQUIPPED</span>
      ) : locked ? (
        <button
          type="button"
          onClick={() => onAct(part)}
          className={`mt-auto flex h-[30px] items-center gap-1.5 rounded-lg font-mono text-[10px] font-medium tracking-[1px] ${
            affordable ? 'justify-center border border-orange text-orange-soft' : 'text-muted'
          }`}
        >
          <Icon name="lock" size={12} />
          {affordable ? `UNLOCK · ${part.unlockPoints} PTS` : `${part.unlockPoints} PTS`}
        </button>
      ) : (
        <button type="button" onClick={() => onAct(part)} className="mt-auto h-[30px] rounded-lg border border-orange font-mono text-[11px] font-medium tracking-[1px] text-orange-soft active:bg-orange-deep">
          + SWAP IN
        </button>
      )}
    </div>
  );
}
