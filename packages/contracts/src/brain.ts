import { z } from 'zod';
import { MissionIdSchema, TerrainIdSchema } from './world';

/** A sensor reading, or `unknown` when the build has no sensor for it. */
const reading = <T extends z.ZodType>(schema: T) => z.union([schema, z.literal('unknown')]);

/**
 * What the Brain sees. Only sensor output, with seeded noise. Never ground truth.
 * camera → terrainAhead*, ultrasonic → obstacleAheadM, IMU → slipPct / tiltDeg,
 * moisture probe → depthAheadCm.
 * Noisy readings are clamped to the bounds below before they are emitted.
 * Camera / drone with no terrain change in range: the current terrain and the distance to its end, capped at the sensor's range.
 */
export const PerceptionSchema = z.object({
  terrainAhead: reading(TerrainIdSchema),
  terrainAheadDistanceM: reading(z.number().min(0)),
  /** Which sensor produced terrainAhead* (the scout drone sees further than the camera). */
  terrainAheadSource: z.enum(['camera', 'scout_drone']).optional(),
  /** `null` = sensor present, nothing in range. */
  obstacleAheadM: reading(z.number().min(0).nullable()),
  slipPct: reading(z.number().min(0).max(100)),
  tiltDeg: reading(z.number()),
  depthAheadCm: reading(z.number().min(0)),
  /** Distance to the next gap in sensor range (ultrasonic, camera or drone). `null` = none in range. Absent on tracks without gaps. */
  gapAheadM: reading(z.number().min(0).nullable()).optional(),
  /** Width of that gap, metres. */
  gapWidthM: z.number().positive().optional(),
});
export type Perception = z.infer<typeof PerceptionSchema>;

export const RobotStatusSchema = z.object({
  speedMps: z.number(),
  batteryPct: z.number().min(0).max(100),
  damagePct: z.number().min(0).max(100),
});
export type RobotStatus = z.infer<typeof RobotStatusSchema>;

export const ActionSchema = z.enum([
  'cruise',
  'accelerate',
  'slow_down',
  'brake',
  'reverse',
  'climb_mode',
  'deploy_winch',
  'jump',
]);
export type Action = z.infer<typeof ActionSchema>;

/** Result of simulating one action for the lookahead window on the perceived state. */
export const LookaheadEntrySchema = z.object({
  action: ActionSchema,
  progressM: z.number(),
  damagePct: z.number().min(0),
  energyPct: z.number().min(0),
});
export type LookaheadEntry = z.infer<typeof LookaheadEntrySchema>;

export const DecisionTriggerSchema = z.enum([
  'start',
  'terrain_ahead',
  'terrain_enter',
  'obstacle',
  'slip',
  'damage',
  'interval',
]);
export type DecisionTrigger = z.infer<typeof DecisionTriggerSchema>;

/** 0 = pure speed, 1 = pure safety. */
export const PrioritySchema = z.number().min(0).max(1);

export const BRIEFING_MAX_CHARS = 140;
/** "Brief the brain": the player's free-text instructions to the driver. Only Jev reads it; the heuristic ignores it. */
export const BriefingSchema = z.string().trim().max(BRIEFING_MAX_CHARS);

export const BRIEFING_PRESETS = [
  { id: 'daredevil', name: 'Daredevil', text: 'Speed is everything. Take risks.' },
  { id: 'careful', name: 'Careful', text: 'Never risk damage. Slow is fine.' },
  { id: 'eco', name: 'Eco', text: 'Save battery. Smooth and steady.' },
] as const;
export type BriefingPresetId = (typeof BRIEFING_PRESETS)[number]['id'];

export const BrainQuestionSchema = z
  .object({
    missionId: MissionIdSchema,
    /** Sim time in seconds. */
    t: z.number().min(0),
    trigger: DecisionTriggerSchema,
    perceived: PerceptionSchema,
    status: RobotStatusSchema,
    priority: PrioritySchema,
    /** Available actions, already filtered by build capabilities. */
    options: z.array(ActionSchema).min(1).max(ActionSchema.options.length),
    /** One entry per option. */
    lookahead: z.array(LookaheadEntrySchema),
    /** Player's instructions to the driver (optional). */
    briefing: BriefingSchema.optional(),
    /** Seconds each lookahead entry simulates. Absent = 1.5; longer when a scout drone is fitted. */
    lookaheadS: z.number().positive().optional(),
  })
  .refine((q) => new Set(q.options).size === q.options.length, {
    message: 'options must be unique',
    path: ['options'],
  })
  .refine((q) => q.lookahead.every((l) => q.options.includes(l.action)), {
    message: 'lookahead actions must be in options',
    path: ['lookahead'],
  });
export type BrainQuestion = z.infer<typeof BrainQuestionSchema>;

export const PolicySchema = z.enum(['jev', 'heuristic', 'random', 'human']);
export type Policy = z.infer<typeof PolicySchema>;

export const ProbabilitiesSchema = z.partialRecord(ActionSchema, z.number().min(0).max(1));
export type Probabilities = z.infer<typeof ProbabilitiesSchema>;

export const BrainDecisionSchema = z.object({
  /** Probability per available action. */
  probabilities: ProbabilitiesSchema,
  /** argmax of probabilities; the action that is applied. */
  selected: ActionSchema,
  /** The policy that actually decided. */
  policy: PolicySchema,
  /** true when Jev failed or timed out and the heuristic decided instead. */
  fallback: z.boolean(),
  latencyMs: z.number().min(0),
  /** Versioned model id reported by the provider (jev only). */
  model: z.string().optional(),
});
export type BrainDecision = z.infer<typeof BrainDecisionSchema>;

/** Drive mode: what the player's thumbs are doing, sampled at 20 Hz. The sim maps it to an Action. */
export const ControlSpecialSchema = z.enum(['jump', 'winch', 'climb']);
export type ControlSpecial = z.infer<typeof ControlSpecialSchema>;

export const ControlInputSchema = z.object({
  /** Right half held. */
  throttle: z.boolean(),
  /** Left half held. */
  brake: z.boolean(),
  /** Action button, only for parts the build has. */
  special: ControlSpecialSchema.optional(),
});
export type ControlInput = z.infer<typeof ControlInputSchema>;

/** Every policy (jev, heuristic, random) implements this. */
export interface Brain {
  decide(question: BrainQuestion): Promise<BrainDecision>;
}
