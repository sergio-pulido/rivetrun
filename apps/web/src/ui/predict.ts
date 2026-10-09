import type { Build } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';
import { z } from 'zod';

/** What the sim's predictStats(build) returns (docs/GAMEPLAY_V2.md §2). */
const PredictedSchema = z.object({
  topSpeedMps: z.number(),
  zeroToTopS: z.number(),
  maxClimbDeg: z.number(),
  rangeM: z.number(),
  massKg: z.number(),
  costEur: z.number(),
});
type Predicted = z.infer<typeof PredictedSchema>;

export interface PredictedStat {
  readonly key: keyof Predicted;
  readonly label: string;
  /** Null when the sim cannot predict it yet. */
  readonly value: string | null;
}

export interface Prediction {
  readonly stats: readonly PredictedStat[];
  /** True when the numbers come from the sim's predictStats; false when only the parts' own figures are known. */
  readonly live: boolean;
}

const format: Readonly<Record<keyof Predicted, { label: string; text: (value: number) => string }>> = {
  topSpeedMps: { label: 'Top speed', text: (v) => `${v.toFixed(1)} m/s` },
  zeroToTopS: { label: '0 to top', text: (v) => `${v.toFixed(1)} s` },
  maxClimbDeg: { label: 'Max climb', text: (v) => `${Math.round(v)}°` },
  rangeM: { label: 'Range', text: (v) => `${Math.round(v)} m` },
  massKg: { label: 'Mass', text: (v) => `${v.toFixed(2)} kg` },
  costEur: { label: 'Cost', text: (v) => `€${Math.round(v)}` },
};
const ORDER = Object.keys(format) as readonly (keyof Predicted)[];

const toStats = (values: Partial<Predicted>): readonly PredictedStat[] =>
  ORDER.map((key) => {
    const value = values[key];
    return { key, label: format[key].label, value: value === undefined ? null : format[key].text(value) };
  });

/**
 * The Workshop's live numbers for a build. Uses the sim's predictStats when the sim exports one that returns
 * the agreed shape; until then it shows what the parts already say and leaves acceleration and range blank.
 */
export function predict(build: Build): Prediction {
  const predictStats = (sim as { predictStats?: (build: Build) => unknown }).predictStats;
  if (typeof predictStats === 'function') {
    const parsed = PredictedSchema.safeParse(predictStats(build));
    if (parsed.success) return { stats: toStats(parsed.data), live: true };
  }
  const spec = sim.deriveSpec(build);
  return { stats: toStats({ topSpeedMps: spec.topSpeedMps, maxClimbDeg: spec.maxSlopeDeg, massKg: spec.massKg, costEur: spec.costEur }), live: false };
}
