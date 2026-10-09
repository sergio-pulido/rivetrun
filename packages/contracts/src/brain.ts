import { z } from 'zod';
import { MissionIdSchema, TerrainIdSchema } from './world';

/** A sensor reading, or `unknown` when the build has no sensor for it. */
const reading = <T extends z.ZodType>(schema: T) => z.union([schema, z.literal('unknown')]);

/**
 * What the Brain sees. Only sensor output, with seeded noise. Never ground truth.
 * camera → terrainAhead*, ultrasonic → obstacleAheadM, IMU → slipPct / tiltDeg,
 * moisture probe → depthAheadCm.
 * Noisy readings are clamped to the bounds below before they are emitted.
 * Camera with no terrain change in range: the current terrain and the distance to the end of its segment.
 */
export const PerceptionSchema = z.object({
  terrainAhead: reading(TerrainIdSchema),
  terrainAheadDistanceM: reading(z.number().min(0)),
  /** `null` = sensor present, nothing in range. */
  obstacleAheadM: reading(z.number().min(0).nullable()),
  slipPct: reading(z.number().min(0).max(100)),
  tiltDeg: reading(z.number()),
  depthAheadCm: reading(z.number().min(0)),
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

export const PolicySchema = z.enum(['jev', 'heuristic', 'random']);
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

/** Every policy (jev, heuristic, random) implements this. */
export interface Brain {
  decide(question: BrainQuestion): Promise<BrainDecision>;
}
