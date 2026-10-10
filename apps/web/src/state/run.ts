'use client';

import type { Build, DecisionLog, Episode, GhostTrace, MissionId, Outcome, Policy } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, PRESETS } from '@rivetrun/sim';
import { create } from 'zustand';

export const DEFAULT_PRIORITY = 0.5;

export interface GhostResult {
  readonly policy: Policy;
  readonly outcome: Outcome;
  /** Decisions the ghost's brain made, when known (the Jev ghost in Drive mode). */
  readonly decisions?: number;
  /** How many of those the heuristic made because Jev failed or timed out. */
  readonly fallbacks?: number;
  /** The ghost's decision log on its own clock; entries for perception events carry trigger.eventId for pairing. */
  readonly log?: readonly DecisionLog[];
  /** Median response time of the ghost's brain over its decisions, ms (from /api/ghost, when it reports one). */
  readonly medianLatencyMs?: number;
}

/** What the Result page needs: the player's Episode and the ghost outcomes (two in Jev mode, the rival in Drive mode). */
export interface RunResult {
  readonly missionId: MissionId;
  readonly episode: Episode;
  readonly ghosts: readonly GhostResult[];
  /** The player's own run as a ghost (frames at 10 Hz, policy 'human' in Drive mode), so it can be raced again. */
  readonly trace?: GhostTrace;
}

interface RunStore {
  /** The build the next run deploys. Default: the All-rounder preset. */
  readonly build: Build;
  /** 0 = speed, 1 = safety. */
  readonly priority: number;
  readonly result: RunResult | null;
  readonly setBuild: (build: Build) => void;
  readonly setPriority: (priority: number) => void;
  readonly setResult: (result: RunResult) => void;
  readonly clearResult: () => void;
}

export const useRunStore = create<RunStore>((set) => ({
  build: PRESETS[DEFAULT_PRESET_ID].build,
  priority: DEFAULT_PRIORITY,
  result: null,
  setBuild: (build) => set({ build }),
  setPriority: (priority) => set({ priority: Math.min(1, Math.max(0, priority)) }),
  setResult: (result) => set({ result }),
  clearResult: () => set({ result: null }),
}));
