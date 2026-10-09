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

export const SegmentSchema = z.object({
  terrain: TerrainIdSchema,
  lengthM: z.number().positive(),
  slopeDeg: z.number().min(-45).max(45),
  obstacle: ObstacleSchema.optional(),
  /** Water / mud depth. */
  depthCm: z.number().min(0).optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const TrackSchema = z.object({
  segments: z.array(SegmentSchema).min(1),
});
export type Track = z.infer<typeof TrackSchema>;

export const WeatherSchema = z.enum(['clear', 'rain', 'cold']);
export type Weather = z.infer<typeof WeatherSchema>;

export const MissionIdSchema = z.enum(['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
export type MissionId = z.infer<typeof MissionIdSchema>;

export const SeedSchema = z.number().int().min(0).max(0xffffffff);

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
});
export type Mission = z.infer<typeof MissionSchema>;

/** Per-run conditions derived from mission + seed. Logged with the Episode. */
export const EnvironmentSchema = z.object({
  weather: WeatherSchema,
  /** Multiplier applied to terrain friction (1 = no jitter; practice missions use 0.9–1.1). */
  frictionJitter: z.number().positive(),
  sensorNoiseSeed: SeedSchema,
});
export type Environment = z.infer<typeof EnvironmentSchema>;
