'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { useInventoryStore } from '@/state/inventory';
import { buildName } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { formatMoney, formatSubtotal, parsePrice, quantity, realPlan, subtotal, type Bom, type BomItem, type RealLine } from './bom';
import type { PartMedia } from './bomData';
import { FabLab } from './FabLab';
import { stock } from './inventory';
import { OwnedToggle } from './OwnedToggle';
import { PrintedParts, type PrinterChoice } from './PrintedParts';
import type { PrintedPart } from './printedData';
import { RealBuildWide } from './RealBuildWide';
import { StatusBadge, priceText } from './RealComponent';
import { SubtotalCard } from './SubtotalCard';

interface RowProps {
  readonly line: RealLine;
  readonly render: string | null;
  /** The player already has this one ("My parts"). */
  readonly owned: boolean;
  readonly onToggle: () => void;
}

/** One line of the list: what to buy, how many, and the price exactly as its page showed it. */
function Row({ line, render, owned, onToggle }: RowProps) {
  const { item } = line;
  const price = parsePrice(item.priceShown);
  const qty = item.qty ?? 1;
  const gamePart = line.gameId ? PARTS_BY_ID.get(line.gameId)?.name : undefined;
  return (
    <li className={`flex items-stretch gap-1.5 rounded-[12px] border ${owned ? 'border-ok/40 bg-[#0F1712]' : 'border-[#1E232A] bg-panel-3'}`}>
      <Link href={`/workshop/real/${item.key}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] p-2 active:bg-panel-2">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-stage">
          {render ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={render} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="font-mono text-[9px] font-medium uppercase tracking-[1px] text-faint">{item.category.slice(0, 6)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          {/* The name is the one thing a buyer needs: it wraps to two lines instead of being cut by the price. */}
          <span className="line-clamp-2 text-[13px] font-semibold leading-tight">{item.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
            {quantity(item)}
            {item.manufacturer ? ` · ${item.manufacturer}` : ''}
            {gamePart ? ` · for ${gamePart}` : ''}
          </span>
          {item.status === 'verified' ? null : (
            <span className="mt-1 block">
              <StatusBadge item={item} />
            </span>
          )}
        </span>
        <span className="max-w-[78px] shrink-0 text-right font-mono tabular-nums">
          <span className={`block font-semibold leading-tight ${price ? 'text-xs' : 'text-[10px] text-text-2'}`}>{price && qty > 1 ? formatMoney({ ...price, amount: price.amount * qty }) : priceText(item)}</span>
          {price && qty > 1 ? <span className="block text-[10px] text-muted">{qty} × {item.priceShown}</span> : null}
        </span>
      </Link>
      <OwnedToggle owned={owned} name={item.name} onToggle={onToggle} />
    </li>
  );
}

interface RealBuildProps {
  /** Core kit, game components and alternatives from the MK-II bill of materials; null when the file could not be read. */
  readonly bom: Bom | null;
  readonly media: Readonly<Record<string, PartMedia>>;
  /** Parts to 3D-print, from docs/inputs/printed-parts.json. Empty when the file is not there. */
  readonly printed: readonly PrintedPart[];
  readonly printedRenders: Readonly<Record<string, string | null>>;
  /** The bill of materials' tools, for the fab lab strip and the printer picker. */
  readonly tools: readonly BomItem[];
  readonly toolRenders: Readonly<Record<string, string | null>>;
}

/** "Build it for real": the shopping list for the robot on the bench. Only what the bill of materials contains. */
export function RealBuild({ bom, media, printed, printedRenders, tools, toolRenders }: RealBuildProps) {
  const build = useBuildStore((store) => store.build);
  const owned = useInventoryStore((store) => store.owned);
  const toggleOwned = useInventoryStore((store) => store.toggle);

  // A link to "#printed-<id>" finds the phone row by its id. On the wide layout that row is not displayed, so the
  // row carrying the same name there is scrolled to instead.
  useEffect(() => {
    const showAnchor = (): void => {
      const name = decodeURIComponent(window.location.hash.slice(1));
      if (!name.startsWith('printed')) return;
      const shown = [...document.querySelectorAll<HTMLElement>('[data-anchor]')].find((row) => row.dataset.anchor === name && row.offsetParent !== null);
      shown?.scrollIntoView({ block: 'center' });
    };
    showAnchor();
    window.addEventListener('hashchange', showAnchor);
    return () => window.removeEventListener('hashchange', showAnchor);
  }, []);

  if (!bom) {
    return (
      <Shell back="/workshop" title="Build it for real">
        <p className="rr-card mt-4 p-4 text-[13px] text-muted">The bill of materials could not be read, so there is no list to show.</p>
      </Shell>
    );
  }

  const plan = realPlan(bom, build);
  const all = [...plan.core, ...plan.chosen];
  const mine = stock(all, printed, owned);
  const leftFigure = formatSubtotal(mine.toBuySum);
  const printers: readonly PrinterChoice[] = tools.filter((tool) => tool.category === 'printer').map((tool) => ({ key: tool.key, name: tool.name, usedFor: tool.usedFor }));

  return (
    <Shell back="/workshop" title="Build it for real" wide>
      <RealBuildWide
        buildName={buildName(build)}
        plan={plan}
        mine={mine}
        owned={owned}
        onToggle={toggleOwned}
        media={media}
        printed={printed}
        printedRenders={printedRenders}
        printers={printers}
        tools={tools}
        toolRenders={toolRenders}
        checkedAt={bom.checkedAt}
      />

      {/* The phone list. From 1024 px the layout above replaces it. */}
      <div className="contents lg:hidden">
        <section className="rr-rise flex flex-col gap-1">
          <h2 className="font-display text-[28px] font-bold leading-none">From game to reality</h2>
          <p className="text-[13px] leading-snug text-text-2">
            The real components for <span className="font-semibold text-text">{buildName(build)}</span>: the core kit every rover needs, plus the parts you chose. One rover.
          </p>
        </section>

        {plan.notes.map((note) => (
          <p key={note} className="flex items-start gap-2 rounded-[12px] border border-warn/40 px-3 py-2 text-xs leading-snug text-warn">
            <Icon name="warn" size={14} className="mt-px shrink-0" />
            {note}
          </p>
        ))}

        <section className={`rr-pop rounded-[14px] border p-3.5 ${mine.ready ? 'border-ok/60 bg-[#0F1712]' : 'border-line bg-panel'}`} aria-live="polite">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="rr-label">My parts</h3>
            <span className="font-mono text-[11px] tabular-nums text-text-2">
              {mine.have} OF {mine.total} IN HAND
            </span>
          </div>
          <div className="rr-meter mt-2 !h-1.5">
            <span style={{ width: `${mine.total > 0 ? (mine.have / mine.total) * 100 : 0}%`, backgroundColor: 'var(--color-ok)' }} />
          </div>
          {mine.ready ? (
            <p className="mt-2.5 flex items-center gap-2 font-display text-lg font-semibold text-ok">
              <Icon name="check" size={18} />
              You can build this today
            </p>
          ) : (
            <p className="mt-2.5 text-[13px] leading-snug text-text-2">
              {mine.toBuy.length > 0 ? (
                <>
                  Still to buy: <span className="font-mono font-semibold tabular-nums text-text">{leftFigure ?? `${mine.toBuy.length} ${mine.toBuy.length === 1 ? 'item' : 'items'}`}</span>
                  {leftFigure && mine.toBuySum.atRetailer > 0 ? ` + ${mine.toBuySum.atRetailer} at retailer price` : ''}
                  {leftFigure ? ` (${mine.toBuy.length} ${mine.toBuy.length === 1 ? 'line' : 'lines'})` : ''}.
                </>
              ) : (
                'Everything to buy is in hand.'
              )}
              {mine.toPrint > 0 ? ` Still to print: ${mine.toPrint} ${mine.toPrint === 1 ? 'design' : 'designs'}.` : ''}
            </p>
          )}
          <p className="mt-1.5 text-[11px] leading-snug text-muted">Tick what you already have. Kept on this device.</p>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="rr-label">Core kit · {plan.core.length} items</h3>
          <ul className="flex flex-col gap-1.5">
            {plan.core.map((line) => (
              <Row key={line.item.key} line={line} render={media[line.item.key]?.render ?? null} owned={owned.includes(line.item.key)} onToggle={() => toggleOwned(line.item.key)} />
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="rr-label">Your parts · {plan.chosen.length} items</h3>
          <ul className="flex flex-col gap-1.5">
            {plan.chosen.map((line) => (
              <Row key={line.item.key} line={line} render={media[line.item.key]?.render ?? null} owned={owned.includes(line.item.key)} onToggle={() => toggleOwned(line.item.key)} />
            ))}
          </ul>
        </section>

        <SubtotalCard sum={subtotal(all)} lines={all.length} />

        <PrintedParts parts={printed} printers={printers} renders={printedRenders} />

        <FabLab tools={tools} renders={toolRenders} />

        <p className="pb-2 text-center font-mono text-[11px] leading-relaxed text-muted">Designed, not yet built. Links checked {bom.checkedAt}.</p>
      </div>
    </Shell>
  );
}
