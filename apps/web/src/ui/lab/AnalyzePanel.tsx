'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BRIEFING_MAX_CHARS, MissionIdSchema, type Plan, type PresetId } from '@rivetrun/contracts';
import { MISSIONS, driveSeed, heuristicBrain, runHeadless } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { formatSeconds } from '@/ui/format';
import { Icon } from '@/ui/Icon';
import { clampBriefing, planCaption, planFallback, planParts, readPlanAnswer, standInPlan, type PlanSource } from './plan';
import type { PlansByMission } from './planData';

interface AnalyzePanelProps {
  readonly missions: readonly { readonly id: string; readonly name: string }[];
  /** The planner's model as this server is configured (PLAN_MODEL). The card names the model that really answered. */
  readonly model: string;
  /** Pregenerated plans per mission and preset, shown (and labelled) when the planner does not answer. */
  readonly pregenerated: PlansByMission;
}

interface Shown {
  readonly plan: Plan;
  readonly source: PlanSource;
  readonly missionId: string;
}

interface TestResult {
  readonly finished: boolean;
  readonly timeS: number;
  readonly damagePct: number;
  readonly energyUsedPct: number;
}

/** The planner may take 30 s and its fallback provider as long again. */
const PLAN_TIMEOUT_MS = 60_000;
const FALLBACK_PRESET: PresetId = 'all_rounder';
const SOURCE_LABEL: Readonly<Record<PlanSource, string>> = { live: 'asked now', pregenerated: 'pregenerated', 'stand-in': 'stand-in · no model was asked' };
const NOTE = 'text-[11px] leading-snug text-muted lg:text-[13px]';

/**
 * /lab "Analyze scenario" (docs/PLAY_AND_PLAN.md §3): a reasoning model plans before the run from the mission brief;
 * the card shows its build, its reasons, and the briefing and priority every driver then gets. The plan can be tried
 * with the fixed rules here, opened in the Workshop, or raced in the Arena.
 */
