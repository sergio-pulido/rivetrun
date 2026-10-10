import { z } from 'zod';
import { TerrainIdSchema } from './world';

export const SlotSchema = z.enum(['locomotion', 'motor', 'battery', 'sensor', 'extra']);
export type Slot = z.infer<typeof SlotSchema>;

export const SensorKindSchema = z.enum(['ultrasonic', 'imu', 'camera', 'moisture', 'scout_drone']);
export type SensorKind = z.infer<typeof SensorKindSchema>;

export const ExtraKindSchema = z.enum(['winch', 'waterproof_case', 'bumper', 'thruster_kit', 'piston_jump']);
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
  /** Multiplier on ground clearance from this locomotion (knobbly tyres and tracks ride over more). Missing = 1. */
  clearanceFactor: z.number().positive().optional(),
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
  /** Brain v3 name of this sensor as a source of knowledge, when it differs from its kind (lidar and ToF are ultrasonic-kind rangers). */
  source: z.enum(['ultrasonic', 'tof', 'lidar']).optional(),
  rangeM: z.number().positive().optional(),
  // extra
  extra: ExtraKindSchema.optional(),
  /** Multiplier on impact damage (bumper = 0.5). */
  impactDamageFactor: z.number().min(0).max(1).optional(),
  waterproof: z.boolean().optional(),
  /** This extra only works when the build also has that extra (thruster kit needs the waterproof case). */
  requiresExtra: ExtraKindSchema.optional(),
  /** Vertical launch speed of a jump, m/s (piston). */
  jumpImpulseMps: z.number().positive().optional(),
  /** Seconds before the part's action can be used again. */
  cooldownS: z.number().min(0).optional(),
  /** Deepest water the part lets a sealed robot cross by swimming, cm. */
  maxSwimDepthCm: z.number().positive().optional(),
  /** A camera that keeps its range in the dark (no IR filter, with IR lamps). */
  nightVision: z.boolean().optional(),
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
  /** True while the part has no behaviour yet: the Workshop hides it. */
  comingSoon: z.boolean().optional(),
  effects: PartEffectsSchema,
});
export type Part = z.infer<typeof PartSchema>;

export const BuildSchema = z.object({
  locomotion: PartIdSchema,
  motor: PartIdSchema,
  battery: PartIdSchema,
  sensors: z.array(PartIdSchema).max(2),
  extras: z.array(PartIdSchema).max(2),
  // Gameplay v2 tuning. All optional: absent reproduces the part's stock behaviour.
  /** Battery cells in series, 1S–4S. */
  batteryCells: z.number().int().min(1).max(4).optional(),
  /** Wheel diameter: S 60 / M 80 / L 90 (the largest real wheel in docs/MK2_BOM.md). 100 is the old value for L, still accepted from saved builds. */
  wheelSizeMm: z.union([z.literal(60), z.literal(80), z.literal(90), z.literal(100)]).optional(),
  /** Gearing, 1 = speed … 5 = torque. */
  gearStep: z.number().int().min(1).max(5).optional(),
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
