'use client';

import Link from 'next/link';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { buildName } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { formatMoney, formatSubtotal, parsePrice, quantity, realPlan, subtotal, type Bom, type RealLine } from './bom';
import type { PartMedia } from './bomData';
import { StatusBadge, priceText } from './RealComponent';

interface RowProps {
  readonly line: RealLine;
  readonly render: string | null;
}

/** One line of the list: what to buy, how many, and the price exactly as its page showed it. */
function Row({ line, render }: RowProps) {
  const { item } = line;
  const price = parsePrice(item.priceShown);
  const qty = item.qty ?? 1;
  const gamePart = line.gameId ? PARTS_BY_ID.get(line.gameId)?.name : undefined;
  return (
    <li>
      <Link href={`/workshop/real/${item.key}`} className="flex items-center gap-2.5 rounded-[12px] border border-[#1E232A] bg-panel-3 p-2 active:bg-panel-2">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-stage">
          {render ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={render} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="font-mono text-[9px] font-medium uppercase tracking-[1px] text-faint">{item.category.slice(0, 6)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">{item.name}</span>
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
        <span className="shrink-0 text-right font-mono tabular-nums">
          <span className="block text-xs font-semibold">{price && qty > 1 ? formatMoney({ ...price, amount: price.amount * qty }) : priceText(item)}</span>
          {price && qty > 1 ? <span className="block text-[10px] text-muted">{qty} × {item.priceShown}</span> : null}
        </span>
      </Link>
    </li>
  );
}

interface RealBuildProps {
  /** Core kit, game components and alternatives from the MK-II bill of materials; null when the file could not be read. */
  readonly bom: Bom | null;
  readonly media: Readonly<Record<string, PartMedia>>;
}

/** "Build it for real": the shopping list for the robot on the bench. Only what the bill of materials contains. */
export function RealBuild({ bom, media }: RealBuildProps) {
  const build = useBuildStore((store) => store.build);

  if (!bom) {
    return (
      <Shell back="/workshop" title="Build it for real">
        <p className="rr-card mt-4 p-4 text-[13px] text-muted">The bill of materials could not be read, so there is no list to show.</p>
      </Shell>
    );
  }

  const plan = realPlan(bom, build);
  const all = [...plan.core, ...plan.chosen];
  const sum = subtotal(all);
  const figure = formatSubtotal(sum);

  return (
    <Shell back="/workshop" title="Build it for real">
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

      <section className="flex flex-col gap-1.5">
        <h3 className="rr-label">Core kit · {plan.core.length} items</h3>
        <ul className="flex flex-col gap-1.5">
          {plan.core.map((line) => (
            <Row key={line.item.key} line={line} render={media[line.item.key]?.render ?? null} />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="rr-label">Your parts · {plan.chosen.length} items</h3>
        <ul className="flex flex-col gap-1.5">
          {plan.chosen.map((line) => (
            <Row key={line.item.key} line={line} render={media[line.item.key]?.render ?? null} />
          ))}
        </ul>
      </section>

      <section className="rounded-[14px] border border-[#3A2A1C] bg-[#17120D] p-3.5">
        <h3 className="rr-label !text-orange-soft">Subtotal · {all.length} lines</h3>
        <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tabular-nums text-orange">{figure ?? 'No listed prices'}</p>
        {sum.atRetailer > 0 ? (
          <p className="mt-1 font-mono text-xs text-text-2">
            {figure ? '+ ' : ''}
            {sum.atRetailer} {sum.atRetailer === 1 ? 'item' : 'items'}: price at retailer
          </p>
        ) : null}
        <p className="mt-2 text-xs leading-snug text-[#B8C0C9]">Prices are the ones each maker&apos;s page showed, in its own currency. They are not converted or added across currencies, and exclude shipping.</p>
      </section>

      <p className="pb-2 text-center font-mono text-[11px] leading-relaxed text-muted">Designed, not yet built. Links checked {bom.checkedAt}.</p>
    </Shell>
  );
}
