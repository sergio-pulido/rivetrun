'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LAB_PLAYER, LAB_SCENARIOS, LAB_SEEDS, deriveRobot, type LabScenarioId } from '@rivetrun/lab';
import { useBuildStore } from '@/state/build';
import { saveResult, useLabBests } from './bests';
import { LAB_HONESTY, SCENARIO_BRIEFS, labLoadouts, sensorLine } from './copy';
import { STAND_IN_NOTE } from './labBrain';
import { LabPlay } from './LabPlay';
import { LabResult } from './LabResult';
import { useLabRun, type LabMode, type LabRunSetup } from './useLabRun';

/** One Lab Mission from brief to result. */
export function ScenarioScreen({ id }: { readonly id: LabScenarioId }) {
  const scenario = LAB_SCENARIOS[id];
  const brief = SCENARIO_BRIEFS[id];
  const mine = useBuildStore((store) => store.build);
  const loadouts = useMemo(() => labLoadouts(id, mine), [id, mine]);
  const [loadoutId, setLoadoutId] = useState('suited');
  const [mode, setMode] = useState<LabMode>('drive');
  const [setup, setSetup] = useState<LabRunSetup | null>(null);
  /** The best score on this device when the run started, to say whether the run beat it. */
  const [bestBefore, setBestBefore] = useState<number | null>(null);
  const bests = useLabBests();
  const { view, controls } = useLabRun(setup);
  const loadout = loadouts.find((l) => l.id === loadoutId) ?? loadouts[0]!;
  const twoRobots = scenario.agents.length > 1;
  const result = view?.result;

  useEffect(() => {
    if (!result) return;
    const outcome = result.outcomes[LAB_PLAYER]!;
    saveResult(id, { score: outcome.score, stars: outcome.stars, timeS: outcome.timeS });
  }, [result, id]);

  const start = (): void => {
    setBestBefore(bests[id]?.score ?? null);
    setSetup({ scenarioId: id, seed: LAB_SEEDS[0], build: loadout.build, mode, attempt: (setup?.attempt ?? 0) + 1 });
  };

  if (setup !== null && view !== null && result) {
    const score = result.outcomes[LAB_PLAYER]!.score;
    const newBest = score > 0 && (bestBefore === null || score > bestBefore);
    return <LabResult result={result} mode={setup.mode} newBest={newBest} onRetry={start} onChangeBuild={() => setSetup(null)} />;
  }
  if (setup !== null && view !== null) return <LabPlay view={view} controls={controls} mode={setup.mode} />;

  return (
    <div className="flex flex-col gap-3">
      <section className="rr-rise flex flex-col gap-1.5">
        <h2 className="font-display text-xl font-bold uppercase tracking-[1px]">{scenario.name}</h2>
        <p className="text-[13px] leading-snug text-text-2">{scenario.description}</p>
      </section>

      <section className="rr-card flex flex-col gap-2 p-3" aria-label="Objectives">
        <h3 className="rr-label !text-orange-soft">Objective</h3>
        <ol className="flex flex-col gap-1">
          {scenario.objectives.map((objective, i) => (
            <li key={objective.id} className="text-[13px] leading-snug"><span className="mr-1.5 font-mono text-xs text-muted">{i + 1}</span>{objective.label}</li>
          ))}
        </ol>
        <p className="text-xs leading-snug text-text-2">{brief.tip}</p>
        <div className="flex flex-wrap gap-1.5">
          {brief.matters.map((part) => <span key={part} className="rr-chip rr-chip-on">{part}</span>)}
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Robot">
        <h3 className="rr-label">Robot</h3>
        <div className="grid grid-cols-2 gap-2">
          {loadouts.map((option) => {
            const on = option.id === loadout.id;
            const spec = deriveRobot(option.build).spec;
            return (
              <button
                key={option.id} type="button" aria-pressed={on} onClick={() => setLoadoutId(option.id)} data-testid={`loadout-${option.id}`}
                className={`flex min-h-[92px] flex-col gap-1 rounded-xl border p-2.5 text-left ${on ? 'border-orange bg-orange-deep' : 'border-line bg-panel'}`}
              >
                <span className="font-display text-sm font-semibold uppercase tracking-[0.5px]">{option.name}</span>
                <span className="font-mono text-[11px] leading-snug text-cyan-soft">{sensorLine(option.build)}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted">{spec.topSpeedMps.toFixed(1)} m/s · {spec.capacityWh.toFixed(1)} Wh · €{spec.costEur}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-snug text-text-2">{loadout.note}</p>
        <Link href="/workshop" className="self-start font-mono text-[11px] font-medium tracking-[1px] text-orange-soft underline underline-offset-2">CHANGE MY ROBOT IN THE WORKSHOP</Link>
      </section>

      <section className="flex flex-col gap-2" aria-label="Driver">
        <h3 className="rr-label">Who drives</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['drive', 'jev'] as const).map((option) => (
            <button
              key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} data-testid={`mode-${option}`}
              className={`rr-btn !min-h-11 !text-xs ${mode === option ? (option === 'jev' ? 'rr-btn-brain' : 'rr-btn-primary') : 'rr-btn-secondary'}`}
            >
              {option === 'drive' ? 'You drive' : 'The brain drives'}
            </button>
          ))}
        </div>
        {mode === 'jev' || twoRobots ? <p className="text-xs leading-snug text-cyan-muted">{STAND_IN_NOTE}</p> : null}
      </section>

      <p className="rounded-xl border border-dashed border-line-3 px-3 py-2 text-xs leading-snug text-text-2" data-testid="scenario-honesty">{LAB_HONESTY}</p>

      <button type="button" className="rr-btn rr-btn-primary !min-h-[60px] !rounded-2xl !text-xl !tracking-[2px]" onClick={start} data-testid="scenario-start">Start</button>
    </div>
  );
}
