'use client';

import { BuildSchema, type Build } from '@rivetrun/contracts';
import { create } from 'zustand';
import { z } from 'zod';
import { isValidBuild } from './build';
import { readJson, writeJson } from './storage';

const STORAGE_KEY = 'rivetrun.builds.v1';
export const BUILD_NAME_MAX = 24;
/** Enough for a hackathon afternoon; keeps the picker to one swipe. */
export const SAVED_BUILDS_MAX = 12;

const SavedBuildSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(BUILD_NAME_MAX),
  build: BuildSchema,
  /** ISO time of the last save. */
  savedAt: z.string(),
});
export type SavedBuild = z.infer<typeof SavedBuildSchema>;

export type SaveOutcome = { readonly ok: true; readonly id: string; readonly replaced: boolean } | { readonly ok: false; readonly reason: 'name' | 'full' };

interface SavedBuildsStore {
  /** Newest first. Kept on this device only. */
  readonly builds: readonly SavedBuild[];
  /** Saves under a name. The same name (any letter case) replaces that build instead of adding a second one. */
  readonly save: (name: string, build: Build) => SaveOutcome;
  /** False when the name is empty or another build already has it. */
  readonly rename: (id: string, name: string) => boolean;
  readonly remove: (id: string) => void;
  readonly hydrate: () => void;
}

/** Trimmed and cut to length; null when nothing is left. */
export const cleanBuildName = (name: string): string | null => name.trim().replace(/\s+/g, ' ').slice(0, BUILD_NAME_MAX) || null;

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `build-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

export const useSavedBuildsStore = create<SavedBuildsStore>((set, get) => {
  const commit = (builds: readonly SavedBuild[]): void => {
    set({ builds });
    writeJson(STORAGE_KEY, builds);
  };
  return {
    builds: [],
    save: (rawName, build) => {
      const name = cleanBuildName(rawName);
      if (!name) return { ok: false, reason: 'name' };
      const { builds } = get();
      const existing = builds.find((saved) => sameName(saved.name, name));
      if (!existing && builds.length >= SAVED_BUILDS_MAX) return { ok: false, reason: 'full' };
      const saved: SavedBuild = { id: existing?.id ?? newId(), name, build, savedAt: new Date().toISOString() };
      commit([saved, ...builds.filter((other) => other.id !== saved.id)]);
      return { ok: true, id: saved.id, replaced: existing !== undefined };
    },
    rename: (id, rawName) => {
      const name = cleanBuildName(rawName);
      const { builds } = get();
      if (!name || builds.some((saved) => saved.id !== id && sameName(saved.name, name))) return false;
      commit(builds.map((saved) => (saved.id === id ? { ...saved, name } : saved)));
      return true;
    },
    remove: (id) => commit(get().builds.filter((saved) => saved.id !== id)),
    hydrate: () => {
      const parsed = z.array(z.unknown()).safeParse(readJson(STORAGE_KEY));
      if (!parsed.success) return;
      // One bad entry (or a part that no longer exists) drops that build, not the whole list.
      const builds = parsed.data.flatMap((entry) => {
        const saved = SavedBuildSchema.safeParse(entry);
        return saved.success && isValidBuild(saved.data.build) ? [saved.data] : [];
      });
      set({ builds: builds.slice(0, SAVED_BUILDS_MAX) });
    },
  };
});
