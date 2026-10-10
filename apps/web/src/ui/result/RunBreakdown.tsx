import { Icon } from '@/ui/Icon';
import type { BreakdownView } from './breakdown';

const TONE = { ok: 'text-ok', warn: 'text-warn' } as const;

/** The run in four lines: scans, time lost to wheelspin, where the damage came from, and what to try next. */
export function RunBreakdown({ view }: { readonly view: BreakdownView }) {
  const totalDamage = view.damage.reduce((sum, entry) => sum + entry.pct, 0);
  return (
    <section className="rr-card flex flex-col gap-2 px-3.5 py-3" aria-label="Run breakdown">
      <h2 className="rr-label">Where the run went</h2>
      <ul className="flex flex-col">
        {view.scans ? (
          <li className="flex items-start gap-2 border-t border-tag py-1.5 first:border-t-0">
            <Icon name={view.scans.tone === 'ok' ? 'check' : 'warn'} size={14} className={`mt-0.5 shrink-0 ${TONE[view.scans.tone]}`} />
            <span className="min-w-0 text-[13px] leading-snug">
              <span className="font-semibold">Scans: {view.scans.text}</span>
              {view.scans.detail ? <span className="block text-xs text-text-2">{view.scans.detail}</span> : null}
            </span>
          </li>
        ) : null}
        <li className="flex items-start gap-2 border-t border-tag py-1.5 first:border-t-0">
          <Icon name={view.slip.tone === 'ok' ? 'check' : 'warn'} size={14} className={`mt-0.5 shrink-0 ${TONE[view.slip.tone]}`} />
          <span className="text-[13px] font-semibold leading-snug">{view.slip.text}</span>
        </li>
        <li className="flex items-start gap-2 border-t border-tag py-1.5 first:border-t-0">
          <Icon name={view.damage.length === 0 ? 'check' : 'warn'} size={14} className={`mt-0.5 shrink-0 ${view.damage.length === 0 ? TONE.ok : TONE.warn}`} />
          <span className="min-w-0 flex-1 text-[13px] leading-snug">
            <span className="font-semibold">{view.damage.length === 0 ? 'No damage' : 'Damage by cause'}</span>
            {view.damage.length > 0 ? (
              <span className="mt-1.5 flex flex-col gap-1">
                {view.damage.map((entry) => (
                  <span key={entry.cause} className="grid grid-cols-[92px_1fr_38px] items-center gap-2 text-xs text-text-2">
                    <span className="truncate">{entry.cause}</span>
                    <span className="rr-meter !h-1.5">
                      <span style={{ width: `${(entry.pct / Math.max(1, totalDamage)) * 100}%`, backgroundColor: 'var(--color-warn)' }} />
                    </span>
                    <span className="text-right font-mono tabular-nums">{entry.pct}%</span>
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        </li>
      </ul>
      {view.tryNext ? (
        <p className="rounded-[10px] border border-orange/50 bg-orange-deep px-2.5 py-2 text-[13px] leading-snug text-text">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">TRY NEXT · </span>
          {view.tryNext}
        </p>
      ) : null}
    </section>
  );
}
