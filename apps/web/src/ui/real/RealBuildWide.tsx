'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { printedKey } from '@/state/inventory';
import { Icon } from '@/ui/Icon';
import { WidePicture } from '@/ui/WidePicture';
import { canBuy, formatMoney, formatSubtotal, parsePrice, quantity, subtotal, type RealLine, type RealPlan } from './bom';
import type { PartMedia } from './bomData';
import { CSV_FILE_NAME, csvHref, shoppingCsv } from './csv';
import { FabLab } from './FabLab';
import type { Stock } from './inventory';
import { OwnedToggle } from './OwnedToggle';
import { PrinterPicker, type PrinterChoice } from './PrintedParts';
import { formatGrams, formatHours, isEstimate, printTotals } from './printed';
import type { PrintedPart } from './printedData';
import { StatusBadge, priceText } from './RealComponent';
import { SubtotalCard } from './SubtotalCard';
import type { BomItem } from './bom';

const HERO = '/renders/mk2/default_build_hero_light_grey.png';

/** One column template for the header and every row, so the list reads as a table. The tick sits outside it. */
const COLUMNS = 'grid min-w-0 flex-1 grid-cols-[48px_minmax(0,1fr)_60px_104px_124px_108px] items-center gap-x-3 px-2';
const TICK_WIDTH = 'w-[52px]';
const BOUGHT = ['Part', 'Qty', 'Price as shown', 'Status', 'Link'] as const;
const PRINTED = ['Part', 'Qty', 'Filament', 'Figures', 'Print time'] as const;

const rowLook = (owned: boolean): string => `flex items-stretch rounded-[12px] border ${owned ? 'border-ok/40 bg-[#0F1712]' : 'border-[#1E232A] bg-panel-3'}`;

function Thumb({ render, children }: { readonly render: string | null; readonly children: ReactNode }) {
  return (
    <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-stage">
      {render ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={render} alt="" className="h-full w-full object-contain" />
      ) : (
        children
      )}
    </span>
  );
}

interface GroupProps {
  readonly title: string;
  readonly columns: readonly string[];
  /** The word over the tick column. */
  readonly tick: string;
  readonly children: ReactNode;
}

