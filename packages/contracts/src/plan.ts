// RR-PLAN (docs/PLAY_AND_PLAN.md): "Think slow before. Decide fast during."
// A reasoning model plans before the run (parts and strategy); a fast brain decides during it.
import { z } from 'zod';
import { BRIEFING_MAX_CHARS, PrioritySchema } from './brain';
import { BuildSchema, PartIdSchema, PresetIdSchema } from './build';

/** The ids of BRIEFING_PRESETS, as a schema. The test checks the two lists stay equal. */
export const BriefingPresetIdSchema = z.enum(['daredevil', 'careful', 'eco']);

/** What a plan may say, validated before anything uses it. The planner sees the mission brief only, never the track. */
export const PlanSchema = z.object({
  /** A valid build from the parts catalog. */
  build: BuildSchema,
  /** The preset closest to `build`. */
  presetId: PresetIdSchema,
  /** 0 = pure speed, 1 = pure safety: handed to every brain with the briefing. */
  priority: PrioritySchema,
  /** The orders to the driver, in the same field the player's own briefing uses. */
  briefing: z.string().trim().min(1).max(BRIEFING_MAX_CHARS),
  rationale: z.string().trim().min(1).max(300),
  /** Why the parts that matter were picked, at most four. */
  partsWhy: z.array(z.object({ partId: PartIdSchema, why: z.string().trim().min(1).max(80) })).max(4),
  /** Who planned, how long it took and when. A fallback provider or a pregenerated plan is named here as what it is. */
  generatedBy: z.object({
    provider: z.string().min(1).max(40),
    model: z.string().min(1).max(80),
    ms: z.number().min(0),
    at: z.iso.datetime({ offset: true }),
  }),
});
export type Plan = z.infer<typeof PlanSchema>;

/** A player's strategy on /play: the pregenerated plan for the mission and vehicle, or one of the briefing presets. */
export const PlayStrategySchema = z.union([z.literal('plan'), BriefingPresetIdSchema]);
export type PlayStrategy = z.infer<typeof PlayStrategySchema>;

/**
 * The three taps on /play. The server resolves the briefing and the priority from `strategy`; phones never send
 * free text. `agent` is an existing arena contestant id (e.g. the Jev id from the arena results) or 'human'.
 */
export const PlayerPickSchema = z.object({
  presetId: PresetIdSchema,
  agent: z.string().min(1).max(64),
  strategy: PlayStrategySchema,
});
export type PlayerPick = z.infer<typeof PlayerPickSchema>;

/** What a phone gets when it has not tapped: All-rounder, Jev, the plan. The server fills in the Jev contestant id. */
export const DEFAULT_PLAY_PICK = { presetId: 'all_rounder', strategy: 'plan' } as const satisfies Pick<PlayerPick, 'presetId' | 'strategy'>;
