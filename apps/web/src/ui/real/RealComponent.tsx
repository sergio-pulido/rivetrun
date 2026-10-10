import { Icon } from '@/ui/Icon';
import { STATUS_BADGE, canBuy, quantity, specRows, type BomItem } from './bom';

const TONE = { ok: 'border-cyan-line text-cyan', warn: 'border-warn/60 text-warn', muted: 'border-line-3 text-muted' } as const;
const KEY_SPECS = 4;

export function StatusBadge({ item }: { readonly item: BomItem }) {
  const badge = STATUS_BADGE[item.status];
  return <span className={`shrink-0 rounded-md border px-1.5 py-1 font-mono text-[9px] font-medium uppercase leading-none tracking-[1px] ${TONE[badge.tone]}`}>{badge.label}</span>;
}

/** The price exactly as the product page showed it; when it showed none, say where the buyer will see it. */
export const priceText = (item: BomItem): string => item.priceShown ?? (item.url ? 'Price at retailer' : 'No price');

interface RealComponentProps {
  readonly item: BomItem;
  /** Show how many one rover needs. */
  readonly showQuantity?: boolean;
}

/** One real component: what it is, who makes it, its key specs, the price as displayed, its status, and a link when one was checked. */
export function RealComponent({ item, showQuantity = true }: RealComponentProps) {
  const rows = specRows(item);
  const qty = showQuantity ? quantity(item) : null;
  const maker = [item.manufacturer, item.model].filter(Boolean).join(' · ');
  return (
    <article className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold leading-snug">{item.name}</h3>
          {maker ? <p className="mt-0.5 font-mono text-[11px] text-muted">{maker}</p> : null}
        </div>
        <StatusBadge item={item} />
      </div>

      {rows.length > 0 ? (
        <dl className="grid grid-cols-1 gap-y-1 border-y border-tag py-2">
          {rows.slice(0, KEY_SPECS).map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-xs text-muted">{row.label}</dt>
              <dd className="min-w-0 truncate text-right font-mono text-xs font-semibold" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
          {rows.length > KEY_SPECS ? (
            <details className="pt-0.5">
              <summary className="cursor-pointer list-none font-mono text-[10px] font-medium tracking-[1px] text-orange-soft">
                ALL {rows.length} SPECS
              </summary>
              <div className="mt-1 grid gap-y-1">
                {rows.slice(KEY_SPECS).map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-xs text-muted">{row.label}</dt>
                    <dd className="min-w-0 text-right font-mono text-xs">{row.value}</dd>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </dl>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-mono text-sm font-semibold">{priceText(item)}</span>
          {qty ? <span className="block font-mono text-[10px] text-muted">one rover needs {qty}</span> : null}
        </span>
        {canBuy(item) ? (
          <a href={item.url ?? undefined} target="_blank" rel="noopener noreferrer" className="rr-btn rr-btn-secondary !min-h-11 shrink-0 !rounded-[10px] !bg-transparent !text-[13px]">
            {item.status === 'verified' ? 'Buy' : 'Product page'}
            <Icon name="external" size={14} />
          </a>
        ) : null}
      </div>

      {item.notes ? <p className="text-xs leading-snug text-[#B8C0C9]">{item.notes}</p> : null}
    </article>
  );
}
