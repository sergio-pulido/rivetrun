'use client';

import type { GhostTrace, Mission, SimState } from '@rivetrun/contracts';
import { POLICY_TINT, TERRAIN_LOOK, UI } from '../palette';
import styles from './hud.module.css';

const formatTime = (t: number): string => {
  const minutes = Math.floor(t / 60);
  const seconds = t - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
};

function ghostX(trace: GhostTrace, t: number): number {
  const frames = trace.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo]?.x ?? 0;
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex w-[82px] flex-col gap-[3px]">
      <span className="font-mono text-[9px] leading-none tracking-[1px]" style={{ color: UI.dim }}>
        {label} {Math.round(value)}%
      </span>
      <div className="h-1.5 overflow-hidden rounded-[3px]" style={{ background: UI.line }}>
        <div className="h-full rounded-[3px]" style={{ width: `${value}%`, background: color, transition: 'width 120ms linear' }} />
      </div>
    </div>
  );
}

export interface TopBarProps {
  mission: Mission;
  state: SimState | null;
  ghosts?: readonly GhostTrace[];
}

/** Time, battery, damage and the terrain strip with the player and the ghosts on it. */
export function TopBar({ mission, state, ghosts = [] }: TopBarProps) {
  const total = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  const t = state?.t ?? 0;
  const battery = state?.battery ?? 100;
  const damage = state?.damage ?? 0;
  const at = (x: number): string => `${Math.min(100, Math.max(0, (x / total) * 100))}%`;

  return (
    <div className={`${styles.topbar} flex flex-col gap-2 px-3 py-2.5`} style={{ color: UI.text }}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[22px] font-semibold leading-none tabular-nums">{formatTime(t)}</span>
        <div className="flex gap-3">
          <Gauge label="BATTERY" value={battery} color={battery > 15 ? UI.cyan : UI.bad} />
          <Gauge label="DAMAGE" value={damage} color={damage < 65 ? UI.safety : UI.bad} />
        </div>
      </div>

      <div className="relative h-3.5" aria-label={`${mission.id} ${mission.name}`}>
        <div className="absolute inset-x-0 top-1.5 flex h-[3px] overflow-hidden rounded-[2px]">
          {mission.track.segments.map((segment, i) => (
            <div key={i} className="relative h-full" style={{ width: `${(segment.lengthM / total) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }}>
              {segment.obstacle && <span className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2" style={{ background: UI.ink }} />}
            </div>
          ))}
        </div>
        {ghosts.map((trace) => (
          <span
            key={trace.policy}
            className="absolute top-px h-3 w-3 -translate-x-1/2 rounded-full"
            style={{ left: at(ghostX(trace, t)), background: POLICY_TINT[trace.policy], opacity: 0.6 }}
          />
        ))}
        <span
          className="absolute top-0 box-border h-3.5 w-3.5 -translate-x-1/2 rounded-full"
          style={{ left: at(state?.x ?? 0), background: UI.safety, border: `2px solid ${UI.ink}`, transition: 'left 80ms linear' }}
        />
      </div>
    </div>
  );
}
