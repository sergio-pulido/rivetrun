import { AppHeader } from '@/ui/AppHeader';
import { Icon } from '@/ui/Icon';
import type { BomItem } from './bom';
import { APPROXIMATE_CAPTION } from './models';
import { RealComponent } from './RealComponent';

const GROUP_LABEL = { core: 'Core kit', game: 'Real part', alt: 'Alternative', locked: 'Coming soon', tool: 'Fab lab tool' } as const;

interface RealItemSheetProps {
  readonly item: BomItem;
  readonly render: string | null;
  /** The manifest marks the render approximate. */
  readonly approximate?: boolean;
  readonly checkedAt: string | null;
  /** Where the back chevron goes. */
  readonly back: string;
}

/** A readable sheet for one bill-of-materials entry. Locked parts can be read here but not fitted: the game does not have them yet. */
export function RealItemSheet({ item, render, approximate = false, checkedAt, back }: RealItemSheetProps) {
  const locked = item.group === 'locked';
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-3 px-4 pt-[max(18px,env(safe-area-inset-top))]">
      <AppHeader back={back} label={GROUP_LABEL[item.group]} />

      <section className="rr-stage h-[210px] shrink-0 !bg-stage [background-size:16px_16px]">
        {render ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={render} alt={item.name} className={`absolute inset-0 h-full w-full object-contain p-3 ${locked ? 'opacity-80' : ''}`} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-line-3">
            <Icon name={locked ? 'lock' : 'layers'} size={56} />
          </span>
        )}
        {locked ? (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-ground/80 px-2 py-1 font-mono text-[10px] font-medium tracking-[1px] text-muted">
            <Icon name="lock" size={12} />
            COMING SOON
          </span>
        ) : null}
      </section>
      {render && approximate ? <p className="-mt-1.5 text-center text-[11px] leading-snug text-muted">{APPROXIMATE_CAPTION}</p> : null}

      {item.scenario ? (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[1.5px] text-cyan">Needs: {item.scenario}</p>
      ) : item.usedFor ? (
        <p className="text-[13px] leading-snug text-text-2">On this build it {item.usedFor}.</p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-[14px] border border-line-2 bg-panel-3 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="rr-label !text-orange-soft">Real part</h2>
          {checkedAt ? <span className="font-mono text-[10px] font-medium uppercase text-muted">Links checked {checkedAt}</span> : null}
        </div>
        <RealComponent item={item} showQuantity={item.group !== 'tool'} />
      </section>

      {locked ? (
        <footer className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-ground from-70% to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
          <button type="button" disabled className="rr-btn rr-btn-secondary w-full">
            <Icon name="lock" size={16} />
            Coming soon · not in the game yet
          </button>
        </footer>
      ) : (
        <div className="pb-4" />
      )}
    </main>
  );
}
