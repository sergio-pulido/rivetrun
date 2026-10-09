'use client';

import type { GhostTrace, Mission, Perception, SimState } from '@rivetrun/contracts';
import { ACTION_LABEL, DNF_LABEL, POLICY_LABEL, POLICY_TINT, TERRAIN_LOOK, UI } from '@/game/palette';
import { useRunView, type RunFeed, type RunView } from '@/game/runFeed';

interface RunOverlayProps {
  readonly mission: Mission;
  readonly feed: RunFeed;
  readonly ghosts: readonly GhostTrace[];
}

const show = (value: string | number | null, unit = ''): string =>
  value === 'unknown' ? '?' : value === null ? 'clear' : `${value}${unit}`;

/** Position of a ghost at sim time t (frames are evenly spaced; the last one holds). */
function ghostAt(ghost: GhostTrace, t: number): SimState | undefined {
  const last = ghost.frames.at(-1);
  if (!last || t >= last.t) return last;
  return ghost.frames.find((frame) => frame.t >= t) ?? last;
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-200">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-line">
        <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function TopBar({ mission, state }: { mission: Mission; state: SimState | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-line bg-slate-panel/90 px-3 py-2 backdrop-blur">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-safety">{mission.id}</span>
        <span className="font-mono text-lg tabular-nums leading-none">{(state?.t ?? 0).toFixed(1)}s</span>
      </div>
      <Meter label="Battery" value={state?.battery ?? 100} color={UI.ok} />
      <Meter label="Damage" value={state?.damage ?? 0} color={UI.bad} />
    </div>
  );
}

function TrackStrip({ mission, state, ghosts }: { mission: Mission; state: SimState | null; ghosts: readonly GhostTrace[] }) {
  const length = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  const left = (x: number): string => `${Math.min(100, Math.max(0, (x / length) * 100))}%`;
  const t = state?.t ?? 0;
  return (
    <div className="relative mt-2 h-5">
      <div className="absolute inset-x-0 top-1.5 flex h-2 overflow-hidden rounded-full">
        {mission.track.segments.map((segment, index) => (
          <div key={index} style={{ width: `${(segment.lengthM / length) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }} />
        ))}
      </div>
      {ghosts.map((ghost) => (
        <div
          key={ghost.policy}
          className="absolute top-0.5 h-4 w-1 -translate-x-1/2 rounded-full opacity-80"
          style={{ left: left(ghostAt(ghost, t)?.x ?? 0), background: POLICY_TINT[ghost.policy] }}
        />
      ))}
      <div
        className="absolute top-0 h-5 w-2 -translate-x-1/2 rounded-full border border-slate-ink bg-safety"
        style={{ left: left(state?.x ?? 0) }}
      />
    </div>
  );
}

function Sensors({ perceived }: { perceived: Perception }) {
  const terrain = perceived.terrainAhead === 'unknown' ? '?' : TERRAIN_LOOK[perceived.terrainAhead].label;
  const cells: readonly [string, string][] = [
    ['Ahead', `${terrain} ${perceived.terrainAheadDistanceM === 'unknown' ? '' : `${perceived.terrainAheadDistanceM} m`}`],
    ['Obstacle', show(perceived.obstacleAheadM, ' m')],
    ['Slip', show(perceived.slipPct, '%')],
    ['Tilt', show(perceived.tiltDeg, '°')],
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5 text-center">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-md bg-slate-ink/70 px-1 py-1">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
          <div className="truncate font-mono text-[11px] text-slate-200">{value}</div>
        </div>
      ))}
    </div>
  );
}

function BrainPanel({ view }: { view: RunView }) {
  const shown = view.pending ? { question: view.pending.question, decision: null } : view.decision;
  if (!shown) return null;
  const { question, decision } = shown;
  const fallback = decision?.fallback === true;
  const badge = !decision ? 'THINKING…' : fallback ? 'FALLBACK' : POLICY_LABEL[decision.policy];
  return (
    <div className="rounded-xl border border-slate-line bg-slate-panel/90 p-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider">
        <span className="text-slate-400">Brain · {question.trigger.replace('_', ' ')}</span>
        <span className="flex items-center gap-2">
          {decision ? <span className="font-mono text-slate-400">{Math.round(decision.latencyMs)} ms</span> : null}
          <span className="rounded px-1.5 py-0.5 font-bold text-slate-ink" style={{ background: fallback ? UI.warn : decision ? UI.safety : UI.led }}>
            {badge}
          </span>
        </span>
      </div>
      <Sensors perceived={question.perceived} />
      <div className="mt-2 flex flex-col gap-1">
        {question.options.map((action) => {
          const probability = decision?.probabilities[action] ?? 0;
          const chosen = decision?.selected === action;
          return (
            <div key={action} className="flex items-center gap-2 text-[11px]">
              <span className={`w-24 shrink-0 truncate ${chosen ? 'font-bold text-safety' : 'text-slate-300'}`}>{ACTION_LABEL[action]}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-line">
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${probability * 100}%`, background: chosen ? UI.safety : UI.dim }}
                />
              </div>
              <span className="w-8 text-right font-mono tabular-nums text-slate-400">{decision ? `${Math.round(probability * 100)}%` : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndBanner({ view }: { view: RunView }) {
  if (!view.done || !view.outcome) return null;
  const title = view.outcome.finished ? 'FINISHED' : view.dnfReason ? DNF_LABEL[view.dnfReason].toUpperCase() : 'DNF';
  return (
    <div className="absolute inset-x-6 top-1/3 rounded-2xl border-2 border-safety bg-slate-panel/95 p-5 text-center shadow-2xl">
      <div className="text-3xl font-black tracking-wide text-safety">{title}</div>
      <div className="mt-1 font-mono text-xl tabular-nums">{view.outcome.score} pts</div>
      {view.outcome.why ? <div className="mt-2 text-sm text-slate-300">{view.outcome.why}</div> : null}
    </div>
  );
}

/** Run HUD: top bar, track strip with ghosts, Brain panel, end banner. DOM only. */
export function RunOverlay({ mission, feed, ghosts }: RunOverlayProps) {
  const view = useRunView(feed);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 font-sans">
      <div>
        <TopBar mission={mission} state={view.state} />
        <TrackStrip mission={mission} state={view.state} ghosts={ghosts} />
        {view.pending ? <div className="mt-1 text-center text-[10px] uppercase tracking-[0.3em] text-cyan-300">slow-mo · brain deciding</div> : null}
      </div>
      <EndBanner view={view} />
      <BrainPanel view={view} />
    </div>
  );
}
