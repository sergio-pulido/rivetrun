'use client';

import type { Build, Episode, MissionId, Outcome, Policy } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, PRESETS } from '@rivetrun/sim';
import { create } from 'zustand';

export const DEFAULT_PRIORITY = 0.5;

export interface GhostResult {
  readonly policy: Policy;
  readonly outcome: Outcome;
}

/** What the Result page needs: the player's Episode and the two Brain Duel outcomes. */
export interface RunResult {
  readonly missionId: MissionId;
  readonly episode: Episode;
  readonly ghosts: readonly GhostResult[];
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
