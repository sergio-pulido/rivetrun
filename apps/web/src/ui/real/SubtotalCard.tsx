import { formatSubtotal, type Subtotal } from './bom';

interface SubtotalCardProps {
  readonly sum: Subtotal;
  /** How many lines the figure covers. */
  readonly lines: number;
}

/** What the list costs, one figure per currency: never converted, never added across currencies. */
export function SubtotalCard({ sum, lines }: SubtotalCardProps) {
  const figure = formatSubtotal(sum);
  return (
    <section className="rounded-[14px] border border-[#3A2A1C] bg-[#17120D] p-3.5">
      <h3 className="rr-label !text-orange-soft">Subtotal · {lines} lines</h3>
      <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tabular-nums text-orange">{figure ?? 'No listed prices'}</p>
      {sum.atRetailer > 0 ? (
        <p className="mt-1 font-mono text-xs text-text-2">
          {figure ? '+ ' : ''}
          {sum.atRetailer} {sum.atRetailer === 1 ? 'item' : 'items'}: price at retailer
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-snug text-[#B8C0C9]">Prices are the ones each maker&apos;s page showed, in its own currency. They are not converted or added across currencies, and exclude shipping.</p>
    </section>
  );
}
