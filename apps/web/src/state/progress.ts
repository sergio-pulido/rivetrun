'use client';

import { MissionIdSchema, type Episode, type MissionId, type PartId } from '@rivetrun/contracts';
import { PARTS, PARTS_BY_ID } from '@rivetrun/sim';
import { create } from 'zustand';
import { z } from 'zod';
import { readJson, writeJson } from './storage';

const STORAGE_KEY = 'rivetrun.progress.v1';
const AWARDED_MEMORY = 30;

const BestSchema = z.object({ score: z.number(), stars: z.number().int().min(0).max(3) });
export type Best = z.infer<typeof BestSchema>;

const ProgressSchema = z.object({
  points: z.number().int().min(0),
  unlocked: z.array(z.string()),
  nickname: z.string().max(16),
  runs: z.number().int().min(0),
  best: z.partialRecord(MissionIdSchema, BestSchema),
  /** Episode ids already paid out, so a reload of Result never pays twice. */
  awarded: z.array(z.string()),
  /** Play modes whose first-run coach marks have been shown. Older saves have none. */
  coachSeen: z.array(z.string()).default([]),
});
type Progress = z.infer<typeof ProgressSchema>;

interface ProgressStore extends Progress {
  /** Pays the episode's score as points (once per episode). Returns the points paid. */
  readonly award: (episode: Episode) => number;
  /** Spends points on a locked part. False when the player cannot afford it. */
  readonly unlock: (partId: PartId) => boolean;
  readonly setNickname: (nickname: string) => void;
  /** Records that the coach marks for a play mode were shown, so they never show again. */
  readonly markCoachSeen: (mode: string) => void;
  /** False until the saved progress has been read: nothing first-run-only should show before that. */
  readonly hydrated: boolean;
  readonly hydrate: () => void;
}

const INITIAL: Progress = { points: 0, unlocked: [], nickname: '', runs: 0, best: {}, awarded: [], coachSeen: [] };

const snapshot = (state: Progress): Progress => ({
  points: state.points,
  unlocked: state.unlocked,
  nickname: state.nickname,
  runs: state.runs,
  best: state.best,
  awarded: state.awarded,
  coachSeen: state.coachSeen,
});

/** Parts that cost points to use. */
export const LOCKED_PARTS = PARTS.filter((part) => part.unlockPoints > 0);

export const isUnlocked = (unlocked: readonly PartId[], partId: PartId): boolean =>
  (PARTS_BY_ID.get(partId)?.unlockPoints ?? 0) === 0 || unlocked.includes(partId);

export const useProgressStore = create<ProgressStore>((set, get) => {
  const commit = (patch: Partial<Progress>): void => {
    set(patch);
    writeJson(STORAGE_KEY, snapshot(get()));
  };
  return {
    ...INITIAL,
    hydrated: false,
    award: (episode) => {
      const state = get();
      if (state.awarded.includes(episode.id)) return 0;
      const earned = Math.max(0, Math.round(episode.outcome.score));
      const missionId: MissionId = episode.missionId;
      const previous = state.best[missionId];
      const improved = !previous || episode.outcome.score > previous.score;
      commit({
        points: state.points + earned,
        runs: state.runs + 1,
        awarded: [...state.awarded, episode.id].slice(-AWARDED_MEMORY),
        best: improved
          ? { ...state.best, [missionId]: { score: episode.outcome.score, stars: Math.max(previous?.stars ?? 0, episode.outcome.stars) } }
          : state.best,
      });
      return earned;
    },
    unlock: (partId) => {
      const state = get();
      const cost = PARTS_BY_ID.get(partId)?.unlockPoints ?? 0;
      if (isUnlocked(state.unlocked, partId)) return true;
      if (state.points < cost) return false;
      commit({ points: state.points - cost, unlocked: [...state.unlocked, partId] });
      return true;
    },
    setNickname: (nickname) => commit({ nickname: nickname.slice(0, 16) }),
    markCoachSeen: (mode) => {
      if (!get().coachSeen.includes(mode)) commit({ coachSeen: [...get().coachSeen, mode] });
    },
    hydrate: () => {
      const parsed = ProgressSchema.safeParse(readJson(STORAGE_KEY));
      set(parsed.success ? { ...parsed.data, hydrated: true } : { hydrated: true });
    },
  };
});
