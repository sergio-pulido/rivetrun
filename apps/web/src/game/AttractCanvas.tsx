'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { GhostTrace, Mission } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, heuristicBrain, runHeadless } from '@rivetrun/sim';
import { DNF_LABEL, UI } from './palette';
import { quality } from './quality';
import { SceneFrame } from './SceneFrame';
import { SceneLoader } from './SceneLoader';
import { AttractScene, type AttractClock, type AttractEntry } from './run/AttractScene';

/** One colour per lane, front to back. */
const LANE_COLORS = [UI.safety, UI.cyan, UI.ok, '#cdb4f0', UI.warn, '#f472b6'] as const;

export interface AttractCanvasProps {
  /** Track to replay on. Default: M5, the Room Challenge. */
  mission?: Mission;
  /** Playback rate against sim time. */
  speed?: number;
  /** Legend with each robot's progress and result. Turn it off to draw your own chrome. */
  legend?: boolean;
  /** Called once when the replay has drawn its first frame. */
  onReady?: () => void;
}

/** Recorded headless runs of every preset with the heuristic brain: deterministic, instant, offline. */
function useAttractEntries(mission: Mission): readonly AttractEntry[] | null {
  const [entries, setEntries] = useState<readonly AttractEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const seed = mission.fixedSeed ?? 1;
    const presets = Object.values(PRESETS);
    Promise.all(presets.map((preset) => runHeadless(mission, seed, preset.build, heuristicBrain, { policy: 'heuristic' })))
      .then((results) => {
        if (cancelled) return;
        setEntries(
          results.map((result, i) => ({
            id: presets[i]!.id,
            label: presets[i]!.name.toUpperCase(),
            color: LANE_COLORS[i % LANE_COLORS.length]!,
            build: presets[i]!.build,
            trace: result.ghost,
            decisions: result.episode.decisions.map((decision) => ({ t: decision.t, selected: decision.selected })),
          })),
        );
      })
      .catch(() => {
        // The lobby must never break because the attract loop could not be recorded: show nothing.
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mission]);
  return entries;
}

function progressAt(trace: GhostTrace, t: number, lengthM: number): number {
  const frames = trace.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(1, Math.max(0, (frames[lo]?.x ?? 0) / lengthM));
}

/** Who is where: one row per robot, updated a few times a second from the replay clock. */
function Legend({ mission, entries, clock }: { mission: Mission; entries: readonly AttractEntry[]; clock: RefObject<AttractClock> }) {
  const [t, setT] = useState(0);
  // Sized from the stage it sits in (a wall display, a laptop, or a panel inside the lobby), not from the window.
  const panel = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setT(clock.current.t), 200);
    const stage = panel.current?.parentElement;
    const fit = () => setZoom(Math.min(2, Math.max(0.6, (stage?.clientWidth ?? window.innerWidth) / 1000)));
    fit();
    const observer = stage && typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (stage) observer?.observe(stage);
    return () => {
      window.clearInterval(id);
      observer?.disconnect();
    };
  }, [clock]);
  const lengthM = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);

  return (
    <div ref={panel} // Sits a line above the bottom edge: the big screen puts its own "demo replay" note along the bottom of this panel.
      className="pointer-events-none absolute bottom-11 left-4 w-[320px] rounded-2xl px-4 py-3" style={{ zoom, background: 'rgb(14 16 19 / 0.86)', border: '1px solid #262b33', color: UI.text }}>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[15px] font-bold tracking-[2px]" style={{ color: UI.cyan }}>
          ONE BRAIN · {entries.length} BODIES
        </span>
        <span className="font-mono text-[10px] tracking-[1px]" style={{ color: UI.dim }}>
          {mission.id} · {t.toFixed(0).padStart(2, '0')} s
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {entries.map((entry) => {
          const last = entry.trace.frames[entry.trace.frames.length - 1];
          const ended = last !== undefined && t >= last.t;
          const outcome = entry.trace.outcome;
          const progress = progressAt(entry.trace, t, lengthM);
          const status = !ended
            ? `${Math.round(progress * 100)}%`
            : outcome.finished
              ? `${outcome.timeS.toFixed(1)} s`
              : (outcome.dnfReason ? DNF_LABEL[outcome.dnfReason] : 'DNF').toUpperCase();
          return (
            <div key={entry.id} className="flex items-center gap-2 font-mono text-[11px] leading-none">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
              <span className="w-[92px] shrink-0 truncate">{entry.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-[3px]" style={{ background: UI.line }}>
                <div className="h-full rounded-[3px]" style={{ width: `${progress * 100}%`, background: ended && !outcome.finished ? UI.bad : entry.color, transition: 'width 200ms linear' }} />
              </div>
              <span className="w-[76px] shrink-0 text-right tabular-nums" style={{ color: ended ? (outcome.finished ? UI.ok : UI.bad) : UI.dim }}>
                {status}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 font-mono text-[9px] tracking-[1px]" style={{ color: UI.dim }}>
        SAME TRACK · SAME SEED · SAME DRIVER
      </div>
    </div>
  );
}

/**
 * Attract mode for the big screen: every preset replays the same track side by side, on a loop.
 * Self-contained: no network, no saved loadout, no sound. Fills its parent; built for landscape.
 */
export default function AttractCanvas({ mission = MISSIONS.M5, speed = 1, legend = true, onReady }: AttractCanvasProps) {
  const entries = useAttractEntries(mission);
  const clock = useRef<AttractClock>({ t: 0, loop: 0 });
  const tier = quality();

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: UI.ink }}>
      {/* Recording the replays is quick, but the cover is up from the very first paint. */}
      {entries === null && <SceneLoader label="Warming up the replay" tips />}
      {entries && entries.length === 0 && <SceneLoader failed="Replay unavailable" tips={false} />}
      {entries && entries.length > 0 && (
        <>
          <SceneFrame label="Warming up the replay" tips unattended camera={{ fov: 38, near: 0.5, far: 420, position: [0, 6, 24] }} canvasStyle={{ touchAction: 'none' }} onReady={onReady}>
            {(plain) => <AttractScene mission={mission} entries={entries} clock={clock} speed={speed} particleBudget={tier.particles} plain={plain} />}
          </SceneFrame>
          {legend && <Legend mission={mission} entries={entries} clock={clock} />}
        </>
      )}
    </div>
  );
}
