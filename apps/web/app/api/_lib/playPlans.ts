import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BRIEFING_PRESETS, PlanSchema, type MissionId, type Plan, type PlayStrategy, type PresetId } from '@rivetrun/contracts';

// /play strategies, resolved on the server (RR-PLAN §4): phones send a PlayerPick and never free text.
// 'plan' = the pregenerated plan for the mission and vehicle, read from apps/web/data/plans/<missionId>.json.
// That file may be { "<presetId>": Plan }, { plans: { "<presetId>": Plan } } or a list of plans; each is validated.

/** Priority that goes with each briefing preset: 0 = speed, 1 = safety. */
const PRESET_PRIORITY: Readonly<Record<(typeof BRIEFING_PRESETS)[number]['id'], number>> = { daredevil: 0.15, careful: 0.85, eco: 0.6 };

const cache = new Map<MissionId, Map<PresetId, Plan>>();

function plansFile(missionId: MissionId): string | null {
  // `next dev` and the tests run from apps/web; scripts may run from the repo root.
  const candidates = [path.join(process.cwd(), 'data', 'plans', `${missionId}.json`), path.join(process.cwd(), 'apps', 'web', 'data', 'plans', `${missionId}.json`)];
  return candidates.find((file) => existsSync(file)) ?? null;
}

function load(missionId: MissionId): Map<PresetId, Plan> {
  const plans = new Map<PresetId, Plan>();
  const file = plansFile(missionId);
  if (!file) return plans;
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const body = raw && typeof raw === 'object' && 'plans' in raw ? (raw as { plans: unknown }).plans : raw;
    const entries: unknown[] = Array.isArray(body) ? body : body && typeof body === 'object' ? Object.values(body) : [];
    for (const entry of entries) {
      const parsed = PlanSchema.safeParse(entry);
      if (parsed.success && !plans.has(parsed.data.presetId)) plans.set(parsed.data.presetId, parsed.data);
    }
  } catch {
    // An unreadable plans file means no plan: the pick falls back to no briefing, and says so through `plan: false`.
  }
  return plans;
}

/** The pregenerated plan for this mission and vehicle, or null when none is committed. */
export function storedPlan(missionId: MissionId, presetId: PresetId): Plan | null {
  // Not cached when empty: the file may be committed while the server runs.
  let plans = cache.get(missionId);
  if (!plans || plans.size === 0) {
    plans = load(missionId);
    cache.set(missionId, plans);
  }
  return plans.get(presetId) ?? null;
}

export interface ResolvedStrategy {
  readonly briefing: string | undefined;
  readonly priority: number;
  /** True when a stored plan was found and applied. */
  readonly plan: boolean;
}

/** What a strategy means for the driver. 'plan' without a stored plan drives with no briefing at priority 0.5. */
export function resolveStrategy(missionId: MissionId, presetId: PresetId, strategy: PlayStrategy): ResolvedStrategy {
  if (strategy === 'plan') {
    const plan = storedPlan(missionId, presetId);
    return plan ? { briefing: plan.briefing, priority: plan.priority, plan: true } : { briefing: undefined, priority: 0.5, plan: false };
  }
  const preset = BRIEFING_PRESETS.find((item) => item.id === strategy)!;
  return { briefing: preset.text, priority: PRESET_PRIORITY[preset.id], plan: false };
}
