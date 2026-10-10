'use client';

import { useState } from 'react';
import { printedKey, useInventoryStore } from '@/state/inventory';
import { Icon } from '@/ui/Icon';
import { OwnedToggle } from './OwnedToggle';
import { formatGrams, formatHours, isEstimate, printTotals } from './printed';
import type { PrintedPart } from './printedData';

export interface PrinterChoice {
  readonly key: string;
  readonly name: string;
  readonly usedFor: string | null;
}

type Step = { readonly kind: 'idle' } | { readonly kind: 'picking' } | { readonly kind: 'chosen'; readonly printer: PrinterChoice };

interface PrintedPartsProps {
  readonly parts: readonly PrintedPart[];
  /** The printers listed under the bill of materials' tools. */
  readonly printers: readonly PrinterChoice[];
  /** Printed part id → render, when one exists. */
  readonly renders: Readonly<Record<string, string | null>>;
}

/**
 * The parts to print for one rover. "Send to printer" goes as far as choosing a printer and then says, truthfully,
 * that printing from the app is not built yet. Nothing is ever shown as queued or started.
 */
export function PrintedParts({ parts, printers, renders }: PrintedPartsProps) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const owned = useInventoryStore((store) => store.owned);
  const toggleOwned = useInventoryStore((store) => store.toggle);
  if (parts.length === 0) return null;
  const totals = printTotals(parts);
  const est = totals.estimated ? 'est. ' : '';

  return (
    <section id="printed" className="flex flex-col gap-1.5">
      <h3 className="rr-label">
        Printed parts · {parts.length} designs · {totals.pieces} pieces
      </h3>
      <ul className="flex flex-col gap-1.5">
        {parts.map((part) => {
          const tag = isEstimate(part) ? 'est.' : part.source;
          return (
            <li key={part.id} id={`printed-${part.id}`} className={`flex items-center gap-2.5 rounded-[12px] border py-2 pl-2 ${owned.includes(printedKey(part.id)) ? 'border-ok/40 bg-[#0F1712]' : 'border-[#1E232A] bg-panel-3'}`}>
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-stage">
                {renders[part.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={renders[part.id] ?? undefined} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Icon name="layers" size={20} className="text-faint" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight">{part.name}</span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                  {part.qty} × {part.material}
                  {part.layerMm !== null ? ` · ${part.layerMm} mm layers` : ''}
                  {part.infillPct !== null ? ` · ${part.infillPct}% infill` : ''}
                  {part.supports === false ? ' · no supports' : part.supports ? ' · supports' : ''}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono tabular-nums">
                <span className="block text-xs font-semibold">{part.grams !== null ? formatGrams(part.grams) : 'no weight'}</span>
                <span className="block text-[10px] text-muted">
                  {part.hours !== null ? formatHours(part.hours) : 'no time'}
                  {tag ? ` · ${tag}` : ''}
                </span>
              </span>
              <OwnedToggle owned={owned.includes(printedKey(part.id))} name={part.name} onToggle={() => toggleOwned(printedKey(part.id))} doneLabel="Printed" />
            </li>
          );
        })}
      </ul>

      <div className="rounded-[14px] border border-line bg-panel p-3">
        <p className="font-mono text-xs tabular-nums text-text-2">
          One rover: {totals.grams !== null ? `${est}${formatGrams(totals.grams)} of filament` : 'filament not known for every part'}
          {totals.hours !== null ? ` · ${est}${formatHours(totals.hours)} of printing` : ''}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted">The per-piece figures above, multiplied by quantity.</p>

        {step.kind === 'idle' ? (
          <button type="button" onClick={() => setStep({ kind: 'picking' })} disabled={printers.length === 0} className="rr-btn rr-btn-secondary mt-2.5 w-full !min-h-11 !rounded-[10px] !text-[13px]">
            Send to printer
          </button>
        ) : null}

        {step.kind === 'picking' ? (
          <div className="mt-2.5 flex flex-col gap-1.5" role="group" aria-label="Choose a printer">
            <span className="rr-label">Choose a printer</span>
            {printers.map((printer) => (
              <button
                key={printer.key}
                type="button"
                onClick={() => setStep({ kind: 'chosen', printer })}
                className="flex min-h-11 flex-col justify-center rounded-[10px] border border-line-2 bg-panel-2 px-3 py-1.5 text-left active:border-orange"
              >
                <span className="font-display text-[13px] font-semibold">{printer.name}</span>
                {printer.usedFor ? <span className="text-[11px] leading-snug text-muted">{printer.usedFor}</span> : null}
              </button>
            ))}
            <button type="button" onClick={() => setStep({ kind: 'idle' })} className="h-11 font-mono text-[11px] font-medium tracking-[1px] text-muted">
              CANCEL
            </button>
          </div>
        ) : null}

        {step.kind === 'chosen' ? (
          <div role="status" className="mt-2.5 rounded-[10px] border border-dashed border-line-3 px-3 py-2.5">
            <p className="font-display text-[15px] font-semibold">Print integration coming soon</p>
            <p className="mt-1 text-xs leading-snug text-muted">
              Nothing was sent to the {step.printer.name}. Sending jobs from the app is not built yet; the list above is what to slice and print by hand.
            </p>
            <button type="button" onClick={() => setStep({ kind: 'idle' })} className="mt-1.5 h-9 font-mono text-[11px] font-medium tracking-[1px] text-orange-soft">
              OK
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
