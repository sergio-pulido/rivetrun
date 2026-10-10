import { BRIEFING_PRESETS, type Build, type MissionId, type PlayerPick, type PresetId } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { storedPlan } from './plans';

// RR-PLAN §4: a pick is three taps (vehicle, agent, strategy). The server turns the strategy into what a brain is
// given: a build, a briefing and a priority. Phones never send free text. One resolver for every route that needs it.

/** How far towards safety each ready-made strategy leans (0 = pure speed, 1 = pure safety). */
const PRESET_PRIORITY: Readonly<Record<(typeof BRIEFING_PRESETS)[number]['id'], number>> = { daredevil: 0.15, careful: 0.85, eco: 0.5 };

export interface ResolvedStrategy {
  readonly build: Build;
  readonly briefing: string;
  readonly priority: number;
  /** True when the pregenerated plan was applied: the lane then reads "<brain> + plan". */
  readonly plan: boolean;
  /** Short name for chips: "Claude's plan", "Daredevil"… and for a plan, the model that wrote it. */
  readonly label: string;
  readonly planModel?: string;
}

/**
 * 'plan' = the committed plan for this mission and vehicle (its build, briefing and priority). When the mission has
 * no plan file, 'plan' falls to Careful on the preset's own build and says so in `label`.
 */
export function resolveStrategy(missionId: MissionId, presetId: PresetId, strategy: PlayerPick['strategy']): ResolvedStrategy {
  const preset = PRESETS[presetId];
  if (strategy === 'plan') {
    const plan = storedPlan(missionId, presetId);
    if (plan) return { build: plan.build, briefing: plan.briefing, priority: plan.priority, plan: true, label: 'plan', planModel: plan.generatedBy.model };
    const careful = BRIEFING_PRESETS.find((candidate) => candidate.id === 'careful')!;
    return { build: preset.build, briefing: careful.text, priority: PRESET_PRIORITY.careful, plan: false, label: 'Careful (no plan for this mission)' };
  }
  const chosen = BRIEFING_PRESETS.find((candidate) => candidate.id === strategy)!;
  return { build: preset.build, briefing: chosen.text, priority: PRESET_PRIORITY[chosen.id], plan: false, label: chosen.name };
}
