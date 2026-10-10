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
  /** The robot that ran, e.g. "Recommended · Camera, Ultrasonic". */
  readonly robot: string;
  /** Jev was asked live in the brain seats; false = the lab's fixed rules sat there the whole run. */
  readonly jevLive: boolean;
  readonly newBest: boolean;
  readonly onRetry: () => void;
  readonly onChangeBuild: () => void;
}

/** How it went: the headline, the score and what it was made of, the decisions, and what the sensors never saw. */
/** "7 decisions · 2 by the fixed rules (FALLBACK) · question lab-q3": how many a brain made, how many it missed, and what it was asked. */
const tally = (decisions: readonly { readonly fallback: boolean; readonly question?: string }[]): string => {
  const missed = decisions.filter((d) => d.fallback).length;
  // The wording of the question the brain answered, as the server names it: with or without the fixed rules' verdict.
  const asked = [...new Set(decisions.flatMap((d) => (d.question ? [d.question] : [])))];
  return `${decisions.length} decisions${missed > 0 ? ` · ${missed} by the fixed rules (FALLBACK)` : ''}${asked.length > 0 ? ` · question ${asked.join(', ')}` : ''}`;
};

export function LabResult({ result, mode, robot, jevLive, newBest, onRetry, onChangeBuild }: LabResultProps) {
  const outcome = result.outcomes[LAB_PLAYER]!;
  const me = result.final.agents.find((agent) => agent.id === LAB_PLAYER)!;
  const fog = fogReport(result.final, me);
  const mine = result.decisions.filter((d) => d.agentId === LAB_PLAYER);
  const theirs = result.decisions.filter((d) => d.agentId !== LAB_PLAYER);
  const good = outcome.status === 'complete';
  /** Who sat in the brain seats, said the same way on every thread. */
  const seat = jevLive ? 'Jev' : 'the fixed rules';

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-x-5" data-testid="scenario-result">
      <section className="rr-card rr-rise flex flex-col items-center gap-2 px-3 py-4 text-center lg:col-start-1">
        <h2 className={`font-display text-2xl font-bold uppercase tracking-[1px] ${good ? 'text-ok' : outcome.status === 'partial' ? 'text-warn' : 'text-bad'}`} data-testid="scenario-result-heading">
          {resultHeading(outcome, jevLive)}
        </h2>
        <Stars count={outcome.stars} size={26} animate />
        <p className="font-display text-5xl font-bold tabular-nums" data-testid="scenario-score">{outcome.score}</p>
        <p className="rr-label">Score{newBest ? ' · new best' : ''}</p>
        <p className="text-[13px] leading-snug text-text-2">{outcome.why}</p>
        <p className="font-mono text-[11px] text-muted" data-testid="scenario-robot">{robot} · {mode !== 'jev' ? 'you drove' : jevLive ? 'Jev drove' : 'the fixed rules drove (Jev was not reachable)'}</p>
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
          Your robot&apos;s sensors reported {fog.sensedPct} % of the map{fog.planKnown ? ' (the floor plan was on the mission plan; that is not counted)' : ''}.
          {fog.missed.length > 0 ? ` It never saw: ${fog.missed.join(', ')}.` : ' Nothing on it went unseen.'}
        </p>
        {/* On a wide screen the map gives up height to its heading and caption, so the result fits without scrolling. */}
        <div className="lg:[&_svg]:max-h-[calc(100dvh-250px)]">
          <LabBoard state={result.final} reveal />
        </div>
        <p className="text-[11px] leading-snug text-faint">The whole map. Hatched tiles were never reported by a sensor.</p>
      </section>

      {mode === 'jev' ? <div className="lg:col-start-1"><DecisionThread decisions={mine} title={`Your robot · ${seat} · ${tally(mine)}`} /></div> : null}
      {theirs.length > 0 ? <div className="lg:col-start-1"><DecisionThread decisions={theirs} title={`The other robot · ${seat} · ${tally(theirs)}`} /></div> : null}

      <div className="grid grid-cols-2 gap-2 lg:col-start-1">
        <button type="button" className="rr-btn rr-btn-secondary" onClick={onChangeBuild} data-testid="scenario-change">Change robot</button>
        <button type="button" className="rr-btn rr-btn-primary" onClick={onRetry} data-testid="scenario-retry">Run it again</button>
      </div>
      <Link href="/scenarios" className="rr-btn rr-btn-secondary lg:col-start-1">All scenarios</Link>
    </div>
  );
}
