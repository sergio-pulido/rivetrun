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
import { TriggerCauseSchema, TriggerKindSchema, TriggerSchema } from './sensing';
import { EnvironmentSchema, MissionIdSchema, ObstacleSchema, SeedSchema, TerrainIdSchema } from './world';

export const SimEffectSchema = z.enum(['dust', 'splash', 'mud_spray', 'sparks', 'slip', 'smoke', 'winch', 'bubbles']);
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
  /** Height above the track surface, metres (0 or absent = on the ground). */
  heightM: z.number().min(0).optional(),
  /** Vertical speed, m/s, up positive (absent = 0). */
  vy: z.number().optional(),
  /** True between leaving the ground and landing. */
  airborne: z.boolean().optional(),
  /** Gameplay v3: the scan zone under the robot and how far the 1.5 s hold has got (0–1). */
  scan: z.object({ zoneId: z.string(), progress: z.number().min(0).max(1) }).optional(),
  /** Scan zones done and missed so far. */
  scansDone: z.number().int().min(0).optional(),
  scansMissed: z.number().int().min(0).optional(),
  /** Set while the robot is stopped against an obstacle it cannot get over. */
  blockedBy: ObstacleSchema.optional(),
  /** Depth of the water column at the robot, metres (0 or absent on dry ground and in shallows). */
  waterDepthM: z.number().min(0).optional(),
  /** How far the robot is below the surface, metres (0 or absent = not under water). */
  submergedDepthM: z.number().min(0).optional(),
  /** Water current against the robot at its position, m/s (absent = none). */
  waterCurrentMps: z.number().min(0).optional(),
  /** True while the thruster kit is propelling the robot under water. */
  thrusting: z.boolean().optional(),
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
  /** Gameplay v3 result breakdown. */
  breakdown: z.object({
    /** Seconds lost to wheelspin against the same distance with grip. */
    slipLostS: z.number().min(0),
    damageByCause: z.object({ impact: z.number().min(0), landing: z.number().min(0), water: z.number().min(0), tipOver: z.number().min(0), fall: z.number().min(0) }),
    scansDone: z.number().int().min(0),
    scansMissed: z.number().int().min(0),
    /** Decisions by trigger kind, e.g. { perception: 3, energy: 2, body: 2 }. */
    decisions: z.partialRecord(TriggerKindSchema, z.number().int().min(0)),
    /** One line on what to try next, from the biggest loss. */
    tryNext: z.string(),
    /** Seconds added to the time for missed scans, and points added for centred ones. */
    scanPenaltyS: z.number().min(0),
    scanBonus: z.number().min(0),
    /** Drive mode: how fast the player's thumbs answered each thing the robot detected. null = no control change within 3 s. */
    reactions: z.array(z.object({ t: z.number(), xM: z.number(), label: z.string(), cause: TriggerCauseSchema, humanS: z.number().min(0).nullable() })).optional(),
  }).optional(),
  /** One-line explanation derived by the sim from ground truth, e.g. "Slipped 6 s on ice — no IMU". */
  why: z.string().max(200).optional(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

/** A headless run recorded for the Brain Duel: frames at 10 Hz against sim time. */
export type GhostTrace = z.infer<typeof GhostTraceSchema>;

/** One decision as the showcase shows it: what fired, what the brain knew, what it chose and what the wait cost. */
export const DecisionLogSchema = z.object({
  /** Sim time and track position when the decision was requested. */
  t: z.number().min(0),
  xM: z.number(),
  trigger: TriggerSchema,
  /** Sensor lines: what the brain knew. */
  knew: z.array(z.string()),
  /** What it could not know. */
  unknown: z.array(z.string()),
  options: z.array(z.object({
    action: ActionSchema,
    probability: z.number().min(0).max(1),
    progressM: z.number(),
    damagePct: z.number().min(0),
    energyPct: z.number().min(0),
    projectedFinishPct: z.number().optional(),
  })),
  choice: ActionSchema,
  policy: PolicySchema,
  fallback: z.boolean(),
  latencyMs: z.number().min(0),
  /** Sim time at which the choice took effect, and the distance covered while waiting for it. */
  appliedT: z.number().min(0),
  lostM: z.number(),
  /** Ready-made chip text, e.g. "LIDAR · obstacle 11 m → ease (71 %) · 340 ms". */
  chip: z.string(),
});
export type DecisionLog = z.infer<typeof DecisionLogSchema>;

export const GhostTraceSchema = z.object({
  policy: PolicySchema,
  frames: z.array(SimStateSchema),
  outcome: OutcomeSchema,
  /**
   * The driver's decision log, in order, each entry stamped with the ghost's own sim clock (`t` requested,
   * `appliedT` in effect), so a replay can show the thread in sync with `frames`. Telemetry console, RR-BRAIN-V3.
   */
  log: z.array(DecisionLogSchema).optional(),
});


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
  /** Brain v3 decision log entry. */
  log: DecisionLogSchema.optional(),
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
    /** Brain v3: the decision as the HUD and the big screen show it. */
    log: DecisionLogSchema.optional(),
    /** True for a hint in Drive mode: shown, not applied. */
    advisory: z.boolean().optional(),
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
    // What was hit, so the event says why (all optional).
    obstacle: ObstacleSchema.optional(),
    /** The obstacle stopped the robot: it could not get over it. */
    blocked: z.boolean().optional(),
    /** Drove onto this rough terrain too fast. */
    roughEntry: TerrainIdSchema.optional(),
    air: z.enum(['landing', 'fall']).optional(),
    /** The build had no forward sensor that could have seen this coming. */
    blind: z.boolean().optional(),
    /** Ready-made text, e.g. "BLIND · hit rock at 22 m: no distance sensor". */
    label: z.string().optional(),
  }),
  z.object({ type: z.literal('airborne'), t: z.number(), x: z.number(), v: z.number(), vy: z.number(), cause: z.enum(['ramp', 'jump', 'drop']) }),
  z.object({ type: z.literal('landed'), t: z.number(), x: z.number(), impactMps: z.number().min(0), airtimeS: z.number().min(0), damagePct: z.number().min(0) }),
  z.object({ type: z.literal('fell'), t: z.number(), x: z.number(), falls: z.number().int().min(1), respawnX: z.number() }),
  z.object({ type: z.literal('finish'), t: z.number(), outcome: OutcomeSchema }),
  z.object({ type: z.literal('dnf'), t: z.number(), reason: DnfReasonSchema, outcome: OutcomeSchema }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
