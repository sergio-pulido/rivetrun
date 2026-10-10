'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LAB_PLAYER, LAB_SCENARIOS, LAB_SEEDS, deriveRobot, objectiveStatus, type LabScenarioId } from '@rivetrun/lab';
import { useBuildStore } from '@/state/build';
import { saveResult, useLabBests } from './bests';
import { SCENARIO_BRIEFS, labLoadouts, resultHeading, sensorLine } from './copy';
import { Simplifications } from './Simplifications';
import { JEV_FACTS_NOTE, JEV_LIVE_NOTE, JEV_VERDICT_NOTE, STAND_IN_NOTE } from './labBrain';
import { LabLegend } from './LabLegend';
import { LabPlay } from './LabPlay';
import { LabResult } from './LabResult';
import { forgetRun, lastRunLine, noteRun, useLastRun } from './lastRun';
import { useJevSeat, useLabRun, type LabMode, type LabRunSetup } from './useLabRun';

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
  const seat = useJevSeat();
  const jevLive = seat === null ? null : seat.live;
  /** Jev is asked without the fixed rules' verdict on each option. Only on offer when the server has that question. */
  const [factsOnly, setFactsOnly] = useState(false);
  const jevFacts = factsOnly && seat?.factsOnly === true;
  const loadout = loadouts.find((l) => l.id === loadoutId) ?? loadouts[0]!;
  const twoRobots = scenario.agents.length > 1;
  const robotLine = `${loadout.name} · ${sensorLine(loadout.build)}`;

  const result = view?.result;

  const lastRun = useLastRun(id);
  const driverLine = setup === null ? '' : setup.mode !== 'jev' ? 'you drove' : setup.jevLive ? 'Jev drove' : 'the fixed rules drove';

  useEffect(() => {
    if (!result || setup === null) return;
    const outcome = result.outcomes[LAB_PLAYER]!;
    saveResult(id, { score: outcome.score, stars: outcome.stars, timeS: outcome.timeS });
    // The result is also noted for this tab, so a reload of the result screen still says how the run ended.
    noteRun(id, { status: 'done', robot: robotLine, driver: driverLine, timeS: outcome.timeS, progress: `${outcome.objectivesDone}/${outcome.objectivesTotal} objectives`, heading: resultHeading(outcome, setup.jevLive), score: outcome.score });
  }, [result, id]); // eslint-disable-line react-hooks/exhaustive-deps -- the labels belong to the run that produced this result

  // While a run is on, note every two seconds of it where it stands: if the page is reloaded or left, the brief
  // says the run was cut off instead of showing nothing.
  const running = setup !== null && view !== null && !result;
  const noteTick = running ? Math.floor(view.state.t / 2) : -1;
  useEffect(() => {
    if (noteTick < 0 || view === null) return;
    const me = view.state.agents.find((agent) => agent.id === LAB_PLAYER);
    if (!me) return;
    const progress = objectiveStatus(view.state, me).map((status) => `${status.label} ${status.have}/${status.need}`).join(', ');
    noteRun(id, { status: 'running', robot: robotLine, driver: driverLine, timeS: Math.round(view.state.t * 10) / 10, progress });
  }, [noteTick, id]); // eslint-disable-line react-hooks/exhaustive-deps -- one note per two seconds of the run, not per frame

  // Counts every start on this page, also across "Change robot": a view from an earlier start never passes for this one.
  const attempts = useRef(0);
  const start = (): void => {
    attempts.current += 1;
    setBestBefore(bests[id]?.score ?? null);
    setSetup({ scenarioId: id, seed: LAB_SEEDS[0], build: loadout.build, mode, jevLive: jevLive === true, jevFacts, attempt: attempts.current });
  };
  // A brain seat is filled by whoever the probe finds: starting before it answers would seat the fixed rules unasked.
  const needsBrain = mode === 'jev' || scenario.agents.length > 1;
  const probing = needsBrain && seat === null;

  if (setup !== null && view !== null && result) {
    const score = result.outcomes[LAB_PLAYER]!.score;
    const newBest = score > 0 && (bestBefore === null || score > bestBefore);
    return <LabResult result={result} mode={setup.mode} robot={robotLine} jevLive={setup.jevLive} newBest={newBest} onRetry={start} onChangeBuild={() => setSetup(null)} />;
  }
  // Between a start and its first frame: neither the brief nor the last run.
  if (setup !== null && view === null) return <p className="rr-label py-10 text-center" role="status">Starting…</p>;
  if (setup !== null && view !== null) return <LabPlay view={view} controls={controls} mode={setup.mode} robot={robotLine} jevLive={setup.jevLive} jevFacts={setup.jevFacts} />;

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3">
      <section className="rr-rise flex flex-col gap-1.5">
        <h2 className="font-display text-xl font-bold uppercase tracking-[1px]">{scenario.name}</h2>
        <p className="text-[13px] leading-snug text-text-2">{scenario.description}</p>
      </section>

      {lastRun ? (
        <section className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${lastRun.status === 'running' ? 'border-warn' : 'border-line'}`} role="status" data-testid="scenario-last-run">
          <p className="min-w-0 flex-1 text-xs leading-snug text-text-2">{lastRunLine(lastRun)}</p>
          <button type="button" className="flex min-h-11 shrink-0 items-center font-mono text-[11px] font-medium tracking-[1px] text-orange-soft underline underline-offset-2" onClick={() => forgetRun(id)}>
            DISMISS
          </button>
        </section>
      ) : null}

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
        <h3 className="rr-label mt-1">On the map</h3>
        <LabLegend scenario={scenario} />
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
        <Link href="/workshop" className="flex min-h-11 items-center self-start font-mono text-[11px] font-medium tracking-[1px] text-orange-soft underline underline-offset-2">CHANGE MY ROBOT IN THE WORKSHOP</Link>
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
        {(mode === 'jev' || twoRobots) && seat?.live && seat.factsOnly ? (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="What Jev is told">
            {([false, true] as const).map((facts) => (
              <button
                key={String(facts)} type="button" aria-pressed={factsOnly === facts} onClick={() => setFactsOnly(facts)} data-testid={facts ? 'jev-facts' : 'jev-verdict'}
                className={`rr-btn !min-h-11 !text-[11px] ${factsOnly === facts ? 'rr-btn-brain' : 'rr-btn-secondary'}`}
              >
                {facts ? 'Jev decides from facts only' : 'Jev is told the verdict'}
              </button>
            ))}
          </div>
        ) : null}
        {mode === 'jev' || twoRobots ? (
          <p className="text-xs leading-snug text-cyan-muted" data-testid="scenario-brain-note">
            {jevLive === null ? 'Checking whether Jev is reachable…' : !jevLive ? STAND_IN_NOTE : jevFacts ? JEV_FACTS_NOTE : `${JEV_LIVE_NOTE} ${JEV_VERDICT_NOTE}`}
          </p>
        ) : null}
      </section>

      <Simplifications />

      <button type="button" className="rr-btn rr-btn-primary !min-h-[60px] !rounded-2xl !text-xl !tracking-[2px]" onClick={start} disabled={probing} data-testid="scenario-start">{probing ? 'Checking Jev…' : 'Start'}</button>
    </div>
  );
}
