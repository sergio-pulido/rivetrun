import type { Outcome } from '@rivetrun/contracts';
import { TUNING } from '@rivetrun/sim';

interface Line {
  readonly label: string;
  readonly detail: string;
  readonly points: number;
}

const { base, perSecond, perDamagePct, perEnergyPct, costDivisor, dnfMax } = TUNING.score;

/** The score formula applied to the measured outcome, one term per line. */
function lines(outcome: Outcome): readonly Line[] {
  if (!outcome.finished) {
    return [
      { label: 'Track covered', detail: `${Math.round(outcome.progressFraction * 100)}% × ${dnfMax}`, points: dnfMax * outcome.progressFraction },
    ];
  }
  return [
    { label: 'Finished', detail: 'base', points: base },
    { label: 'Time', detail: `${outcome.timeS.toFixed(1)} s × ${perSecond}`, points: -perSecond * outcome.timeS },
    { label: 'Damage', detail: `${outcome.damagePct}% × ${perDamagePct}`, points: -perDamagePct * outcome.damagePct },
    { label: 'Energy used', detail: `${outcome.energyUsedPct}% × ${perEnergyPct}`, points: -perEnergyPct * outcome.energyUsedPct },
    { label: 'Build cost', detail: `€${outcome.costEur} ÷ ${costDivisor}`, points: -outcome.costEur / costDivisor },
  ];
}

const signed = (points: number): string => {
  const rounded = Math.round(points);
  return rounded > 0 ? `+${rounded}` : rounded === 0 ? '0' : `−${Math.abs(rounded)}`;
};

export function ScoreBreakdown({ outcome }: { readonly outcome: Outcome }) {
  return (
    <section className="rr-panel p-3">
      <h2 className="rr-label">Score breakdown</h2>
      <dl className="mt-2.5 flex flex-col gap-1.5">
        {lines(outcome).map((line) => (
          <div key={line.label} className="flex items-baseline gap-2 text-sm">
            <dt className="shrink-0 font-medium">{line.label}</dt>
            <span className="min-w-0 flex-1 truncate border-b border-dotted border-slate-line pb-0.5 text-right font-mono text-[11px] text-dim">{line.detail}</span>
            <dd className={`w-14 shrink-0 text-right font-mono tabular-nums ${line.points < 0 ? 'text-bad' : 'text-ok'}`}>{signed(line.points)}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between border-t border-slate-line pt-2">
          <dt className="text-sm font-bold">Score</dt>
          <dd className="font-mono text-lg font-bold tabular-nums text-safety">{outcome.score}</dd>
        </div>
      </dl>
    </section>
  );
}
