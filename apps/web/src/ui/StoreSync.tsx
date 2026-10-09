'use client';

import { useEffect } from 'react';
import { useBuildStore } from '@/state/build';
import { useProgressStore } from '@/state/progress';

/** Loads the saved loadout and progression after mount, so server and first client render match. */
export function StoreSync() {
  useEffect(() => {
    useBuildStore.getState().hydrate();
    useProgressStore.getState().hydrate();
  }, []);
  return null;
}
