import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PlanSchema, type MissionId, type Plan, type PresetId } from '@rivetrun/contracts';
import { z } from 'zod';

// Pregenerated plans (docs/PLAY_AND_PLAN.md §1): one per mission and preset, committed in apps/web/data/plans.
// /play reads only these; /api/plan falls back on them when the model gives no usable answer.
export const PlanFileSchema = z.object({
  missionId: z.string(),
  /** When the file was written, and by which script. */
  generatedAt: z.string(),
  plans: z.record(z.string(), PlanSchema),
});
export type PlanFile = z.infer<typeof PlanFileSchema>;

/** `next dev` and `next start` both run with apps/web as the working directory. */
export const plansDir = (): string => path.join(process.cwd(), 'data', 'plans');

export function readPlanFile(missionId: MissionId): PlanFile | null {
  const file = path.join(plansDir(), `${missionId}.json`);
  if (!existsSync(file)) return null;
  try {
    const parsed = PlanFileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The stored plan for this mission and preset, or the All-rounder's when that preset has none. */
export function storedPlan(missionId: MissionId, presetId: PresetId): Plan | null {
  const file = readPlanFile(missionId);
  return file?.plans[presetId] ?? file?.plans.all_rounder ?? null;
}
