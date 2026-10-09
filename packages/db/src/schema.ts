import type { Episode } from '@rivetrun/contracts';
import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** One row per submitted run. `data` holds the full validated Episode. */
export const episodes = pgTable(
  'episodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientEpisodeId: text('client_episode_id').notNull(),
    missionId: text('mission_id').notNull(),
    seed: integer('seed').notNull(),
    policy: text('policy').notNull(),
    nickname: text('nickname').notNull(),
    finished: boolean('finished').notNull(),
    score: real('score').notNull(),
    timeS: real('time_s').notNull(),
    damagePct: real('damage_pct').notNull(),
    energyUsedPct: real('energy_used_pct').notNull(),
    data: jsonb('data').$type<Episode>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('episodes_mission_idx').on(table.missionId)],
);

/** Best run per (mission, nickname). */
export const leaderboard = pgTable(
  'leaderboard',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    missionId: text('mission_id').notNull(),
    nickname: text('nickname').notNull(),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id),
    policy: text('policy').notNull(),
    score: real('score').notNull(),
    timeS: real('time_s').notNull(),
    damagePct: real('damage_pct').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('leaderboard_mission_nickname_uq').on(table.missionId, table.nickname),
    index('leaderboard_mission_score_idx').on(table.missionId, table.score),
  ],
);

export type EpisodeRow = typeof episodes.$inferSelect;
export type NewEpisodeRow = typeof episodes.$inferInsert;
export type LeaderboardRow = typeof leaderboard.$inferSelect;
export type NewLeaderboardRow = typeof leaderboard.$inferInsert;
