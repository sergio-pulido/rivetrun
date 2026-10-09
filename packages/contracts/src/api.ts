import { z } from 'zod';
import { BrainDecisionSchema, BrainQuestionSchema, PolicySchema } from './brain';
import { EpisodeSchema } from './run';
import { MissionIdSchema } from './world';

export const NicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'letters, numbers, space, _ . - only');

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().min(1),
  nickname: NicknameSchema,
  missionId: MissionIdSchema,
  score: z.number(),
  timeS: z.number().min(0),
  damagePct: z.number().min(0).max(100),
  policy: PolicySchema,
  createdAt: z.iso.datetime(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.enum([
    'not_implemented',
    'bad_request',
    'rate_limited',
    'upstream_timeout',
    'upstream_error',
    'internal',
  ]),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// POST /api/decide
export const DecideRequestSchema = BrainQuestionSchema;
export type DecideRequest = z.infer<typeof DecideRequestSchema>;
export const DecideResponseSchema = BrainDecisionSchema;
export type DecideResponse = z.infer<typeof DecideResponseSchema>;

// POST /api/runs
export const SubmitRunRequestSchema = z.object({
  nickname: NicknameSchema,
  episode: EpisodeSchema,
});
export type SubmitRunRequest = z.infer<typeof SubmitRunRequestSchema>;
export const SubmitRunResponseSchema = z.object({
  /** false when DATABASE_URL is unset: the run was valid but not stored. */
  stored: z.boolean(),
  id: z.string().optional(),
  rank: z.number().int().min(1).optional(),
});
export type SubmitRunResponse = z.infer<typeof SubmitRunResponseSchema>;

// GET /api/leaderboard?mission=M5
export const LeaderboardQuerySchema = z.object({
  mission: MissionIdSchema.default('M5'),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;
export const LeaderboardResponseSchema = z.object({
  missionId: MissionIdSchema,
  entries: z.array(LeaderboardEntrySchema).max(20),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

// GET /api/stats
export const StatsResponseSchema = z.object({
  episodes: z.number().int().min(0),
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
