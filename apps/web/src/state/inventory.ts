'use client';

import { create } from 'zustand';
import { readJson, writeJson } from './storage';

const STORAGE_KEY = 'rivetrun.inventory.v1';
/** Far more than the bill of materials has lines; a guard against a corrupted list. */
const OWNED_MAX = 500;

/** The inventory key of a printed part: printed parts and bought components are named in different files. */
export const printedKey = (id: string): string => `printed:${id}`;

/** What was stored, as a list of keys: anything else in it is dropped. */
export function parseOwned(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((key): key is string => typeof key === 'string' && key.length > 0))].slice(0, OWNED_MAX);
}

interface InventoryStore {
  /** "My parts": keys of the real components (bill-of-materials keys) and printed parts the player already has. Kept on this device only. */
  readonly owned: readonly string[];
  readonly toggle: (key: string) => void;
  readonly hydrate: () => void;
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  owned: [],
  toggle: (key) => {
    const { owned } = get();
    const next = owned.includes(key) ? owned.filter((other) => other !== key) : [...owned, key];
    set({ owned: next });
    writeJson(STORAGE_KEY, next);
  },
  hydrate: () => set({ owned: parseOwned(readJson(STORAGE_KEY)) }),
}));
