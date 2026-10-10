import { BRIEFING_PRESETS, type BriefingPresetId } from '@rivetrun/contracts';

// RR-PLAN (docs/PLAY_AND_PLAN.md §4): a player picks a vehicle, an agent and a strategy. The HUD names the agent and
// the strategy on one line, so whoever watches a robot knows who drives it and on whose orders.

/** A /play strategy: the pregenerated plan for the mission and vehicle, or one of the briefing presets (PlayStrategy in contracts). */
export type Strategy = 'plan' | BriefingPresetId;

/** Who drives a robot that was picked on /play, and how it was told to drive. */
export interface PilotTag {
  /** The agent's display name, as the picker showed it ("Jev", "GPT-6 Luna"). */
  readonly agent: string;
  readonly strategy: Strategy;
  /**
   * The model that wrote the plan (Plan.generatedBy.model), when the strategy is the plan. Left out, or a Claude
   * model: "Claude's plan". Any other model is named as what it is.
   */
  readonly planModel?: string;
}

/** "Claude's plan", "Daredevil"…: the strategy as the /play card names it. */
export function strategyName(strategy: Strategy, planModel?: string): string {
  if (strategy !== 'plan') return BRIEFING_PRESETS.find((preset) => preset.id === strategy)?.name ?? strategy;
  const model = planModel?.trim();
  if (!model || /^claude/i.test(model)) return "Claude's plan";
  return `${model}${/s$/i.test(model) ? "'" : "'s"} plan`;
}

const STRATEGIES: readonly string[] = ['plan', ...BRIEFING_PRESETS.map((preset) => preset.id)];

/**
 * Dev only, for looking at the chip before a page passes a pick: `?pilot=GPT-6 Luna:daredevil` or
 * `?pilot=Jev:plan:GPT-6.1 Sol` (agent : strategy : the model that wrote the plan).
 */
export function pilotOverride(): PilotTag | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  const [agent, strategy, planModel] = (new URLSearchParams(window.location.search).get('pilot') ?? '').split(':');
  if (!agent || !strategy || !STRATEGIES.includes(strategy)) return null;
  return { agent, strategy: strategy as Strategy, planModel: planModel || undefined };
}

/** The whole chip as text: "<agent> + <plan>" when a plan is applied (§2), "<agent> · <preset>" otherwise. */
export function pilotLine(pilot: PilotTag): string {
  return `${pilot.agent}${pilot.strategy === 'plan' ? ' + ' : ' · '}${strategyName(pilot.strategy, pilot.planModel)}`;
}
