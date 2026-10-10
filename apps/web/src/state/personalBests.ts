'use client';

import { GhostTraceSchema, MissionIdSchema, type Build, type Episode, type GhostTrace, type MissionId } from '@rivetrun/contracts';
import { create } from 'zustand';
import { z } from 'zod';
import { readJson, writeJson } from './storage';

const STORAGE_KEY = 'rivetrun.bests.v1';
const TRACE_KEY = 'rivetrun.best-trace.v1';
/** Episodes already counted, so a result screen that mounts twice does not count a run twice. */
const SEEN_MEMORY = 60;
const BESTS_MAX = 120;
/** A trace is about 100 KB: keep the latest few, not one per robot ever driven. */
const TRACES_MAX = 6;

/** One robot, whatever order its parts were fitted in. Tuning is part of the robot; the old 100 mm wheel is today's 90 mm. */
export function buildKey(build: Build): string {
  const wheel = build.wheelSizeMm === 100 ? 90 : build.wheelSizeMm;
  return [build.locomotion, build.motor, build.battery, [...build.sensors].sort().join('+'), [...build.extras].sort().join('+'), build.batteryCells ?? '', wheel ?? '', build.gearStep ?? ''].join('|');
}

const PersonalBestSchema = z.object({
  missionId: MissionIdSchema,
  buildKey: z.string().min(1),
  /** The robot's name when the best was set (a preset or a saved build's name). */
  buildName: z.string(),
  /** The best finished run; null while every run on this mission with this robot has ended in a DNF. */
  timeS: z.number().min(0).nullable(),
  score: z.number().nullable(),
  stars: z.number().int().min(0).max(3),
  /** Every run counted, finished or not. */
  runs: z.number().int().min(0),
  /** ISO time the best was set. */
  at: z.string().nullable(),
});
export type PersonalBest = z.infer<typeof PersonalBestSchema>;

export interface RecordOutcome {
  /** This run is the new best for its mission and robot. */
  readonly improved: boolean;
  /** The best it was measured against (with a finished run), if there was one. */
  readonly previous: PersonalBest | null;
  /** The episode had been counted already: nothing changed. */
  readonly repeat?: true;
}

interface PersonalBestsStore {
  readonly bests: readonly PersonalBest[];
  readonly seen: readonly string[];
  /** Counts a run and keeps it when it is the best. With `trace` (the player's own run as a ghost) a new best can be raced later. */
  readonly record: (episode: Episode, buildName: string, trace?: GhostTrace) => RecordOutcome;
  readonly hydrate: () => void;
}

const sameRobot = (best: PersonalBest, missionId: MissionId, key: string): boolean => best.missionId === missionId && best.buildKey === key;

/** The best with this exact robot on this mission. */
export const bestFor = (bests: readonly PersonalBest[], missionId: MissionId, build: Build): PersonalBest | null =>
  bests.find((best) => sameRobot(best, missionId, buildKey(build))) ?? null;

/** Higher score wins; on equal score, the faster run. */
const beats = (score: number, timeS: number, best: PersonalBest): boolean => best.score === null || best.timeS === null || score > best.score || (score === best.score && timeS < best.timeS);

/** The best finished run on a mission with any robot. */
export const bestOnMission = (bests: readonly PersonalBest[], missionId: MissionId): PersonalBest | null =>
  bests
    .filter((best) => best.missionId === missionId && best.score !== null && best.timeS !== null)
    .reduce<PersonalBest | null>((top, best) => (top === null || beats(best.score!, best.timeS!, top) ? best : top), null);

const TraceIndexSchema = z.array(z.object({ missionId: MissionIdSchema, buildKey: z.string() }));
const traceKey = (missionId: MissionId, key: string): string => `${TRACE_KEY}.${missionId}.${key}`;

function storeTrace(missionId: MissionId, key: string, trace: GhostTrace): void {
  const index = TraceIndexSchema.safeParse(readJson(TRACE_KEY));
  const others = (index.success ? index.data : []).filter((entry) => !(entry.missionId === missionId && entry.buildKey === key));
  const kept = [{ missionId, buildKey: key }, ...others];
  // Drop the oldest traces beyond the limit: the times stay, only the ghost goes.
  for (const old of kept.slice(TRACES_MAX)) {
    try {
      window.localStorage.removeItem(traceKey(old.missionId, old.buildKey));
    } catch {
      // Storage is best effort.
    }
  }
  writeJson(traceKey(missionId, key), trace);
  writeJson(TRACE_KEY, kept.slice(0, TRACES_MAX));
}

/** The player's best run with this robot on this mission as a ghost to race, or null when none is stored. */
export function personalBestTrace(missionId: MissionId, build: Build): GhostTrace | null {
  const parsed = GhostTraceSchema.safeParse(readJson(traceKey(missionId, buildKey(build))));
  return parsed.success ? parsed.data : null;
}

export const usePersonalBestsStore = create<PersonalBestsStore>((set, get) => ({
  bests: [],
  seen: [],
  record: (episode, buildName, trace) => {
    const state = get();
    if (state.seen.includes(episode.id)) return { improved: false, previous: null, repeat: true };
    const { missionId, outcome } = episode;
    const key = buildKey(episode.build);
    const current = state.bests.find((best) => sameRobot(best, missionId, key)) ?? null;
    const improved = outcome.finished && (current === null || beats(outcome.score, outcome.timeS, current));
    const base: PersonalBest = current ?? { missionId, buildKey: key, buildName, timeS: null, score: null, stars: 0, runs: 0, at: null };
    const next: PersonalBest = improved
      ? { ...base, buildName, timeS: outcome.timeS, score: outcome.score, stars: outcome.stars, runs: base.runs + 1, at: new Date().toISOString() }
      : { ...base, runs: base.runs + 1 };
    const bests = [next, ...state.bests.filter((best) => !sameRobot(best, missionId, key))].slice(0, BESTS_MAX);
    const seen = [...state.seen, episode.id].slice(-SEEN_MEMORY);
    set({ bests, seen });
    writeJson(STORAGE_KEY, { bests, seen });
    if (improved && trace) storeTrace(missionId, key, trace);
    return { improved, previous: current && current.timeS !== null ? current : null };
  },
  hydrate: () => {
    const stored = z.object({ bests: z.array(z.unknown()), seen: z.array(z.string()).default([]) }).safeParse(readJson(STORAGE_KEY));
    if (!stored.success) return;
    // One unreadable entry is dropped; the rest of the bests still load.
    const bests = stored.data.bests.flatMap((entry) => {
      const parsed = PersonalBestSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
    set({ bests, seen: stored.data.seen });
  },
}));
