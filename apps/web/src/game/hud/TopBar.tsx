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

interface GaugeProps {
  label: string;
  value: number;
  color: string;
  icon: 'battery' | 'damage';
}

function Gauge({ label, value, color, icon }: GaugeProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5" style={{ background: 'rgb(9 13 18 / 0.7)', border: `1px solid ${UI.line}` }}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0">
        {icon === 'battery' ? (
          <>
            <rect x="1" y="4" width="12" height="8" rx="1.5" fill="none" stroke={color} strokeWidth="1.5" />
            <rect x="13.5" y="6.5" width="1.5" height="3" fill={color} />
            <rect x="2.8" y="5.8" width={Math.max(0.5, (value / 100) * 8.4)} height="4.4" fill={color} />
          </>
        ) : (
          <path d="M8 1.5 14.5 13.5H1.5Zm0 4.2v3.8m0 1.6v.4" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between text-[9px] leading-none tracking-widest" style={{ color: UI.dim }}>
          <span>{label}</span>
          <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
            {Math.round(value)}%
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: '#0a0e13' }}>
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: color, transition: 'width 120ms linear' }} />
        </div>
      </div>
    </div>
  );
}

export interface TopBarProps {
  mission: Mission;
  state: SimState | null;
  ghosts?: readonly GhostTrace[];
}

/** Time, speed, battery, damage and a terrain strip with the three robots on it. */
export function TopBar({ mission, state, ghosts = [] }: TopBarProps) {
  const total = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  const t = state?.t ?? 0;
  const battery = state?.battery ?? 100;
  const damage = state?.damage ?? 0;
  const batteryColor = battery > 40 ? UI.ok : battery > 15 ? UI.warn : UI.bad;
  const damageColor = damage < 30 ? UI.dim : damage < 65 ? UI.warn : UI.bad;
  const at = (x: number): string => `${Math.min(100, Math.max(0, (x / total) * 100))}%`;

  return (
    <div className={`${styles.panel} ${styles.rivets} rounded-xl px-3 pb-2.5 pt-2 font-mono`} style={{ color: UI.text }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[11px] font-bold tracking-widest">
          <span style={{ color: UI.safety }}>{mission.id}</span>
          <span className="ml-1.5 uppercase">{mission.name}</span>
          {mission.weather !== 'clear' && (
            <span className="ml-1.5 uppercase" style={{ color: UI.blueprint }}>
              · {mission.weather}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-[10px] tabular-nums" style={{ color: UI.dim }}>
            {(state?.v ?? 0).toFixed(1)} m/s
          </span>
          <span className="text-[20px] font-bold leading-none tabular-nums">{formatTime(t)}</span>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <Gauge label="BATTERY" value={battery} color={batteryColor} icon="battery" />
        <Gauge label="DAMAGE" value={damage} color={damageColor} icon="damage" />
      </div>

      <div className="relative mt-3.5 h-2.5">
        <div className="flex h-full overflow-hidden rounded-sm" style={{ border: '1px solid #0a0e13' }}>
          {mission.track.segments.map((segment, i) => (
            <div key={i} className="relative h-full" style={{ width: `${(segment.lengthM / total) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }}>
              {segment.obstacle && <span className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2" style={{ background: '#0f141b' }} />}
            </div>
          ))}
        </div>
        {ghosts.map((trace) => (
          <span
            key={trace.policy}
            className="absolute -top-[7px] h-[6px] w-[6px] -translate-x-1/2 rounded-full"
            style={{ left: at(ghostX(trace, t)), background: POLICY_TINT[trace.policy], boxShadow: '0 0 0 1px #0f141b' }}
          />
        ))}
        <span
          className="absolute -bottom-[9px] -translate-x-1/2"
          style={{
            left: at(state?.x ?? 0),
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: `7px solid ${UI.safety}`,
            transition: 'left 80ms linear',
          }}
        />
      </div>
    </div>
  );
}
