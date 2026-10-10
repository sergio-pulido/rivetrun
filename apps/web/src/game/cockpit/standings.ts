import type { PilotTag } from '../hud/strategy';

// RR-COCKPIT: the live order of a race, from whatever the page already knows about each robot.

export interface Racer {
  readonly id: string;
  readonly name: string;
  /** The robot this screen belongs to. */
  readonly me?: boolean;
  /** Distance along the track right now. */
  readonly xM: number;
  readonly damagePct: number;
  /** Set once it has crossed the line: its time. */
  readonly finishedS?: number;
  /** Set once it is out of the race: why, in a word or two. */
  readonly out?: string;
  /** Picked on /play (RR-PLAN): its agent and strategy, shown as a chip. */
  readonly pilot?: PilotTag;
  readonly tint?: string;
}

export interface Standing extends Racer {
  readonly rank: number;
  /** "LEAD", "−4.2 m", "31.4 s", "+2.1 s" or the reason it is out. */
  readonly gap: string;
}

const order = (a: Racer, b: Racer): number => {
  const group = (racer: Racer): number => (racer.finishedS !== undefined ? 0 : racer.out ? 2 : 1);
  if (group(a) !== group(b)) return group(a) - group(b);
  if (a.finishedS !== undefined && b.finishedS !== undefined) return a.finishedS - b.finishedS;
  return b.xM - a.xM;
};

/** Finishers first by time, then whoever is furthest along, then those that are out. */
export function rankRacers(racers: readonly Racer[]): Standing[] {
  const sorted = [...racers].sort(order);
  const leader = sorted[0];
  return sorted.map((racer, i) => {
    let gap: string;
    if (racer.out) gap = racer.out;
    else if (racer.finishedS !== undefined) gap = i === 0 || leader?.finishedS === undefined ? `${racer.finishedS.toFixed(1)} s` : `+${(racer.finishedS - leader.finishedS).toFixed(1)} s`;
    else if (i === 0) gap = 'LEAD';
    else if (leader?.finishedS !== undefined) gap = `${Math.round(racer.xM)} m`;
    else gap = `−${Math.max(0, (leader?.xM ?? racer.xM) - racer.xM).toFixed(1)} m`;
    return { ...racer, rank: i + 1, gap };
  });
}
