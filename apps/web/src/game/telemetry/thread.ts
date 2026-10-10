import type { BrainQuestion, DecisionLog } from '@rivetrun/contracts';

/** One entry of a brain's thread: a sensor event, and the decision it led to once the answer is in. */
export interface ThreadEntry {
  readonly id: string;
  /** Sim time the event arrived (the decision was requested). */
  readonly t: number;
  /** "LIDAR · rock 11.8 m": what fired, in the sim's words. */
  readonly label: string;
  readonly knew: readonly string[];
  readonly unknown: readonly string[];
  /** Absent while the brain is still thinking. */
  readonly decision?: DecisionLog;
}

const entryOf = (log: DecisionLog, i: number, answered: boolean): ThreadEntry => ({
  id: `e${i}`,
  t: log.t,
  label: log.trigger.label,
  knew: log.knew,
  unknown: log.unknown,
  ...(answered ? { decision: log } : {}),
});

/**
 * A recorded thread (a ghost's decision log) as it stands at sim time `t`: entries appear when their
 * event arrives and get their choice when it took effect, so the thread runs on the ghost's clock.
 * Oldest first.
 */
export function threadAt(log: readonly DecisionLog[], t: number): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  log.forEach((item, i) => {
    if (item.t <= t) entries.push(entryOf(item, i, item.appliedT <= t));
  });
  return entries;
}

/** A live thread: every answered decision so far, plus the question that is out right now. Oldest first. */
export function liveThread(log: readonly DecisionLog[], pending: BrainQuestion | null): ThreadEntry[] {
  const entries = log.map((item, i) => entryOf(item, i, true));
  if (pending) {
    entries.push({
      id: `e${log.length}`,
      t: pending.t,
      label: pending.cause?.label ?? pending.trigger.replace('_', ' '),
      knew: pending.observation?.lines ?? [],
      unknown: pending.observation?.unknown ?? [],
    });
  }
  return entries;
}

/** A cheap fingerprint: the thread only repaints when an entry arrives or gets its answer. */
export const threadKey = (entries: readonly ThreadEntry[]): string => `${entries.length}:${entries.filter((entry) => entry.decision).length}`;
