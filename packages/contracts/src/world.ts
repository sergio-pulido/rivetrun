import { z } from 'zod';

export const TerrainIdSchema = z.enum(['asphalt', 'grass', 'sand', 'mud', 'ice', 'water', 'rock']);
export type TerrainId = z.infer<typeof TerrainIdSchema>;

export const TerrainSchema = z.object({
  id: TerrainIdSchema,
  name: z.string().min(1),
  /** Traction coefficient before locomotion and weather modifiers. */
  baseFriction: z.number().min(0).max(2),
  /** Fraction of weight opposing motion. */
  rollingResistance: z.number().min(0).max(1),
  /** 0 = hard ground, 1 = robot bogs down completely at reference mass. */
  sinkage: z.number().min(0).max(1),
  /** Damage multiplier for impacts on this terrain. */
  impactRisk: z.number().min(0).max(1),
  /** Damage %/s per 10 cm of depth without a waterproof case. */
  waterDamage: z.number().min(0),
});
export type Terrain = z.infer<typeof TerrainSchema>;

export const ObstacleSchema = z.enum(['rock', 'step', 'log']);
export type Obstacle = z.infer<typeof ObstacleSchema>;

/** Height features (gameplay v2). Separate from `obstacle` so existing obstacle handling is untouched. */
export const TrackFeatureSchema = z.discriminatedUnion('type', [
  /** Launch ramp over the last `lengthM` of the segment; the lip is the segment end. */
  z.object({ type: z.literal('ramp'), launchDeg: z.number().positive().max(60), lengthM: z.number().positive() }),
  /** Gap over the first `widthM` of the segment: not cleared = the robot falls. */
  z.object({ type: z.literal('gap'), widthM: z.number().positive() }),
  /** Step down at the start of the segment. */
  z.object({ type: z.literal('drop'), heightM: z.number().positive() }),
]);
export type TrackFeature = z.infer<typeof TrackFeatureSchema>;

export const SegmentSchema = z.object({
  terrain: TerrainIdSchema,
  lengthM: z.number().positive(),
  slopeDeg: z.number().min(-45).max(45),
  obstacle: ObstacleSchema.optional(),
  /** Water / mud depth. */
  depthCm: z.number().min(0).optional(),
  /** Ramp, gap or drop on this segment (gameplay v2). Absent = flat rail, today's behaviour. */
  feature: TrackFeatureSchema.optional(),
  /** Water current against the direction of travel, m/s (deep water only). */
  currentMps: z.number().min(0).optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const TrackSchema = z.object({
  segments: z.array(SegmentSchema).min(1),
});
export type Track = z.infer<typeof TrackSchema>;

export const WeatherSchema = z.enum(['clear', 'rain', 'cold']);
export type Weather = z.infer<typeof WeatherSchema>;

/**
 * Weather beyond the `weather` label (overnight program). Every field is optional; absent = calm, clear and mild.
 * Known to every brain from the mission plan. Gusts and the real sensing range are felt through the build's sensors.
 */
export const ConditionsSchema = z.object({
  /** Steady wind along the track, m/s. Positive = headwind, negative = tailwind. */
  windMps: z.number().min(-30).max(30).optional(),
  /** Peak extra headwind in gusts, m/s. Gusts come and go during the run. */
  gustMps: z.number().min(0).max(30).optional(),
  precipitation: z.enum(['none', 'rain', 'heavy_rain', 'snow']).optional(),
  visibility: z.enum(['clear', 'fog', 'night']).optional(),
  /** Air temperature, °C. Cold lowers the usable battery capacity. */
  temperatureC: z.number().min(-40).max(50).optional(),
});
export type Conditions = z.infer<typeof ConditionsSchema>;

export const MissionIdSchema = z.enum(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']);
export type MissionId = z.infer<typeof MissionIdSchema>;

export const SeedSchema = z.number().int().min(0).max(0xffffffff);

/** Gameplay v3: stop with the zone under the robot (under 0.1 m/s) for 1.5 s to scan it. */
export const ScanZoneSchema = z.object({
  id: z.string().min(1),
  /** Display name, e.g. "survivor", "soil sample", "structure". */
  label: z.string().min(1),
  /** Track distance of the zone's centre, metres. */
  atM: z.number().min(0),
  /** The zone accepts a stop within this distance of its centre. */
  halfLengthM: z.number().positive(),
  /** Part sensor kinds that can scan it (any one). */
  needs: z.array(z.enum(['camera', 'moisture', 'ultrasonic', 'scout_drone', 'imu'])).min(1),
});
export type ScanZone = z.infer<typeof ScanZoneSchema>;

export const MissionSchema = z.object({
  id: MissionIdSchema,
  name: z.string().min(1),
  description: z.string(),
  weather: WeatherSchema,
  track: TrackSchema,
  /** Score needed for 2 stars (3 stars = threshold + zero damage). */
  starThreshold: z.number(),
  /** Set for the Room Challenge: every player gets the same seed. */
  fixedSeed: SeedSchema.optional(),
  leaderboard: z.boolean(),
  /** Wind, precipitation, visibility and temperature. Absent = calm and clear. */
  conditions: ConditionsSchema.optional(),
  /** Gameplay v3 objectives. Absent = none. */
  scanZones: z.array(ScanZoneSchema).optional(),
});
export type Mission = z.infer<typeof MissionSchema>;

/** Per-run conditions derived from mission + seed. Logged with the Episode. */
export const EnvironmentSchema = z.object({
  weather: WeatherSchema,
  /** Multiplier applied to terrain friction (1 = no jitter; practice missions use 0.9–1.1). */
  frictionJitter: z.number().positive(),
  sensorNoiseSeed: SeedSchema,
  /** Copied from the mission. */
  conditions: ConditionsSchema.optional(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;
