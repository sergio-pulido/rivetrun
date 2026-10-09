// Room Race wire format, shared by the route handlers, the phones and /screen.
import {
  ActionSchema,
  BriefingSchema,
  BuildSchema,
  DnfReasonSchema,
  MissionIdSchema,
  NicknameSchema,
  SeedSchema,
} from '@rivetrun/contracts';
import { z } from 'zod';

export const RACE_CODE_LENGTH = 4;
export const MAX_PLAYERS = 12;
export const COUNTDOWN_MS = 5000;
/** Phones post their sim state at 5 Hz. */
export const STATE_POST_MS = 200;
/** A race ends for everyone after this long, finished or not. */
export const RACE_TIMEOUT_MS = 180_000;

export const RaceCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/, 'room codes are 4 letters');

export const RaceStatusSchema = z.enum(['lobby', 'countdown', 'racing', 'finished']);
export type RaceStatus = z.infer<typeof RaceStatusSchema>;

export const RacePlayerSchema = z.object({
  id: z.string(),
  nickname: NicknameSchema,
  build: BuildSchema,
  briefing: BriefingSchema.optional(),
  /** Join order: picks the lane and the colour. */
  lane: z.number().int().min(0),
  /** Distance along the track, metres. */
  x: z.number(),
  v: z.number(),
  damagePct: z.number().min(0).max(100),
  batteryPct: z.number().min(0).max(100),
  lastAction: ActionSchema.nullable(),
  /** True while Jev is deciding (the phone's sim is in slow motion). */
  thinking: z.boolean(),
  /** The run ended: finished or DNF. */
  done: z.boolean(),
  finished: z.boolean(),
  dnfReason: DnfReasonSchema.nullable(),
  /** Wall-clock ms from the start signal to the end of the run. Orders the finishers. */
  raceMs: z.number().min(0).nullable(),
  score: z.number().nullable(),
});
export type RacePlayer = z.infer<typeof RacePlayerSchema>;

export const RaceSnapshotSchema = z.object({
  code: RaceCodeSchema,
  missionId: MissionIdSchema,
  seed: SeedSchema,
  status: RaceStatusSchema,
  /** Server epoch ms of the start signal (set from the countdown on). */
  startAt: z.number().nullable(),
  /** Server epoch ms when this snapshot was built: clients derive their clock offset from it. */
  serverNow: z.number(),
  /** Counts races run in this room; a new number means a new race. */
  raceNo: z.number().int().min(0),
  players: z.array(RacePlayerSchema),
});
export type RaceSnapshot = z.infer<typeof RaceSnapshotSchema>;

export const RaceActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('join'),
    nickname: NicknameSchema,
    build: BuildSchema,
    briefing: BriefingSchema.optional(),
  }),
  z.object({ action: z.literal('start'), missionId: MissionIdSchema.optional() }),
  z.object({ action: z.literal('reset') }),
  z.object({
    action: z.literal('state'),
    playerId: z.string(),
    token: z.string(),
    raceNo: z.number().int().min(0),
    x: z.number(),
    v: z.number(),
    damagePct: z.number().min(0).max(100),
    batteryPct: z.number().min(0).max(100),
    lastAction: ActionSchema.nullable(),
    thinking: z.boolean().default(false),
    done: z.boolean().default(false),
    finished: z.boolean().default(false),
    dnfReason: DnfReasonSchema.nullable().default(null),
    score: z.number().nullable().default(null),
  }),
]);
export type RaceAction = z.infer<typeof RaceActionSchema>;

export const JoinResponseSchema = z.object({ playerId: z.string(), token: z.string() });
export type JoinResponse = z.infer<typeof JoinResponseSchema>;

/** Live order: finishers by race time, then everyone else by distance covered. */
export function rankPlayers(players: readonly RacePlayer[]): RacePlayer[] {
  const group = (p: RacePlayer): number => (p.finished ? 0 : 1);
  return [...players].sort(
    (a, b) =>
      group(a) - group(b) ||
      (a.finished && b.finished ? (a.raceMs ?? 0) - (b.raceMs ?? 0) : b.x - a.x) ||
      a.lane - b.lane,
  );
}

/** One colour per lane: readable on dark slate, far apart from each other. */
export const LANE_COLORS = [
  '#ff6a13', '#5ef2ff', '#4ade80', '#fbbf24', '#f472b6', '#a78bfa',
  '#f8514a', '#38bdf8', '#a3e635', '#fb923c', '#e879f9', '#94a3b8',
] as const;
export const laneColor = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length]!;
