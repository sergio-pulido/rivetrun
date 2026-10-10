// What happened to the last run of each scenario in this tab, kept across a reload or a trip back to the picker,
// so that a run that was cut off, or a result that was on screen, does not just vanish.
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

const KEY = 'rivetrun.lab.lastRun.v1';

const LastRunSchema = z.object({
  /** running = the run had started and no result was reached before the page went away. */
  status: z.enum(['running', 'done']),
  /** The robot and who drove, as the run screen named them. */
  robot: z.string(),
  driver: z.string(),
  /** Sim time when this was last written. */
  timeS: z.number().min(0),
  /** Objectives as "label have/need", joined. */
  progress: z.string(),
  heading: z.string().optional(),
  score: z.number().optional(),
});
export type LastRun = z.infer<typeof LastRunSchema>;
const RecordSchema = z.record(z.string(), LastRunSchema);
type LastRuns = z.infer<typeof RecordSchema>;

const NONE: LastRuns = {};
let cached: LastRuns | undefined;
const listeners = new Set<() => void>();

// sessionStorage, not localStorage: this is this tab's own recent history. Never throws (private mode, SSR).
function read(): LastRuns {
  try {
    if (typeof window === 'undefined') return NONE;
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = RecordSchema.safeParse(raw === null ? {} : JSON.parse(raw));
    return parsed.success ? parsed.data : NONE;
  } catch {
    return NONE;
  }
}

function write(next: LastRuns): void {
  cached = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The page works without it: the note is only lost with the tab.
  }
  listeners.forEach((listener) => listener());
}

/** The record with one scenario's run replaced. Pure. */
export const withRun = (runs: LastRuns, scenarioId: string, run: LastRun): LastRuns => ({ ...runs, [scenarioId]: run });

/** Notes where a scenario's run stands. Called at the start, every couple of seconds, and at the result. */
export function noteRun(scenarioId: string, run: LastRun): void {
  write(withRun(cached ?? read(), scenarioId, run));
}

export function forgetRun(scenarioId: string): void {
  write(Object.fromEntries(Object.entries(cached ?? read()).filter(([id]) => id !== scenarioId)));
}

/** One line for the brief: what became of the last run here. */
export function lastRunLine(run: LastRun): string {
  if (run.status === 'done') return `Last run here: ${run.heading ?? 'finished'}${run.score !== undefined ? ` · score ${run.score}` : ''} · ${run.timeS} s · ${run.robot} · ${run.driver}.`;
  return `Your last run here stopped at ${run.timeS} s without a result (${run.progress}): the page was reloaded or left. It was not scored.`;
}

/** The last run of a scenario in this tab, if any. Nothing on the server and on the first client render, so the two match. */
export function useLastRun(scenarioId: string): LastRun | undefined {
  const runs = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => (cached ??= read()),
    () => NONE,
  );
  return runs[scenarioId];
}
