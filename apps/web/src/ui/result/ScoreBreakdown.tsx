import type { Outcome } from '@rivetrun/contracts';
import { TUNING } from '@rivetrun/sim';
import { formatSeconds } from '@/ui/format';

interface Line {
  readonly label: string;
  readonly points: number;
}

const { base, perSecond, perDamagePct, perEnergyPct, costDivisor, dnfMax } = TUNING.score;

/** The score formula applied to the measured outcome, one term per line. */
function lines(outcome: Outcome): readonly Line[] {
  if (!outcome.finished) {
    return [{ label: `track covered ${Math.round(outcome.progressFraction * 100)} % × ${dnfMax}`, points: dnfMax * outcome.progressFraction }];
  }
  return [
    { label: 'base', points: base },
    { label: `time ${formatSeconds(outcome.timeS)} s × ${perSecond}`, points: -perSecond * outcome.timeS },
    { label: `damage ${outcome.damagePct} % × ${perDamagePct}`, points: -perDamagePct * outcome.damagePct },
    { label: `energy ${outcome.energyUsedPct} % × ${perEnergyPct}`, points: -perEnergyPct * outcome.energyUsedPct },
    { label: `cost €${outcome.costEur} ÷ ${costDivisor}`, points: -outcome.costEur / costDivisor },
  ];
}

const signed = (points: number): string => {
  const rounded = Math.round(points);
  return rounded < 0 ? `−${Math.abs(rounded)}` : `${rounded}`;
};

export function ScoreBreakdown({ outcome }: { readonly outcome: Outcome }) {
  return (
    <dl className="rr-card flex flex-col px-3 py-1 font-mono tabular-nums">
      {lines(outcome).map((line) => (
        <div key={line.label} className={`flex h-[26px] items-center justify-between border-b border-[#1A1F25] text-xs ${line.points < 0 ? 'text-muted' : 'text-text-2'}`}>
          <dt>{line.label}</dt>
          <dd>{signed(line.points)}</dd>
        </div>
      ))}
      <div className="flex h-8 items-center justify-between text-sm font-semibold">
        <dt>SCORE</dt>
        <dd className="text-orange">{outcome.score}</dd>
      </div>
    </dl>
  );
}
