'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Part } from '@rivetrun/contracts';
import { useBuildStore } from '@/state/build';
import { isUnlocked, useProgressStore } from '@/state/progress';
import { useWorkshopUi } from '@/state/workshop';
import { Icon } from '@/ui/Icon';
import { PartCanvas } from '@/ui/three';
import { PartGlyph } from './PartGlyph';
import { brainGets, specTiles } from './partInfo';
import type { RealPartView } from './realParts';
import { SLOTS, fitted, isRemovable, partsIn, withPart } from './slots';

const SLOT_NAME = { locomotion: 'Drive', motor: 'Motor', battery: 'Battery', sensor: 'Sensor', extra: 'Extra' } as const;

/** REAL PART: the maker hardware the part stands for. Reference only; none of it feeds the game. */
function RealPart({ real }: { readonly real: RealPartView }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[14px] border border-line-2 bg-panel-3 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="rr-label !text-orange-soft">Real part</h2>
        <span className="font-mono text-[10px] font-medium uppercase text-muted">
          {real.price}
          {real.priceUnit ? ` · ${real.priceUnit}` : ''}
        </span>
      </div>
      <div>
        <h3 className="font-display text-[15px] font-semibold leading-snug">{real.realClass}</h3>
        <p className="mt-1 text-[13px] leading-snug text-[#D7DBE0]">{real.oneLiner}</p>
      </div>
      {real.specs.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-y border-tag py-2">
          {real.specs.map((spec) => (
            <div key={spec.label} className="flex items-baseline justify-between gap-2">
              <dt className="shrink-0 text-xs text-muted">{spec.label}</dt>
              <dd className="truncate text-right font-mono text-xs font-semibold" title={spec.value}>
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {real.worksWith.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Works with">
          {real.worksWith.map((board) => (
            <li key={board.text} className={`rr-tag !whitespace-normal ${board.direct ? '' : 'border border-dashed border-line-3 !bg-transparent text-[#8A929C]'}`}>
              {board.text}
            </li>
          ))}
        </ul>
      ) : null}
      {real.note ? <p className="text-[11px] leading-snug text-muted">{real.note}</p> : null}
      <a href={real.shopUrl} target="_blank" rel="noopener noreferrer" className="rr-btn !min-h-10 !rounded-[10px] border border-line-3 !text-[13px]" title={`Web search: ${real.shopQuery}`}>
        Find it in shops
        <Icon name="external" size={14} />
      </a>
      {real.sources.length > 0 ? (
        <p className="text-[11px] leading-relaxed text-faint">
          Sources:{' '}
          {real.sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 ? ' · ' : ''}
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-cyan-muted underline decoration-cyan-line underline-offset-2">
                {source.name}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

/** The part sheet: the part in 3D, what it changes for the brain, its specs, and the real hardware behind it. */
interface PartSheetProps {
  /** The game's part: every gameplay number on the sheet comes from here. */
  readonly part: Part;
  /** The real maker hardware it stands for; null when the reference file has no entry. */
  readonly real: RealPartView | null;
}

export function PartSheet({ part, real }: PartSheetProps) {
  const router = useRouter();
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const unlock = useProgressStore((store) => store.unlock);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const gets = brainGets(part);
  const shelf = partsIn(part.slot);
  const equipped = fitted(build, part.slot).includes(part.id);
  const locked = !isUnlocked(unlocked, part.id);
  const slotMax = SLOTS.find((slot) => slot.slot === part.slot)?.max ?? 1;

  // Closing the sheet lands on the shelf this part belongs to.
  useEffect(() => setSlot(part.slot), [part.slot, setSlot]);

  const equip = (): void => {
    if (locked && !unlock(part.id)) {
      setNotice(`Needs ${part.unlockPoints - points} more points. Finish runs to earn them.`);
      return;
    }
    if (!equipped) setBuild(withPart(build, part));
    router.push('/workshop');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-3 px-4 pt-[max(18px,env(safe-area-inset-top))]">
      <header className="flex h-11 shrink-0 items-center justify-between">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[2px] text-cyan">
          {SLOT_NAME[part.slot]} · {shelf.findIndex((other) => other.id === part.id) + 1} of {shelf.length}
        </span>
        <Link href="/workshop" aria-label="Close" className="rr-iconbtn">
          <Icon name="close" />
        </Link>
      </header>

      <section className="rr-stage h-[230px] shrink-0 !bg-stage [background-size:16px_16px]">
        {ready ? null : (
          <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-25">
            <PartGlyph id={part.id} width={220} />
          </div>
        )}
        <div className="absolute inset-0">
          <PartCanvas part={part} onReady={() => setReady(true)} />
        </div>
        <span className="rr-label pointer-events-none absolute left-3 top-3 max-w-[70%] truncate !text-[#8FB8D6]">{real?.model ?? SLOT_NAME[part.slot]}</span>
        <span className="rr-label pointer-events-none absolute bottom-3 right-3 !text-[#8FB8D6]">
          {part.massKg < 1 ? `${Math.round(part.massKg * 1000)} g` : `${part.massKg} kg`}
        </span>
      </section>

      <section className="flex flex-col gap-0.5">
        <h1 className="font-display text-[26px] font-bold leading-tight">{part.name}</h1>
        <p className="font-mono text-xs text-muted">{part.blurb}</p>
      </section>

      <section className="rr-card-brain flex flex-col gap-2 px-3.5 py-3">
        <h2 className="rr-label !text-cyan">{gets.heading}</h2>
        {gets.rows.map((row) => (
          <div key={`${row.side}-${row.field}`} className="flex items-center justify-between gap-3 font-mono text-[13px]">
            <span className="shrink-0 text-muted">{row.side}</span>
            <span className="min-w-0 truncate text-right">
              {row.field}:{' '}
              {row.value === null ? (
                <span className="rounded border border-dashed border-[#4A525D] px-2 py-px text-muted">?</span>
              ) : (
                <span className="font-semibold text-cyan">{row.value}</span>
              )}
            </span>
          </div>
        ))}
        <p className="text-xs leading-snug text-[#B8C0C9]">{gets.note}</p>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="rr-label">In the game</h2>
        <div className="grid grid-cols-4 gap-2">
          {specTiles(part).map((tile) => (
            <div key={tile.label} className="flex flex-col gap-0.5 rounded-xl border border-line bg-panel-2 p-2">
              <span className="font-mono text-[9px] font-medium tracking-[1px] text-muted">{tile.label}</span>
              <span className="truncate font-mono text-sm font-semibold">{tile.value}</span>
            </div>
          ))}
        </div>
      </section>

      {real ? <RealPart real={real} /> : null}

      {notice ? (
        <p role="status" className="text-xs leading-snug text-warn">
          {notice}
        </p>
      ) : null}

      <footer className="sticky bottom-0 z-20 -mx-4 mt-auto flex gap-2.5 bg-gradient-to-t from-ground from-70% to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
        {equipped && isRemovable(part) ? (
          <button
            type="button"
            onClick={() => {
              setBuild(withPart(build, part));
              router.push('/workshop');
            }}
            className="rr-btn rr-btn-secondary flex-1 !bg-transparent !text-text-2"
          >
            Remove
          </button>
        ) : null}
        {equipped ? (
          <Link href="/workshop" className="rr-btn rr-btn-brain flex-[1.6]">
            <Icon name="check" size={18} />
            Equipped
          </Link>
        ) : (
          <button type="button" onClick={equip} className="rr-btn rr-btn-primary flex-[1.6]">
            {locked ? (
              <>
                <Icon name="lock" size={16} />
                Unlock · {part.unlockPoints} pts
              </>
            ) : slotMax > 1 ? (
              'Equip'
            ) : (
              'Swap in'
            )}
          </button>
        )}
      </footer>
    </main>
  );
}