export function AnalyzePanel({ missions, model, pregenerated }: AnalyzePanelProps) {
  const router = useRouter();
  const [missionId, setMissionId] = useState(missions[0]?.id ?? 'M1');
  const [thinkingSince, setThinkingSince] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState('');
  const [priority, setPriority] = useState(0.5);
  const [test, setTest] = useState<TestResult | 'running' | null>(null);
  const request = useRef<AbortController | null>(null);
  const store = useBuildStore();

  useEffect(() => {
    if (thinkingSince === null) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - thinkingSince), 100);
    return () => clearInterval(timer);
  }, [thinkingSince]);
  useEffect(() => () => request.current?.abort(), []);

  const show = (plan: Plan, source: PlanSource, forMission: string): void => {
    setShown({ plan, source, missionId: forMission });
    setBriefing(clampBriefing(plan.briefing));
    setPriority(plan.priority);
    setTest(null);
  };

  /** The planner did not give a plan: the pregenerated one for this mission, named as such; failing that, a preset that says it is a stand-in. */
  const fallBack = (forMission: string, reason: string): void => {
    const filed = pregenerated[forMission];
    const plan = filed?.[FALLBACK_PRESET] ?? Object.values(filed ?? {})[0];
    setError(reason);
    if (plan) show(plan, 'pregenerated', forMission);
    else show(standInPlan(FALLBACK_PRESET, new Date().toISOString()), 'stand-in', forMission);
  };

  const analyze = async (): Promise<void> => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const forMission = missionId;
    const timeout = setTimeout(() => controller.abort(), PLAN_TIMEOUT_MS);
    setError(null);
    setElapsedMs(0);
    setThinkingSince(Date.now());
    try {
      const response = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ missionId: forMission }), cache: 'no-store', signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      const plan = response.ok ? readPlanAnswer(body) : null;
      const fallback = planFallback(body);
      if (plan && fallback.pregenerated) {
        // The route itself fell back on the committed plan: it is shown as that, with the reason it gave.
        setError(`The planner gave no fresh plan${fallback.because ? `: ${fallback.because}` : ''}.`);
        show(plan, 'pregenerated', forMission);
      } else if (plan) {
        // Another provider than the configured one may have answered: the card names the model that did.
        if (fallback.because) setError(`${plan.generatedBy.model} answered instead of ${model} (${fallback.because}).`);
        show(plan, 'live', forMission);
      } else if (response.status === 404) fallBack(forMission, 'The planner is not on this server yet (HTTP 404).');
      else fallBack(forMission, response.ok ? 'The planner answered, but not with a valid plan.' : `The planner did not answer (HTTP ${response.status}).`);
    } catch {
      if (request.current === controller) fallBack(forMission, 'The planner could not be reached, or took longer than 60 s.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setThinkingSince(null);
    }
  };

  const runTest = async (plan: Plan, forMission: string): Promise<void> => {
    const mission = MISSIONS[MissionIdSchema.parse(forMission)];
    setTest('running');
    try {
      const { episode } = await runHeadless(mission, driveSeed(mission), plan.build, heuristicBrain, { priority, policy: 'heuristic' });
      const { finished, timeS, damagePct, energyUsedPct } = episode.outcome;
      setTest({ finished, timeS, damagePct, energyUsedPct });
    } catch {
      setTest(null);
      setError('The test run could not be made with this build.');
    }
  };

  const openInWorkshop = (plan: Plan, forMission: string): void => {
    const mission = MissionIdSchema.safeParse(forMission);
    store.setBuild(plan.build);
    store.setPriority(priority);
    store.setBriefing(briefing);
    if (mission.success) store.setMission(mission.data);
    router.push('/workshop');
  };

  const thinking = thinkingSince !== null;
  return (
    <section className="rr-card flex flex-col gap-3.5 p-4 lg:p-6" aria-labelledby="analyze" data-testid="analyze-panel">
      <div className="flex flex-col gap-1">
        <h2 id="analyze" className="font-display text-2xl font-bold leading-none">
          Analyze scenario
        </h2>
        <p className="text-[13px] leading-snug text-text-2 lg:text-base">Think slow before, decide fast during. A reasoning model reads the mission brief and plans the robot and the orders; a fast brain then drives by them.</p>
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="rr-label">Mission</span>
          <select value={missionId} onChange={(event) => setMissionId(event.target.value)} disabled={thinking} data-testid="analyze-mission" className="h-12 rounded-[10px] border border-line-2 bg-panel-2 px-3 font-display text-[15px] font-semibold text-text">
            {missions.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.id} · {mission.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void analyze()} disabled={thinking} data-testid="analyze-run" className="rr-btn rr-btn-primary !min-h-12 lg:min-w-[260px]">
          {thinking ? 'Thinking…' : 'Analyze'}
        </button>
      </div>
      <p className="-mt-1.5 flex flex-wrap items-baseline gap-x-2 font-mono text-xs text-text-2" aria-live="polite">
        <span>
          Planner: <span className="font-semibold text-text">{model}</span>
        </span>
        {thinking || shown ? (
          <span className={thinking ? 'text-cyan' : 'text-muted'}>
            {thinking ? 'thinking ' : 'answered after '}
            <span className="tabular-nums" data-testid="analyze-timer">
              {(elapsedMs / 1000).toFixed(1)} s
            </span>
          </span>
        ) : null}
      </p>

      {error ? (
        <p className="flex items-start gap-2 rounded-[12px] border border-warn/40 px-3 py-2 text-xs leading-snug text-warn lg:text-sm" role="alert" data-testid="analyze-error">
          <Icon name="warn" size={14} className="mt-px shrink-0" />
          <span>
            {error}
            {shown ? (shown.source === 'pregenerated' ? ' Showing the pregenerated plan for this mission instead.' : shown.source === 'stand-in' ? ' Showing a preset as a stand-in: it is not a plan.' : '') : ''}
          </span>
        </p>
      ) : null}

      {shown ? (
        <div className="flex flex-col gap-3.5 rounded-[14px] border border-cyan-line bg-cyan-deep p-3.5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:p-5" data-testid="analyze-card" data-source={shown.source}>
          <div className="flex flex-col gap-3">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.5px] text-cyan">Plan by</span>
              <span className="font-display text-lg font-bold leading-none text-cyan-soft" data-testid="analyze-model">
                {shown.plan.generatedBy.model}
              </span>
              <span className={`rounded-md border px-1.5 py-1 font-mono text-[9px] font-medium uppercase leading-none tracking-[1px] ${shown.source === 'live' ? 'border-cyan-line text-cyan' : 'border-warn/60 text-warn'}`}>{SOURCE_LABEL[shown.source]}</span>
            </p>
            <p className="text-sm leading-snug text-text lg:text-base" data-testid="analyze-rationale">
              {shown.plan.rationale}
            </p>
            <ul className="flex flex-col" data-testid="analyze-parts">
              {planParts(shown.plan).map((part) => (
                <li key={part.partId} data-part={part.partId} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-x-3 border-t border-cyan-line/60 py-1.5">
                  <span className="min-w-0">
                    <span className="block font-display text-[13px] font-semibold leading-tight lg:text-[15px]">{part.name}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-[1px] text-cyan-muted">{part.slot}</span>
                  </span>
                  <span className={`min-w-0 text-xs leading-snug lg:text-sm ${part.why ? 'text-text-2' : 'text-faint'}`}>{part.why ?? 'no reason given'}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between">
                <span className="rr-label">Briefing · every driver gets this text</span>
                <span className={`font-mono text-[11px] tabular-nums ${briefing.length >= BRIEFING_MAX_CHARS ? 'text-warn' : 'text-muted'}`} data-testid="analyze-briefing-count">
                  {briefing.length} / {BRIEFING_MAX_CHARS}
                </span>
              </span>
              <textarea value={briefing} maxLength={BRIEFING_MAX_CHARS} rows={3} onChange={(event) => setBriefing(clampBriefing(event.target.value))} data-testid="analyze-briefing" className="resize-none rounded-[10px] border border-line-2 bg-ground p-2.5 text-sm leading-snug text-text" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between">
                <span className="rr-label">Priority</span>
                <span className="font-mono text-[11px] tabular-nums text-text-2">{priority.toFixed(2)}</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={priority} onChange={(event) => setPriority(Number(event.target.value))} data-testid="analyze-priority" className="h-11 w-full accent-[var(--color-cyan)]" />
              <span className="flex justify-between font-mono text-[10px] uppercase tracking-[1px] text-muted">
                <span>0 · speed</span>
                <span>safety · 1</span>
              </span>
            </label>

            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => void runTest(shown.plan, shown.missionId)} disabled={test === 'running'} data-testid="analyze-test-heuristic" className="rr-btn rr-btn-secondary !min-h-11 !text-[13px]">
                Test with heuristic
              </button>
              <button type="button" onClick={() => openInWorkshop(shown.plan, shown.missionId)} data-testid="analyze-open-workshop" className="rr-btn rr-btn-secondary !min-h-11 !text-[13px]">
                Open in Workshop
              </button>
              <button type="button" disabled title="The arena room for a plan is not live on this server yet" data-testid="analyze-race-arena" className="rr-btn rr-btn-secondary !min-h-11 !text-[13px]">
                Race in Arena
              </button>
            </div>
            <p className={NOTE}>Race in Arena is not live yet: it will open four lanes (Jev + plan, Jev alone, GPT-6.1 Sol alone, GPT-6 Luna + plan).</p>

            {test && test !== 'running' ? (
              <div className="rounded-[10px] border border-line-2 bg-ground px-3 py-2.5" data-testid="analyze-heuristic-result" role="status">
                <p className="font-mono text-sm tabular-nums">
                  <span className={`font-semibold ${test.finished ? 'text-ok' : 'text-warn'}`}>{test.finished ? 'Finished' : 'Did not finish'}</span> · time {formatSeconds(test.timeS)} s · damage {Math.round(test.damagePct)} % · energy used {Math.round(test.energyUsedPct)} %
                </p>
                <p className={`mt-1 ${NOTE}`}>The fixed rules on this mission&apos;s Drive seed, with this build and this priority. They do not read the briefing.</p>
              </div>
            ) : null}
          </div>

          <p className="border-t border-cyan-line/60 pt-2.5 text-xs leading-snug text-cyan-soft lg:col-span-2 lg:text-sm" data-testid="analyze-caption">
            {planCaption(shown.plan, shown.source)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