function Group({ title, columns, tick, children }: GroupProps) {
  const [first, ...rest] = columns;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="rr-label">{title}</h3>
      <div className="flex items-end font-mono text-[10px] font-medium uppercase tracking-[1px] text-muted" aria-hidden="true">
        <div className={COLUMNS}>
          <span className="col-span-2">{first}</span>
          {rest.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        <span className={`${TICK_WIDTH} shrink-0 whitespace-nowrap text-center text-[9px] tracking-[0.5px]`}>{tick}</span>
      </div>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}

interface BoughtRowProps {
  readonly line: RealLine;
  readonly render: string | null;
  readonly owned: boolean;
  readonly onToggle: () => void;
}

/** One line to buy: what it is and who makes it, how many, the price exactly as its page showed it, its status and its page. */
function BoughtRow({ line, render, owned, onToggle }: BoughtRowProps) {
  const { item } = line;
  const price = parsePrice(item.priceShown);
  const qty = item.qty ?? 1;
  const gamePart = line.gameId ? PARTS_BY_ID.get(line.gameId)?.name : undefined;
  const maker = [item.manufacturer, item.model, gamePart ? `for ${gamePart}` : null].filter(Boolean).join(' · ');
  const sheet = `/workshop/real/${item.key}`;
  return (
    <li className={rowLook(owned)}>
      <div className={`${COLUMNS} py-2`}>
        <Link href={sheet} aria-hidden="true" tabIndex={-1}>
          <Thumb render={render}>
            <span className="font-mono text-[9px] font-medium uppercase tracking-[1px] text-faint">{item.category.slice(0, 6)}</span>
          </Thumb>
        </Link>
        {/* Name and maker wrap: on this width nothing a buyer needs is cut. */}
        <Link href={sheet} className="min-w-0 hover:text-orange-soft">
          <span className="block text-sm font-semibold leading-snug">{item.name}</span>
          {maker ? <span className="mt-0.5 block font-mono text-[11px] leading-snug text-muted">{maker}</span> : null}
        </Link>
        <span className="font-mono text-xs tabular-nums text-text-2">{quantity(item)}</span>
        <span className="font-mono tabular-nums">
          <span className={`block font-semibold leading-tight ${price ? 'text-[13px]' : 'text-[11px] text-text-2'}`}>{price && qty > 1 ? formatMoney({ ...price, amount: price.amount * qty }) : priceText(item)}</span>
          {price && qty > 1 ? (
            <span className="block text-[10px] text-muted">
              {qty} × {item.priceShown}
            </span>
          ) : null}
        </span>
        <span>
          <StatusBadge item={item} />
        </span>
        {canBuy(item) ? (
          <a href={item.url ?? undefined} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center gap-1 font-display text-[13px] font-semibold text-orange-soft hover:text-orange">
            {item.status === 'verified' ? 'Buy' : 'Product page'}
            <Icon name="external" size={13} />
          </a>
        ) : (
          <span className="font-mono text-[11px] text-faint">No checked link</span>
        )}
      </div>
      <OwnedToggle owned={owned} name={item.name} onToggle={onToggle} />
    </li>
  );
}

interface PrintedRowProps {
  readonly part: PrintedPart;
  readonly render: string | null;
  readonly owned: boolean;
  readonly onToggle: () => void;
}

/** One design to print. Weight and time are per piece, as in the file. */
function PrintedRow({ part, render, owned, onToggle }: PrintedRowProps) {
  const settings = [part.material, part.layerMm !== null ? `${part.layerMm} mm layers` : null, part.infillPct !== null ? `${part.infillPct}% infill` : null, part.supports === false ? 'no supports' : part.supports ? 'supports' : null];
  return (
    // The Workshop links to a printed part by name; on this layout the row carries that name as data-anchor.
    <li data-anchor={`printed-${part.id}`} className={rowLook(owned)}>
      <div className={`${COLUMNS} py-2`}>
        <Thumb render={render}>
          <Icon name="layers" size={20} className="text-faint" />
        </Thumb>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug">{part.name}</span>
          <span className="mt-0.5 block font-mono text-[11px] leading-snug text-muted">{settings.filter(Boolean).join(' · ')}</span>
        </span>
        <span className="font-mono text-xs tabular-nums text-text-2">{part.qty} pcs</span>
        <span className="font-mono text-[13px] font-semibold tabular-nums">{part.grams !== null ? formatGrams(part.grams) : 'no weight'}</span>
        <span className="font-mono text-[11px] text-muted">{isEstimate(part) ? 'estimate' : part.source}</span>
        <span className="font-mono text-xs tabular-nums text-text-2">{part.hours !== null ? formatHours(part.hours) : 'no time'}</span>
      </div>
      <OwnedToggle owned={owned} name={part.name} onToggle={onToggle} doneLabel="Printed" />
    </li>
  );
}

export interface RealBuildWideProps {
  readonly buildName: string;
  readonly plan: RealPlan;
  readonly mine: Stock;
  readonly owned: readonly string[];
  readonly onToggle: (key: string) => void;
  readonly media: Readonly<Record<string, PartMedia>>;
  readonly printed: readonly PrintedPart[];
  readonly printedRenders: Readonly<Record<string, string | null>>;
  readonly printers: readonly PrinterChoice[];
  readonly tools: readonly BomItem[];
  readonly toolRenders: Readonly<Record<string, string | null>>;
  /** The day every link was opened (YYYY-MM-DD). */
  readonly checkedAt: string;
}

/**
 * "Build it for real" on desktop and projector (1024 px and wider): the rover, the progress and what is left on the
 * left; the whole list as a table on the right. Same data and the same words as the phone list.
 */
export function RealBuildWide({ buildName, plan, mine, owned, onToggle, media, printed, printedRenders, printers, tools, toolRenders, checkedAt }: RealBuildWideProps) {
  const all = [...plan.core, ...plan.chosen];
  const leftFigure = formatSubtotal(mine.toBuySum);
  const toPrint = printed.filter((part) => !owned.includes(printedKey(part.id)));
  const left = printTotals(toPrint);
  const every = printTotals(printed);
  const est = (totals: { readonly estimated: boolean }): string => (totals.estimated ? 'est. ' : '');
  const has = (key: string): boolean => owned.includes(key);

  return (
    <div className="hidden lg:grid lg:grid-cols-[minmax(0,33fr)_minmax(0,67fr)] lg:items-start lg:gap-x-8" data-testid="real-wide">
      <aside className="sticky top-4 flex max-h-[calc(100dvh-32px)] flex-col gap-3 overflow-y-auto pb-1">
        <figure className="relative aspect-[9/4] shrink-0 overflow-hidden rounded-[18px] border border-[#262B33] bg-[#e6e8eb]">
          <WidePicture src={HERO} alt="The RivetRun MK-II rover: an orange printed chassis on four off-road wheels" className="absolute inset-0 h-full w-full object-cover object-[50%_80%]" />
        </figure>

        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[28px] font-bold leading-none">From game to reality</h2>
          <p className="text-[13px] leading-snug text-text-2">
            The real components for <span className="font-semibold text-text">{buildName}</span>: the core kit every rover needs, plus the parts you chose. One rover.
          </p>
        </div>

        {plan.notes.map((note) => (
          <p key={note} className="flex items-start gap-2 rounded-[12px] border border-warn/40 px-3 py-2 text-xs leading-snug text-warn">
            <Icon name="warn" size={14} className="mt-px shrink-0" />
            {note}
          </p>
        ))}

        <section className={`rounded-[14px] border p-3.5 ${mine.ready ? 'border-ok/60 bg-[#0F1712]' : 'border-line bg-panel'}`} aria-live="polite">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="rr-label">My parts</h3>
            <span className="font-mono text-[11px] tabular-nums text-text-2">
              {mine.have} OF {mine.total} IN HAND
            </span>
          </div>
          <div className="rr-meter mt-2 !h-1.5">
            <span
              style={{
                width: `${mine.total > 0 ? (mine.have / mine.total) * 100 : 0}%`,
                backgroundColor: 'var(--color-ok)',
              }}
            />
          </div>
          {mine.ready ? (
            <p className="mt-2.5 flex items-center gap-2 font-display text-lg font-semibold text-ok">
              <Icon name="check" size={18} />
              You can build this today
            </p>
          ) : (
            <dl className="mt-2.5 flex flex-col gap-1.5 text-[13px] leading-snug">
              <div>
                <dt className="rr-label">Still to buy</dt>
                <dd className="mt-0.5 text-text-2">
                  {mine.toBuy.length > 0 ? (
                    <>
                      <span className="font-mono font-semibold tabular-nums text-text">{leftFigure ?? `${mine.toBuy.length} ${mine.toBuy.length === 1 ? 'item' : 'items'}`}</span>
                      {leftFigure && mine.toBuySum.atRetailer > 0 ? ` + ${mine.toBuySum.atRetailer} at retailer price` : ''}
                      {leftFigure ? ` (${mine.toBuy.length} ${mine.toBuy.length === 1 ? 'line' : 'lines'})` : ''}
                    </>
                  ) : (
                    'Everything to buy is in hand.'
                  )}
                </dd>
              </div>
              {printed.length > 0 ? (
                <div>
                  <dt className="rr-label">Still to print</dt>
                  <dd className="mt-0.5 text-text-2">
                    {toPrint.length > 0 ? (
                      <>
                        <span className="font-mono font-semibold tabular-nums text-text">
                          {toPrint.length} {toPrint.length === 1 ? 'design' : 'designs'}
                        </span>
                        {left.grams !== null ? ` · ${est(left)}${formatGrams(left.grams)}` : ''}
                        {left.hours !== null ? ` · ${est(left)}${formatHours(left.hours)}` : ''}
                      </>
                    ) : (
                      'Every design is printed.'
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
          <p className="mt-1.5 text-[11px] leading-snug text-muted">Tick what you already have. Kept on this device.</p>
          {mine.toBuy.length > 0 ? (
            <a href={csvHref(shoppingCsv(mine.toBuy))} download={CSV_FILE_NAME} className="rr-btn rr-btn-secondary mt-2.5 w-full !min-h-11 !rounded-[10px] !text-[13px]" data-testid="shopping-csv">
              <Icon name="download" size={15} />
              Download shopping list (CSV)
            </a>
          ) : null}
        </section>

        {printed.length > 0 ? (
          <section className="rounded-[14px] border border-line bg-panel p-3">
            <p className="font-mono text-xs tabular-nums text-text-2">
              One rover: {every.grams !== null ? `${est(every)}${formatGrams(every.grams)} of filament` : 'filament not known for every part'}
              {every.hours !== null ? ` · ${est(every)}${formatHours(every.hours)} of printing` : ''}
            </p>
            <PrinterPicker printers={printers} />
          </section>
        ) : null}

        <p className="font-mono text-[11px] leading-relaxed text-muted">Designed, not yet built. Links checked {checkedAt}.</p>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <Group title={`Core kit · ${plan.core.length} items`} columns={BOUGHT} tick="Have it?">
          {plan.core.map((line) => (
            <BoughtRow key={line.item.key} line={line} render={media[line.item.key]?.render ?? null} owned={has(line.item.key)} onToggle={() => onToggle(line.item.key)} />
          ))}
        </Group>

        <Group title={`From your build · ${plan.chosen.length} items`} columns={BOUGHT} tick="Have it?">
          {plan.chosen.map((line) => (
            <BoughtRow key={line.item.key} line={line} render={media[line.item.key]?.render ?? null} owned={has(line.item.key)} onToggle={() => onToggle(line.item.key)} />
          ))}
        </Group>

        <SubtotalCard sum={subtotal(all)} lines={all.length} />

        {printed.length > 0 ? (
          <Group title={`Printed parts · ${printed.length} designs · ${every.pieces} pieces · weight and time per piece`} columns={PRINTED} tick="Printed?">
            {printed.map((part) => (
              <PrintedRow key={part.id} part={part} render={printedRenders[part.id] ?? null} owned={has(printedKey(part.id))} onToggle={() => onToggle(printedKey(part.id))} />
            ))}
          </Group>
        ) : null}

        <FabLab tools={tools} renders={toolRenders} />
      </div>
    </div>
  );
}
