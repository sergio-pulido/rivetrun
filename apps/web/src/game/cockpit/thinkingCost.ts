import type { DecisionLog } from '@rivetrun/contracts';

// RR-COCKPIT: what thinking costs. While a brain waits for its answer the robot keeps moving on its last command;
// the sim records that distance per decision (DecisionLog.lostM: speed when the trigger fired × latency).

export interface ThinkingCost {
  /** Metres driven without a fresh answer, summed over the run's decisions. */
  readonly metres: number;
  readonly decisions: number;
  /** Decisions whose answer arrived after the robot had already reached what triggered them. */
  readonly late: number;
}

/** Metres covered while this decision was being made. */
export const blindMetres = (log: Pick<DecisionLog, 'lostM'>): number => Math.max(0, log.lostM);

const DISTANCE = /(\d+(?:\.\d+)?)\s*m\b/;

/**
 * Whether the answer came too late: the trigger named a distance ("LIDAR · rock 11.8 m", "scan zone in 3 m") and
 * the robot covered at least that much before the answer. A trigger with no distance in its text is never counted.
 */
export function arrivedLate(log: Pick<DecisionLog, 'lostM' | 'trigger'>): boolean {
  const ahead = Number(DISTANCE.exec(log.trigger.label)?.[1]);
  return Number.isFinite(ahead) && ahead > 0 && blindMetres(log) >= ahead;
}

export function thinkingCost(logs: ReadonlyArray<Pick<DecisionLog, 'lostM' | 'trigger'>>): ThinkingCost {
  return {
    metres: logs.reduce((sum, log) => sum + blindMetres(log), 0),
    decisions: logs.length,
    late: logs.filter(arrivedLate).length,
  };
}
