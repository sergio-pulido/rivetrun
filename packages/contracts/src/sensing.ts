// Brain v3 (docs/BRAIN_V3_SENSING.md, RR-BRAIN-V3): what a brain knows and why it is asked.
// Rule 1: the brain knows only what its sensors report. Rule 2: it decides when something changes.
import { z } from 'zod';
import { ObstacleSchema, TerrainIdSchema } from './world';

/** Bumped when the physics or the question change in a way that makes cached answers stale. */
export const GAMEPLAY_VERSION = 3;

/** Where a piece of knowledge comes from. `core` is the kit every build has: encoders, charge, current, mission plan. */
export const SensorSourceSchema = z.enum(['core', 'imu', 'ultrasonic', 'tof', 'lidar', 'camera', 'moisture_probe', 'scout_drone', 'bumper']);
export type SensorSource = z.infer<typeof SensorSourceSchema>;

const unknownOr = <T extends z.ZodType>(schema: T) => z.union([schema, z.literal('unknown')]);

/** An obstacle a forward sensor sees. Rangers give distance only; the camera and the drone also name it. */
export const SeenHazardSchema = z.object({
  source: SensorSourceSchema,
  distanceM: z.number().min(0),
  kind: ObstacleSchema.optional(),
  /** Speed at or below which this build takes no damage from it; present when the kind is known. */
  safeSpeedMps: z.number().min(0).optional(),
});
export type SeenHazard = z.infer<typeof SeenHazardSchema>;

export const SeenGapSchema = z.object({ source: SensorSourceSchema, distanceM: z.number().min(0), widthM: z.number().positive() });
export type SeenGap = z.infer<typeof SeenGapSchema>;

export const SeenTerrainSchema = z.object({ source: SensorSourceSchema, terrain: TerrainIdSchema, distanceM: z.number().min(0) });
export type SeenTerrain = z.infer<typeof SeenTerrainSchema>;

/** A scan zone from the mission plan, located by odometry. */
export const ScanZoneViewSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Metres ahead of the robot's nose to the zone's centre; negative once it is behind. */
  distanceM: z.number(),
  /** True when the build carries a sensor the zone accepts. */
  canScan: z.boolean(),
  done: z.boolean(),
  missed: z.boolean(),
});
export type ScanZoneView = z.infer<typeof ScanZoneViewSchema>;

/**
 * Everything a brain may use, built only from the sensors the build carries plus the core kit.
 * `'unknown'` means the build has no sensor for it; `null` means a sensor is fitted and reports nothing in range.
 */
export const ObservationSchema = z.object({
  /** Sources this build carries. Always includes 'core'. */
  sources: z.array(SensorSourceSchema),
  // ---- core kit
  speedMps: z.number(),
  odometerM: z.number().min(0),
  missionLengthM: z.number().positive(),
  remainingM: z.number().min(0),
  batteryPct: z.number().min(0).max(100),
  /** Electrical draw right now, watts. */
  drawW: z.number().min(0),
  /** Charge left at the finish if the current pace and draw hold; negative = runs out before it. */
  projectedFinishPct: z.number(),
  damagePct: z.number().min(0).max(100),
  scanZones: z.array(ScanZoneViewSchema),
  // ---- imu
  tiltDeg: unknownOr(z.number()),
  slipPct: unknownOr(z.number().min(0).max(100)),
  slipping: unknownOr(z.boolean()),
  // ---- forward sensors
  /** Longest forward sensing range of the build, metres. 0 = blind. */
  forwardRangeM: z.number().min(0),
  /** No forward sensor at all: obstacles are learned on contact or never. */
  blind: z.boolean(),
  hazard: unknownOr(SeenHazardSchema.nullable()),
  gap: unknownOr(SeenGapSchema.nullable()),
  terrainAhead: unknownOr(SeenTerrainSchema.nullable()),
  waterDepthCm: unknownOr(z.number().min(0)),
  // ---- contact, after it happens
  /** The last thing the bumper or the IMU felt, if either is fitted and something was hit. */
  lastContact: unknownOr(z.object({ source: SensorSourceSchema, atM: z.number(), agoS: z.number().min(0), kind: ObstacleSchema.optional() }).nullable()),
  /** Part actions and their readiness, e.g. the piston re-arming. */
  actuators: z.object({ jumpReadyInS: unknownOr(z.number().min(0)), winch: z.boolean(), climbMode: z.boolean() }),
  /** Plain statements of what this build cannot know, for the question and the HUD. */
  unknown: z.array(z.string()),
  /** One display line per source with what it reports right now, e.g. "LIDAR · obstacle 11 m". */
  lines: z.array(z.string()),
});
export type Observation = z.infer<typeof ObservationSchema>;

/** Why a decision is requested. There is no clock: no trigger, no decision. */
export const TriggerKindSchema = z.enum(['start', 'perception', 'body', 'energy', 'actuator']);
export type TriggerKind = z.infer<typeof TriggerKindSchema>;

export const TriggerCauseSchema = z.enum([
  'start',
  // perception: something enters sensor range, or a known thing is reached
  'hazard_seen', 'hazard_reached', 'gap_seen', 'gap_reached', 'terrain_seen', 'terrain_reached', 'zone_seen', 'zone_reached',
  // body
  'slip_start', 'slip_stop', 'tilt_10', 'tilt_20', 'tilt_level', 'impact', 'damage', 'landing', 'blocked', 'fell',
  // energy (hysteresis: low below 10 % projected at the finish, ok again above 30 %)
  'energy_low', 'energy_ok',
  // actuator
  'jump_ready', 'winch_done', 'scan_done',
]);
export type TriggerCause = z.infer<typeof TriggerCauseSchema>;

export const TriggerSchema = z.object({
  kind: TriggerKindSchema,
  cause: TriggerCauseSchema,
  /** The sensor that noticed it, when one did. */
  source: SensorSourceSchema.optional(),
  /** Display text, e.g. "LIDAR · obstacle 11 m" or "ENERGY · finish at 6 %". */
  label: z.string(),
});
export type Trigger = z.infer<typeof TriggerSchema>;
