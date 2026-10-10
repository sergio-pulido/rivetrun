'use client';

import Link from 'next/link';
import { LAB_PLAYER, type LabRunResult } from '@rivetrun/lab';
import { Stars } from '@/ui/Stars';
import { fogReport } from './boardModel';
import { resultHeading } from './copy';
import { LabBoard } from './LabBoard';
import { DecisionThread } from './LabPlay';
import type { LabMode } from './useLabRun';

interface LabResultProps {
  readonly result: LabRunResult;
  readonly mode: LabMode;
  readonly newBest: boolean;
  readonly onRetry: () => void;
  readonly onChangeBuild: () => void;
}

/** How it went: the headline, the score and what it was made of, the decisions, and what the sensors never saw. */
export function LabResult({ result, mode, newBest, onRetry, onChangeBuild }: LabResultProps) {
  const outcome = result.outcomes[LAB_PLAYER]!;
  const me = result.final.agents.find((agent) => agent.id === LAB_PLAYER)!;
  const fog = fogReport(result.final, me);
  const mine = result.decisions.filter((d) => d.agentId === LAB_PLAYER);
  const theirs = result.decisions.filter((d) => d.agentId !== LAB_PLAYER);
  const good = outcome.status === 'complete';

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-x-5" data-testid="scenario-result">
      <section className="rr-card rr-rise flex flex-col items-center gap-2 px-3 py-4 text-center lg:col-start-1">
        <h2 className={`font-display text-2xl font-bold uppercase tracking-[1px] ${good ? 'text-ok' : outcome.status === 'partial' ? 'text-warn' : 'text-bad'}`} data-testid="scenario-result-heading">
          {resultHeading(outcome)}
        </h2>
        <Stars count={outcome.stars} size={26} animate />
        <p className="font-display text-5xl font-bold tabular-nums" data-testid="scenario-score">{outcome.score}</p>
        <p className="rr-label">Score{newBest ? ' · new best' : ''}</p>
        <p className="text-[13px] leading-snug text-text-2">{outcome.why}</p>
      </section>

      <div className="flex flex-wrap justify-center gap-1.5 lg:col-start-1">
        <span className="rr-chip tabular-nums">{outcome.timeS} s</span>
        <span className="rr-chip tabular-nums">Damage {Math.round(outcome.damagePct)} %</span>
        <span className="rr-chip tabular-nums">Energy {Math.round(outcome.energyUsedPct)} %</span>
        <span className="rr-chip tabular-nums">{outcome.objectivesDone}/{outcome.objectivesTotal} objectives</span>
        <span className="rr-chip tabular-nums">{outcome.stats.tiles} tiles</span>
      </div>

      <section className="rr-card flex flex-col gap-2 p-3 lg:col-start-2 lg:row-span-6 lg:row-start-1" aria-label="What your sensors could not see">
        <h3 className="rr-label !text-orange-soft">What your sensors could not see</h3>
        <p className="text-[13px] leading-snug text-text-2" data-testid="scenario-fog">
          Your robot sensed {fog.sensedPct} % of the map.
          {fog.missed.length > 0 ? ` It never saw: ${fog.missed.join(', ')}.` : ' Nothing on it went unseen.'}
        </p>
        <LabBoard state={result.final} reveal />
        <p className="text-[11px] leading-snug text-faint">The whole map. Hatched tiles were never reported by a sensor.</p>
      </section>

      {mode === 'jev' ? <div className="lg:col-start-1"><DecisionThread decisions={mine} limit={40} title={`Your robot · ${mine.length} decisions`} /></div> : null}
      {theirs.length > 0 ? <div className="lg:col-start-1"><DecisionThread decisions={theirs} limit={40} title={`Jev · ${theirs.length} decisions`} /></div> : null}

      <div className="grid grid-cols-2 gap-2 lg:col-start-1">
        <button type="button" className="rr-btn rr-btn-secondary" onClick={onChangeBuild} data-testid="scenario-change">Change robot</button>
        <button type="button" className="rr-btn rr-btn-primary" onClick={onRetry} data-testid="scenario-retry">Run it again</button>
      </div>
      <Link href="/scenarios" className="rr-btn rr-btn-secondary lg:col-start-1">All scenarios</Link>
    </div>
  );
}
