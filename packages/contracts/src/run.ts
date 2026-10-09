import { z } from 'zod';
import {
  ActionSchema,
  BrainDecisionSchema,
  BrainQuestionSchema,
  PerceptionSchema,
  PolicySchema,
  DecisionTriggerSchema,
  PrioritySchema,
  ProbabilitiesSchema,
} from './brain';
import { BuildSchema } from './build';
import { EnvironmentSchema, MissionIdSchema, SeedSchema, TerrainIdSchema } from './world';

export const SimEffectSchema = z.enum(['dust', 'splash', 'mud_spray', 'sparks', 'slip', 'smoke', 'winch']);
export type SimEffect = z.infer<typeof SimEffectSchema>;

/**
 * Everything the renderer reads. The renderer never computes physics.
 * The sim clamps battery and damage to 0–100 before emitting.
 */
export const SimStateSchema = z.object({
  /** Sim time, seconds. */
  t: z.number().min(0),
  /** Distance along the track, metres. */
  x: z.number(),
  /** Speed, m/s (negative when reversing). */
  v: z.number(),
  slopeDeg: z.number(),
  /** Body pitch, degrees. */
  pitch: z.number(),
  /** Wheel / track angular speed, rad/s (differs from v when slipping). */
  wheelSpin: z.number(),
  terrain: TerrainIdSchema,
  /** Battery remaining, 0–100 %. */
  battery: z.number().min(0).max(100),
  /** Damage, 0–100 %. */
  damage: z.number().min(0).max(100),
  effects: z.array(SimEffectSchema),
});
export type SimState = z.infer<typeof SimStateSchema>;

export const DnfReasonSchema = z.enum(['damage', 'battery', 'stuck', 'timeout']);
export type DnfReason = z.infer<typeof DnfReasonSchema>;

export const OutcomeSchema = z.object({
  finished: z.boolean(),
  timeS: z.number().min(0),
  damagePct: z.number().min(0).max(100),
  energyUsedPct: z.number().min(0).max(100),
  costEur: z.number().min(0),
  score: z.number(),
  /** 0–1 of track length covered (1 when finished). Drives the DNF score. */
  progressFraction: z.number().min(0).max(1),
  stars: z.number().int().min(0).max(3),
  dnfReason: DnfReasonSchema.optional(),
  /** One-line explanation derived by the sim from ground truth, e.g. "Slipped 6 s on ice — no IMU". */
  why: z.string().max(200).optional(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

/** A headless run recorded for the Brain Duel: frames at 10 Hz against sim time. */
export const GhostTraceSchema = z.object({
  policy: PolicySchema,
  frames: z.array(SimStateSchema),
  outcome: OutcomeSchema,
});
export type GhostTrace = z.infer<typeof GhostTraceSchema>;

export const DecisionRecordSchema = z.object({
  t: z.number().min(0),
  perceived: PerceptionSchema,
  options: z.array(ActionSchema).min(1),
  probabilities: ProbabilitiesSchema,
  selected: ActionSchema,
  policy: PolicySchema,
  fallback: z.boolean(),
  latencyMs: z.number().min(0),
  /** Why the decision point fired. */
  trigger: DecisionTriggerSchema.optional(),
  /** Versioned model id that answered (jev only). The benchmark reports it. */
  model: z.string().optional(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const EpisodeSchema = z.object({
  id: z.string().min(1).max(64),
  missionId: MissionIdSchema,
  seed: SeedSchema,
  /** The policy that drove the run (individual decisions may still be fallbacks). */
  policy: PolicySchema,
  build: BuildSchema,
  environment: EnvironmentSchema,
  priority: PrioritySchema,
  decisions: z.array(DecisionRecordSchema).max(2000),
  outcome: OutcomeSchema,
});
export type Episode = z.infer<typeof EpisodeSchema>;

export const DamageCauseSchema = z.enum(['impact', 'water', 'tip_over']);
export type DamageCause = z.infer<typeof DamageCauseSchema>;

export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame'), state: SimStateSchema }),
  z.object({ type: z.literal('decisionPending'), t: z.number(), question: BrainQuestionSchema }),
  z.object({
    type: z.literal('decision'),
    t: z.number(),
    question: BrainQuestionSchema,
    decision: BrainDecisionSchema,
  }),
  z.object({
    type: z.literal('terrainEnter'),
    t: z.number(),
    terrain: TerrainIdSchema,
    segmentIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('damage'),
    t: z.number(),
    cause: DamageCauseSchema,
    amountPct: z.number().min(0),
    totalPct: z.number().min(0).max(100),
  }),
  z.object({ type: z.literal('finish'), t: z.number(), outcome: OutcomeSchema }),
  z.object({ type: z.literal('dnf'), t: z.number(), reason: DnfReasonSchema, outcome: OutcomeSchema }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
