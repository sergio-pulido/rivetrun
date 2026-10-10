import { askPlanner, buildPlanPrompt, extractJson, PLAN_SYSTEM, type PlannerAnswer } from '@rivetrun/brain/plan';
import { PlanSchema, type MissionId, type Plan, type PresetId } from '@rivetrun/contracts';
import { compileTrack, MISSIONS, missionDemands, PARTS, PARTS_BY_ID, PRESETS } from '@rivetrun/sim';
import { z } from 'zod';

// RR-PLAN §1 (docs/PLAY_AND_PLAN.md): the plan a reasoning model makes from the mission brief, before the run.

/** What the model must return; `generatedBy` is stamped here, never taken from the model. */
const PlanAnswerSchema = PlanSchema.omit({ generatedBy: true });

/** The mission as the Brief shows it to a player: nothing a player could not read before the run. */
export function missionBrief(missionId: MissionId): unknown {
  const mission = MISSIONS[missionId];
  return {
    id: mission.id,
    name: mission.name,
    description: mission.description,
    lengthM: Math.round(compileTrack(mission.track).lengthM),
    weather: mission.weather,
    stretches: missionDemands(mission).map((demand) => ({ fromM: Math.round(demand.startM), toM: Math.round(demand.endM), terrain: demand.terrain, needs: demand.tests.map((test) => test.label) })),
    scanZones: (mission.scanZones ?? []).map((zone) => ({ label: zone.label, atM: zone.atM, scannedWithAnyOf: zone.needs })),
  };
}

const catalog = (): unknown => PARTS.map((part) => ({ id: part.id, name: part.name, slot: part.slot, blurb: part.blurb, massKg: part.massKg, costEur: part.costEur, powerW: part.powerW, effects: part.effects }));
const presets = (): unknown => Object.values(PRESETS).map((preset) => ({ id: preset.id, name: preset.name, blurb: preset.blurb, build: preset.build }));

/** A build is usable when every id exists and sits in the slot it is used for. */
function buildProblem(plan: z.infer<typeof PlanAnswerSchema>): string | null {
  const slotOf = (id: string): string | undefined => PARTS_BY_ID.get(id as never)?.slot;
  const { build } = plan;
  if (slotOf(build.locomotion) !== 'locomotion') return `"${build.locomotion}" is not a locomotion part`;
  if (slotOf(build.motor) !== 'motor') return `"${build.motor}" is not a motor`;
  if (slotOf(build.battery) !== 'battery') return `"${build.battery}" is not a battery`;
  for (const id of build.sensors) if (slotOf(id) !== 'sensor') return `"${id}" is not a sensor`;
  for (const id of build.extras) if (slotOf(id) !== 'extra') return `"${id}" is not an extra`;
  for (const item of plan.partsWhy) if (!PARTS_BY_ID.has(item.partId as never)) return `partsWhy names "${item.partId}", which is not in the catalog`;
  return null;
}

/**
 * A plan for a picked vehicle must stay that vehicle (so the vehicle a player taps still means something when every
 * AI driver runs the plan): same locomotion, motor and battery; at most one sensor and one extra replaced.
 */
function vehicleProblem(plan: z.infer<typeof PlanAnswerSchema>, presetId: PresetId): string | null {
  const preset = PRESETS[presetId].build;
  const { build } = plan;
  if (plan.presetId !== presetId) return `presetId must be "${presetId}"`;
  if (build.locomotion !== preset.locomotion) return `keep the vehicle's locomotion "${preset.locomotion}"`;
  if (build.motor !== preset.motor) return `keep the vehicle's motor "${preset.motor}"`;
  if (build.battery !== preset.battery) return `keep the vehicle's battery "${preset.battery}"`;
  const replaced = (mine: readonly string[], theirs: readonly string[]): number => theirs.filter((id) => !mine.includes(id)).length;
  if (replaced(build.sensors, preset.sensors) > 1) return `replace at most one of the vehicle's sensors (${preset.sensors.join(', ')})`;
  if (replaced(build.extras, preset.extras) > 1) return `replace at most one of the vehicle's extras (${preset.extras.join(', ')})`;
  return null;
}

export interface PlanResult {
  readonly plan: Plan;
  /** 'model' = planned now; 'pregenerated' = the model's answers were unusable and the committed plan is returned. */
  readonly source: 'model' | 'pregenerated';
  readonly costUsd: number;
  /** Why the first provider was not the one that answered, when it was not. */
  readonly fellBackBecause?: string;
}

const stamp = (answer: PlannerAnswer): Plan['generatedBy'] => ({ provider: answer.provider, model: answer.model, ms: answer.ms, at: new Date().toISOString() });

/** Cuts a text that runs over its limit at the last full sentence that fits, else at the last word. */
function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '));
  if (sentence > max * 0.5) return head.slice(0, sentence + 1).trim();
  return head.slice(0, Math.max(0, head.lastIndexOf(' '))).trim();
}

/** Trims what a model wrote a little too long, so a 143-character briefing is not a reason to plan again. */
function tidy(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (typeof record.briefing === 'string') record.briefing = clip(record.briefing, 140);
  if (typeof record.rationale === 'string') record.rationale = clip(record.rationale, 300);
  if (Array.isArray(record.partsWhy)) record.partsWhy = record.partsWhy.slice(0, 4).map((item) => (typeof item === 'object' && item !== null && typeof (item as { why?: unknown }).why === 'string' ? { ...item, why: clip((item as { why: string }).why, 80) } : item));
  return record;
}

/**
 * Plans one mission: the model, one retry with the validation error, then the pregenerated plan for the closest
 * preset (`fallback`, read by the caller from apps/web/data/plans). Throws only when there is nothing to fall back on.
 */
export async function makePlan(missionId: MissionId, presetId: PresetId | undefined, fallback: (preset: PresetId) => Plan | null): Promise<PlanResult> {
  const base = { brief: missionBrief(missionId), parts: catalog(), presets: presets(), ...(presetId ? { presetId } : {}) };
  let costUsd = 0;
  let previousError: string | undefined;
  let fellBackBecause: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let answer: PlannerAnswer;
    try {
      answer = await askPlanner(PLAN_SYSTEM, buildPlanPrompt({ ...base, ...(previousError ? { previousError } : {}) }));
    } catch {
      break; // neither provider answered: the pregenerated plan below
    }
    costUsd += answer.costUsd;
    fellBackBecause ??= answer.fellBackBecause;
    const parsed = PlanAnswerSchema.safeParse(tidy(extractJson(answer.text)));
    const problem = parsed.success ? (buildProblem(parsed.data) ?? (presetId ? vehicleProblem(parsed.data, presetId) : null)) : parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || 'answer'}: ${issue.message}`).join('; ');
    if (parsed.success && problem === null) return { plan: { ...parsed.data, generatedBy: stamp(answer) }, source: 'model', costUsd, ...(fellBackBecause ? { fellBackBecause } : {}) };
    previousError = problem ?? 'not a JSON object of the requested shape';
  }
  const stored = fallback(presetId ?? 'all_rounder');
  if (!stored) throw new Error('no plan: the model gave no usable answer and no pregenerated plan exists for this mission');
  return { plan: stored, source: 'pregenerated', costUsd, ...(fellBackBecause ? { fellBackBecause } : {}) };
}
