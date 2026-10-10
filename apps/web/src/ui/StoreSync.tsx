'use client';

import { useEffect } from 'react';
import { useBuildStore } from '@/state/build';
import { useInventoryStore } from '@/state/inventory';
import { usePersonalBestsStore } from '@/state/personalBests';
import { useProgressStore } from '@/state/progress';
import { useSavedBuildsStore } from '@/state/savedBuilds';

/** Loads the saved loadout, progression, saved builds, parts inventory and personal bests after mount, so server and first client render match. */
export function StoreSync() {
  useEffect(() => {
    useBuildStore.getState().hydrate();
    useProgressStore.getState().hydrate();
    useSavedBuildsStore.getState().hydrate();
    useInventoryStore.getState().hydrate();
    usePersonalBestsStore.getState().hydrate();
  }, []);
  return null;
}
