// The brain's side of the Lab: the question it is asked and the answer it gives. Schemas, because these cross
// the network (browser → /api → model). Same idea as BrainQuestion / BrainDecision on the rail.
import { PolicySchema, SensorSourceSchema, TriggerKindSchema } from '@rivetrun/contracts';
import { z } from 'zod';
import { LAB_CAUSES } from './types';

/** Bumped when the grid rules or the question change in a way that makes cached answers stale. */
export const LAB_VERSION = 2;

const CellSchema = z.object({ x: z.number().int(), y: z.number().int() });
const DirSchema = z.enum(['N', 'E', 'S', 'W']);
const PaceSchema = z.enum(['full', 'eco']);

export const LabCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('idle') }),
  z.object({ type: z.literal('step'), dir: DirSchema }),
  z.object({ type: z.literal('heading'), dir: DirSchema }),
  z.object({ type: z.literal('goto'), to: CellSchema, interact: z.string().optional(), thenHeading: DirSchema.optional() }),
  z.object({ type: z.literal('interact'), objectId: z.string().optional() }),
  z.object({ type: z.literal('wait'), forS: z.number().positive() }),
]);

export const LabTriggerSchema = z.object({
  kind: TriggerKindSchema,
  cause: z.enum(LAB_CAUSES),
  source: SensorSourceSchema.optional(),
  label: z.string(),
});

/** What the robot expects of an option, from its own map only. */
export const LabPredictionSchema = z.object({
  /** Tiles to drive. */
  steps: z.number().int().min(0).optional(),
  timeS: z.number().min(0).optional(),
  /** Charge the way costs, % of capacity. */
  energyPct: z.number().min(0).optional(),
  batteryAfterPct: z.number().optional(),
  /** Charge left after then driving on to the mission's end point; negative = it would not get back. */
  marginAfterPct: z.number().optional(),
  /** Tiles for the whole job this option starts: to the thing and on to where it has to go. */
  jobSteps: z.number().int().min(0).optional(),
  /**
   * Tiles for all the known work if this is done first and the rest in its best order, the way to the end point
   * included. The number to compare options on: the nearest thing is not always the best one to start with.
   */
  tourSteps: z.number().int().min(0).optional(),
  /** True when the way crosses ground the robot has not seen: the scenario's usual ground was assumed. */
  assumed: z.boolean().optional(),
  risk: z.string().optional(),
});
export type LabPrediction = z.infer<typeof LabPredictionSchema>;

export const LabOptionSchema = z.object({
  /** Stable: `do:<object>` · `goto:<object>` · `explore:<N|E|S|W>` · `wait` · `pace:<full|eco>`. */
  id: z.string().min(1),
  /** interact = act on this tile · objective = go and do it · return = go to the end point · explore · wait · pace. */
  kind: z.enum(['interact', 'objective', 'return', 'explore', 'wait', 'pace']),
  label: z.string(),
  description: z.string(),
  /** What the sim does when this is chosen. Absent on pace options. */
  command: LabCommandSchema.optional(),
  pace: PaceSchema.optional(),
  predicted: LabPredictionSchema.optional(),
  /** return: true when arriving completes the mission; false when it ends it early. */
  completes: z.boolean().optional(),
  /** explore: straight-line tiles from that edge of the map to the nearest thing the robot wants but has no way to yet. */
  towardTiles: z.number().min(0).optional(),
  /** explore: the first tile that way has been driven before. */
  visited: z.boolean().optional(),
  /** The robot is already doing this. */
  current: z.boolean().optional(),
});
export type LabOption = z.infer<typeof LabOptionSchema>;

const ObjectiveStatusSchema = z.object({ id: z.string(), label: z.string(), done: z.boolean(), have: z.number().int().min(0), need: z.number().int().min(0) });

