'use client';

import { useEffect } from 'react';
import { useBuildStore } from '@/state/build';
import { useProgressStore } from '@/state/progress';
import { useSavedBuildsStore } from '@/state/savedBuilds';

/** Loads the saved loadout, progression and saved builds after mount, so server and first client render match. */
export function StoreSync() {
  useEffect(() => {
    useBuildStore.getState().hydrate();
    useProgressStore.getState().hydrate();
    useSavedBuildsStore.getState().hydrate();
  }, []);
  return null;
}
