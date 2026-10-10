'use client';

import type { Mission } from '@rivetrun/contracts';
import { TERRAIN_LOOK, UI } from '../palette';

export interface LaneDot {
  readonly id: string;
  /** Shown inside the dot: initials or an agent's short name. Two characters are used. */
  readonly label: string;
  /** The lane's colour. */
  readonly color: string;
  /** Distance along the track, as the room last reported it. */
  readonly xM: number;
  /** This phone's own robot: drawn last, larger, with a ring. */
  readonly me?: boolean;
  /** Who drives it when that is not the name itself (an AI model behind a player's lane). Shown in the legend. */
  readonly agent?: string;
}

export interface LaneProgressProps {
  mission: Mission;
  lanes: readonly LaneDot[];
  /** How often the positions arrive, ms: each dot glides to its new place over this long. Default 1000 (a phone's poll). */
  everyMs?: number;
  /** Under the strip: each lane's letters in its colour with its name and agent. */
  legend?: boolean;
}

const initials = (label: string): string => {
  const words = label.trim().split(/[\s·_-]+/).filter(Boolean);
  const short = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return short.toUpperCase();
};

/**
 * The room on one line: the mission's terrain strip with one dot per lane, from the room snapshot. Positions arrive
 * once per poll; each dot glides to the new one, so the race reads as movement, not as jumps. Plain DOM, no state.
 */
export function LaneProgress({ mission, lanes, everyMs = 1000, legend = false }: LaneProgressProps) {
  const total = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  const at = (x: number): string => `${Math.min(100, Math.max(0, (x / Math.max(1, total)) * 100))}%`;
  // Whoever is behind is drawn first, so the leader's dot stays on top; this phone's robot is always last.
  const order = [...lanes].sort((a, b) => Number(a.me === true) - Number(b.me === true) || a.xM - b.xM);
  return (
    <div>
    <div className="relative h-5" aria-label={`${mission.id} ${mission.name}: ${lanes.length} robots`}>
      <div className="absolute inset-x-2 top-2 flex h-[3px] overflow-hidden rounded-[2px]">
        {mission.track.segments.map((segment, i) => (
          <div key={i} className="h-full" style={{ width: `${(segment.lengthM / total) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }} />
        ))}
      </div>
      <div className="absolute inset-x-2 inset-y-0">
        {order.map((lane) => (
          <span
            key={lane.id}
            title={lane.label}
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-mono font-bold leading-none"
            style={{
              left: at(lane.xM),
              width: lane.me ? 20 : 16,
              height: lane.me ? 20 : 16,
              fontSize: lane.me ? 9 : 8,
              background: lane.color,
              color: UI.ink,
              border: `2px solid ${lane.me ? UI.text : UI.ink}`,
              boxSizing: 'border-box',
              transition: `left ${everyMs}ms linear`,
            }}
          >
            {initials(lane.label)}
          </span>
        ))}
      </div>
    </div>
    {legend ? (
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono text-[9px] leading-[12px]" style={{ color: UI.text }}>
        {lanes.map((lane) => (
          <span key={lane.id} className="whitespace-nowrap" style={{ fontWeight: lane.me ? 700 : 400 }}>
            <span style={{ color: lane.color, fontWeight: 700 }}>{initials(lane.label)}</span> {lane.label}
            {lane.agent ? <span style={{ color: UI.dim }}> · {lane.agent}</span> : null}
          </span>
        ))}
      </div>
    ) : null}
    </div>
  );
}
