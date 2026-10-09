import { BUDGET_EUR, MASS_SCALE_KG, type BuildStats } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { Meter } from '@/ui/Meter';

const BAR_COLOR = { speed: 'var(--color-safety)', grip: 'var(--color-ok)', endurance: 'var(--color-warn)', perception: 'var(--color-led)' } as const;

/** Budget and mass, the four stat bars, and what the AI can and cannot perceive with this build. */
export function StatPanel({ stats }: { readonly stats: BuildStats }) {
  const over = stats.overBudgetEur > 0;
  return (
    <section className="rr-panel p-3">
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="rr-label">Budget</span>
            <span className={`font-mono text-xs tabular-nums ${over ? 'font-bold text-bad' : 'text-slate-200'}`}>
              €{stats.costEur}
              <span className="text-dim"> / {BUDGET_EUR}</span>
            </span>
          </div>
          <Meter className="mt-1.5" fill={stats.costEur / BUDGET_EUR} color={over ? 'var(--color-bad)' : 'var(--color-safety)'} />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="rr-label">Mass</span>
            <span className="font-mono text-xs tabular-nums text-slate-200">{stats.massKg.toFixed(2)} kg</span>
          </div>
          <Meter className="mt-1.5" fill={stats.massKg / MASS_SCALE_KG} color="#9aa7b6" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-slate-line pt-3">
        {stats.bars.map((bar) => (
          <div key={bar.key}>
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-xs font-semibold">{bar.label}</span>
              <span className="truncate font-mono text-[10px] tabular-nums text-dim">{bar.figure}</span>
            </div>
            <Meter className="mt-1" fill={bar.fill} color={BAR_COLOR[bar.key]} />
          </div>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-2 border-t border-slate-line pt-2.5 text-[12px] leading-snug text-dim">
        <Icon name="eye" size={15} className="mt-px shrink-0 text-led" />
        <span>
          {stats.sees.length > 0 ? (
            <>
              AI sees <span className="text-slate-200">{stats.sees.join(', ')}</span>.
            </>
          ) : (
            <span className="text-warn">The AI drives blind: no sensors fitted.</span>
          )}
          {stats.blind.length > 0 && stats.sees.length > 0 ? <> Blind to {stats.blind.join(', ')}.</> : null}
        </span>
      </p>
    </section>
  );
}
