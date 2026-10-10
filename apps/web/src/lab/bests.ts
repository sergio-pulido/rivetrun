// Best score per Lab Mission, kept on the device.
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { readJson, writeJson } from '@/state/storage';

const KEY = 'rivetrun.lab.bests.v1';
const BestsSchema = z.record(z.string(), z.object({ score: z.number(), stars: z.number().int().min(0).max(3), timeS: z.number() }));
export type LabBests = z.infer<typeof BestsSchema>;

/** Stored bests, or none when nothing valid is stored. */
export function readBests(): LabBests {
  const parsed = BestsSchema.safeParse(readJson(KEY));
  return parsed.success ? parsed.data : {};
}

/** The bests with this result folded in. A result only replaces a lower score. */
export function withResult(bests: LabBests, scenarioId: string, result: { score: number; stars: number; timeS: number }): LabBests {
  const before = bests[scenarioId];
  return before !== undefined && before.score >= result.score ? bests : { ...bests, [scenarioId]: { score: result.score, stars: result.stars, timeS: result.timeS } };
}

const NONE: LabBests = {};
let cached: LabBests | undefined;
const listeners = new Set<() => void>();

/** Records a result; returns true when it is a new best. */
export function saveResult(scenarioId: string, result: { score: number; stars: number; timeS: number }): boolean {
  const before = cached ?? readBests();
  const after = withResult(before, scenarioId, result);
  if (after === before) return false;
  cached = after;
  writeJson(KEY, after);
  listeners.forEach((listener) => listener());
  return true;
}

/** The bests on this device. Empty on the server and on the first client render, so the two match. */
export function useLabBests(): LabBests {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => (cached ??= readBests()),
    () => NONE,
  );
}
