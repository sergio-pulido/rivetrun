import { z } from 'zod';
import { TerrainIdSchema } from './world';

export const SlotSchema = z.enum(['locomotion', 'motor', 'battery', 'sensor', 'extra']);
export type Slot = z.infer<typeof SlotSchema>;

export const SensorKindSchema = z.enum(['ultrasonic', 'imu', 'camera', 'moisture', 'scout_drone']);
export type SensorKind = z.infer<typeof SensorKindSchema>;

export const ExtraKindSchema = z.enum(['winch', 'waterproof_case', 'bumper', 'thruster_kit']);
export type ExtraKind = z.infer<typeof ExtraKindSchema>;

export const PartIdSchema = z.string().min(1).max(40);
export type PartId = z.infer<typeof PartIdSchema>;

/** Effect fields. Each part sets only the ones that apply to its slot. */
export const PartEffectsSchema = z.object({
  // locomotion
  /** Friction multiplier per terrain (missing terrain = 1). */
  grip: z.partialRecord(TerrainIdSchema, z.number().positive()).optional(),
  /** Multiplier on terrain sinkage (tracks < 1). */
  sinkageFactor: z.number().positive().optional(),
  /** Multiplier on the impact of driving onto rough ground too fast (tracks < 1; missing = 1). */
  roughGroundFactor: z.number().min(0).max(1).optional(),
  /** Deepest water this locomotion can drive through, cm. Deeper needs thrusters. */
  maxWadingDepthCm: z.number().positive().optional(),
  /** Tip-over limit. */
  maxSlopeDeg: z.number().positive().optional(),
  // motor
  topSpeedMps: z.number().positive().optional(),
  torqueNm: z.number().positive().optional(),
  // battery
  capacityWh: z.number().positive().optional(),
  // sensor
  sensor: SensorKindSchema.optional(),
  rangeM: z.number().positive().optional(),
  // extra
  extra: ExtraKindSchema.optional(),
  /** Multiplier on impact damage (bumper = 0.5). */
  impactDamageFactor: z.number().min(0).max(1).optional(),
  waterproof: z.boolean().optional(),
  /** This extra only works when the build also has that extra (thruster kit needs the waterproof case). */
  requiresExtra: ExtraKindSchema.optional(),
  /** Deepest water the part lets a sealed robot cross by swimming, cm. */
  maxSwimDepthCm: z.number().positive().optional(),
});
export type PartEffects = z.infer<typeof PartEffectsSchema>;

export const PartSchema = z.object({
  id: PartIdSchema,
  name: z.string().min(1),
  slot: SlotSchema,
  blurb: z.string(),
  massKg: z.number().positive(),
  costEur: z.number().min(0),
  powerW: z.number().min(0),
  /** Points needed to unlock; 0 = available from the start. */
  unlockPoints: z.number().int().min(0),
  effects: PartEffectsSchema,
});
export type Part = z.infer<typeof PartSchema>;

export const BuildSchema = z.object({
  locomotion: PartIdSchema,
  motor: PartIdSchema,
  battery: PartIdSchema,
  sensors: z.array(PartIdSchema).max(2),
  extras: z.array(PartIdSchema).max(2),
});
export type Build = z.infer<typeof BuildSchema>;

export const PresetIdSchema = z.enum(['speedster', 'mud_crawler', 'all_rounder', 'deep_diver']);
export type PresetId = z.infer<typeof PresetIdSchema>;

export const PresetSchema = z.object({
  id: PresetIdSchema,
  name: z.string().min(1),
  blurb: z.string(),
  build: BuildSchema,
});
export type Preset = z.infer<typeof PresetSchema>;
