'use client';

import { useEffect } from 'react';
import type { Mission } from '@rivetrun/contracts';
import { prefetchRivalGhost } from '../../app/run/[mission]/ghost';
import { useBuildStore } from '@/state/build';
import { useRunStore } from '@/state/run';

/** Long enough for a slider drag or a typed briefing to settle; the server computes at most a few ghosts at once. */
const SETTLE_MS = 700;

/**
 * Drive mode races a Jev ghost the server needs several seconds to compute, and the run only waits briefly for it.
 * This asks for it ahead of time, with exactly the values the run page will use, each time they settle.
 * Does nothing in Jev mode. Never throws.
 */
export function useRivalPrefetch(mission: Mission): void {
  const mode = useBuildStore((store) => store.mode);
  const briefing = useBuildStore((store) => store.briefing);
  // The run page reads build and priority from the run store, so the prefetch does too.
  const build = useRunStore((store) => store.build);
  const priority = useRunStore((store) => store.priority);

  useEffect(() => {
    if (mode !== 'drive') return;
    const timer = setTimeout(() => prefetchRivalGhost({ mission, build, priority, briefing }), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [mode, mission, build, priority, briefing]);
}
