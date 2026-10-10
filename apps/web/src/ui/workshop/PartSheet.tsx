'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Part } from '@rivetrun/contracts';
import { useBuildStore } from '@/state/build';
import { isUnlocked, useProgressStore } from '@/state/progress';
import { useWorkshopUi } from '@/state/workshop';
import { AppHeader } from '@/ui/AppHeader';
import { Icon } from '@/ui/Icon';
import { realForPart, type Bom } from '@/ui/real/bom';
import type { PartMedia } from '@/ui/real/bomData';
import { APPROXIMATE_CAPTION } from '@/ui/real/models';
import { RealComponent } from '@/ui/real/RealComponent';
import { GivesYourRover } from '@/ui/strategy/GivesYourRover';
import { PartCanvas } from '@/ui/three';
import { Stage3D } from '@/ui/three/Stage3D';
import { PartGlyph } from './PartGlyph';
import { brainGets, specTiles } from './partInfo';
import { SLOTS, fitted, isRemovable, partsIn, withPart } from './slots';

const SLOT_NAME = { locomotion: 'Drive', motor: 'Motor', battery: 'Battery', sensor: 'Sensor', extra: 'Extra' } as const;

/** The part sheet: the part in 3D, what it changes for the brain, its specs, and the real hardware behind it. */
interface PartSheetProps {
  /** The game's part: every gameplay number on the sheet comes from here. */
  readonly part: Part;
  /** The real components behind this part, from the MK-II bill of materials; null when the file could not be read. */
  readonly bom: Bom | null;
  /** Per BOM key: a render and a GLB model, when those files exist. */
  readonly media: Readonly<Record<string, PartMedia>>;
}

export function PartSheet({ part, bom, media }: PartSheetProps) {
  const router = useRouter();
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const unlock = useProgressStore((store) => store.unlock);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const [notice, setNotice] = useState<string | null>(null);

  const gets = brainGets(part);
  // Which real component this is depends on the build: cell count picks the motor and pack, wheel size picks the wheel.
  const real = bom ? realForPart(bom, build, part.id, part.slot) : null;
  const lead = real?.lines[0]?.item;
  const picture = lead ? media[lead.key] : undefined;
  const [threeD, setThreeD] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const modelUrl = picture?.model && !modelFailed ? picture.model : null;
  const showModel = threeD && modelUrl !== null;
  const showRender = Boolean(picture?.render) && !showModel;
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
      <AppHeader back="/workshop" label={`${SLOT_NAME[part.slot]} · ${shelf.findIndex((other) => other.id === part.id) + 1} of ${shelf.length}`} />

      <section className="rr-stage h-[230px] shrink-0 !bg-stage [background-size:16px_16px]">
        {showRender && picture?.render ? (
          // A render of the real component. Plain <img>: the file sits in /public and may appear after the build.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture.render} alt={lead?.name ?? part.name} className="absolute inset-0 h-full w-full object-contain p-3" />
        ) : (
          <Stage3D key={showModel ? 'model' : 'art'} loadingLabel={showModel ? 'Loading the 3D model' : 'Loading the part'} placeholder={<PartGlyph id={part.id} width={200} className="opacity-70" />}>
            {(onReady) => (
              <PartCanvas
                part={part}
                onReady={onReady}
                modelUrl={showModel ? (modelUrl ?? undefined) : undefined}
                onModelError={() => {
                  setModelFailed(true);
                  setThreeD(false);
                }}
              />
            )}
          </Stage3D>
        )}
        {modelUrl ? (
          <button
            type="button"
            aria-pressed={threeD}
            onClick={() => setThreeD((on) => !on)}
            className={`absolute right-3 top-3 z-10 h-11 min-w-11 rounded-[10px] border px-3 font-mono text-[11px] font-medium tracking-[1px] ${
              threeD ? 'border-cyan bg-cyan text-on-cyan' : 'border-line-3 bg-ground/70 text-text'
            }`}
          >
            3D
          </button>
        ) : null}
        <span className="rr-label pointer-events-none absolute left-3 top-3 max-w-[70%] truncate !text-[#8FB8D6]">{lead?.model ?? lead?.manufacturer ?? SLOT_NAME[part.slot]}</span>
      </section>
      {showRender && picture?.approximate ? <p className="-mt-1.5 text-center text-[11px] leading-snug text-muted">{APPROXIMATE_CAPTION}</p> : null}

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

      <GivesYourRover part={part} build={build} />

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

      {real && bom ? (
        <section className="flex flex-col gap-3 rounded-[14px] border border-line-2 bg-panel-3 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="rr-label !text-orange-soft">Real part</h2>
            <span className="font-mono text-[10px] font-medium uppercase text-muted">Links checked {bom.checkedAt}</span>
          </div>
          {real.lines.map((line, index) => (
            <div key={line.item.key} className={index > 0 ? 'border-t border-line pt-3' : ''}>
              <RealComponent item={line.item} />
            </div>
          ))}
          {real.lines.length === 0 && real.notes.length === 0 ? <p className="text-[13px] text-muted">The bill of materials has no real component for this part.</p> : null}
          {real.notes.map((note) => (
            <p key={note} className="flex items-start gap-2 text-xs leading-snug text-warn">
              <Icon name="warn" size={14} className="mt-px shrink-0" />
              {note}
            </p>
          ))}
          <Link href="/workshop/real" className="font-mono text-[11px] font-medium tracking-[1px] text-orange-soft underline underline-offset-2">
            BUILD IT FOR REAL: THE WHOLE LIST
          </Link>
        </section>
      ) : null}

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