const EnergySchema = z.object({
  batteryPct: z.number().min(0).max(100),
  /**
   * Projected charge at the finish: what is left after the known way to the mission's end point at this pace; for a
   * mission without an end point, after the known work. Negative = it will not make it at this pace. Absent while
   * the robot knows neither.
   */
  projectedPct: z.number().optional(),
  /**
   * Charge the known work left would cost at this pace: a rough tour of what the robot knows it still has to do,
   * the way to the end point included. More than `batteryPct` = not all of it fits at this pace.
   */
  workPct: z.number().min(0).optional(),
  /** Tiles of the usual ground the charge covers at this pace. */
  rangeTiles: z.number().int().min(0),
});

const SightingSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Tiles as the crow flies. */
  tiles: z.number().int().min(0),
  bearing: z.string(),
  source: SensorSourceSchema,
});

/** A direction as the robot knows it: how many tiles it can drive, and what ends them. */
const RunSchema = z.object({ free: z.number().int().min(0), then: z.enum(['wall', 'door', 'drop', 'unexplored']) });

/**
 * Everything a Lab brain may use: the core kit plus what the fitted sensors have reported. Same rule as the
 * rail's Observation: nothing here comes from the scenario's ground truth beyond the robot's own map.
 */
export const LabObservationSchema = z.object({
  sources: z.array(SensorSourceSchema),
  t: z.number().min(0),
  cell: CellSchema,
  heading: DirSchema,
  pace: PaceSchema,
  speedMps: z.number().min(0),
  drawW: z.number().min(0),
  damagePct: z.number().min(0).max(100),
  energy: EnergySchema,
  carrying: z.array(z.string()),
  objectives: z.array(ObjectiveStatusSchema),
  /** No ranger, camera or drone: walls are found by driving into them. */
  blind: z.boolean(),
  around: z.object({ N: RunSchema, E: RunSchema, S: RunSchema, W: RunSchema }),
  /** Share of the map the robot has sensed, %. */
  exploredPct: z.number().min(0).max(100),
  /** Things the robot knows of and has not dealt with. */
  objects: z.array(SightingSchema),
  /** Traffic and other robots in view right now. A ranger gives "something moving", a camera names it. */
  moving: z.array(SightingSchema),
  /** IMU only. */
  tiltDeg: z.union([z.number(), z.literal('unknown')]),
  /** Plain statements of what this build cannot know. */
  unknown: z.array(z.string()),
  /** One display line per thing known, e.g. "LIDAR · north 4 tiles free then wall". */
  lines: z.array(z.string()),
});
export type LabObservation = z.infer<typeof LabObservationSchema>;

export const LabQuestionSchema = z
  .object({
    scenarioId: z.string().min(1),
    /** One sentence: what the mission is. */
    objective: z.string(),
    agentId: z.string().min(1),
    /** Sim time, seconds. */
    t: z.number().min(0),
    trigger: LabTriggerSchema,
    /** Sensor lines: what the brain knows. Same as `observation.lines`. */
    knew: z.array(z.string()),
    unknown: z.array(z.string()),
    energy: EnergySchema,
    objectives: z.array(ObjectiveStatusSchema),
    /** Named moves this build can make now. Never free text. */
    options: z.array(LabOptionSchema).min(1),
    observation: LabObservationSchema,
    labVersion: z.number(),
    /** The player's instructions to the driver. Only Jev reads it. */
    briefing: z.string().max(140).optional(),
  })
  .refine((q) => new Set(q.options.map((option) => option.id)).size === q.options.length, { message: 'option ids must be unique', path: ['options'] });
export type LabQuestion = z.infer<typeof LabQuestionSchema>;

export const LabDecisionSchema = z.object({
  /** The id of one of the question's options. */
  choice: z.string().min(1),
  /** Probability per option id. */
  probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
  latencyMs: z.number().min(0),
  policy: PolicySchema.optional(),
  /** Versioned model id reported by the provider. */
  model: z.string().optional(),
});
export type LabDecision = z.infer<typeof LabDecisionSchema>;

/** Every Lab policy implements this: Jev, the heuristic, other models. */
export interface LabBrain {
  decide(question: LabQuestion): Promise<LabDecision>;
}
