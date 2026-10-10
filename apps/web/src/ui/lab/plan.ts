// RR-PLAN (docs/PLAY_AND_PLAN.md): reading a Plan from the planner route or from a pregenerated file, and what the
// Analyze card says about it. Pure: nothing here invents a plan that claims to come from a model.
import { BRIEFING_MAX_CHARS, PlanSchema, PresetIdSchema, type Build, type Plan, type PresetId } from '@rivetrun/contracts';
import { PARTS_BY_ID, PRESETS } from '@rivetrun/sim';

/** Where the plan on the card came from: asked now, read from a committed file, or a preset standing in for a planner that is not there. */
export type PlanSource = 'live' | 'pregenerated' | 'stand-in';

const record = (raw: unknown): Readonly<Record<string, unknown>> => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Readonly<Record<string, unknown>>) : {});

/** The planner's answer: a Plan as the body, or wrapped as { plan } or { data }. Null when it is not a valid Plan. */
export function readPlanAnswer(body: unknown): Plan | null {
  const fields = record(body);
  for (const candidate of [body, fields.plan, fields.data]) {
    const parsed = PlanSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** The route answers { plan, source } and says so when it handed back the committed plan instead of a fresh one. */
export function planFallback(body: unknown): { readonly pregenerated: boolean; readonly because: string | null } {
  const { source, fellBackBecause } = record(body);
  return { pregenerated: source === 'pregenerated', because: typeof fellBackBecause === 'string' && fellBackBecause.trim() ? fellBackBecause.trim() : null };
}

/** A pregenerated file: { plans: { <presetId>: Plan } }, a bare { <presetId>: Plan }, or a list of plans. Invalid entries are dropped. */
export function parsePlanFile(raw: unknown): Partial<Record<PresetId, Plan>> {
  const fields = record(raw);
  const source = Array.isArray(raw) ? raw : Array.isArray(fields.plans) ? fields.plans : Object.keys(record(fields.plans)).length > 0 ? record(fields.plans) : fields;
  const entries: readonly (readonly [unknown, unknown])[] = Array.isArray(source) ? source.map((plan: unknown) => [record(plan).presetId, plan] as const) : Object.entries(source);
  return entries.reduce<Partial<Record<PresetId, Plan>>>((plans, [key, value]) => {
    const [presetId, plan] = [PresetIdSchema.safeParse(key), PlanSchema.safeParse(value)];
    return presetId.success && plan.success ? { ...plans, [presetId.data]: plan.data } : plans;
  }, {});
}

export const STAND_IN_MODEL = 'no model (stand-in)';

/** A preset as it is, for a server whose planner is not there. It says what it is in every field a reader sees. */
export function standInPlan(presetId: PresetId, at: string): Plan {
  const preset = PRESETS[presetId];
  return {
    build: preset.build,
    presetId,
    priority: 0.5,
    briefing: 'Balanced: keep moving, slow down for what the sensors report.',
    rationale: `Stand-in, not a plan: the planner did not answer and there is no pregenerated plan for this mission, so this is the ${preset.name} preset as it is. No model was asked.`,
    partsWhy: [],
    generatedBy: { provider: 'stand-in', model: STAND_IN_MODEL, ms: 0, at },
  };
}

export interface PlanPart {
  readonly partId: string;
  readonly name: string;
  readonly slot: string;
  /** The planner's reason for this part, when it gave one. */
  readonly why: string | null;
}

const partIds = (build: Build): readonly string[] => [build.locomotion, build.motor, build.battery, ...build.sensors, ...build.extras];

/** One row per part of the plan's build, with the planner's reason beside the parts it explained. */
export function planParts(plan: Plan): readonly PlanPart[] {
  return partIds(plan.build).map((partId) => {
    const part = PARTS_BY_ID.get(partId);
    return { partId, name: part?.name ?? partId, slot: part?.slot ?? 'part', why: plan.partsWhy.find((entry) => entry.partId === partId)?.why ?? null };
  });
}

/** The briefing field never holds more than the brains accept. */
export const clampBriefing = (text: string): string => text.slice(0, BRIEFING_MAX_CHARS);

const SENSORS_ONLY = 'The driver only sees what its sensors report.';

/** The line under the card: who planned and how long it took, or what the card is instead of a fresh plan. */
export function planCaption(plan: Plan, source: PlanSource): string {
  const { model, ms, at } = plan.generatedBy;
  if (source === 'stand-in') return `Stand-in: no model was asked. ${SENSORS_ONLY}`;
  if (source === 'pregenerated') return `Pregenerated plan by ${model} (${at.slice(0, 10)}), not asked now. ${SENSORS_ONLY}`;
  return `Plan by ${model} in ${(ms / 1000).toFixed(1)} s. ${SENSORS_ONLY}`;
}
