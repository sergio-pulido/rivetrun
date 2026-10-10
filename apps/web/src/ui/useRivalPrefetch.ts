'use client';

import { useEffect, useState } from 'react';
import type { Mission } from '@rivetrun/contracts';
import { driveSeed } from '@rivetrun/sim';
import { ghostUrl } from '../../app/run/[mission]/ghost';
import { useBuildStore } from '@/state/build';
import { personalBestTrace } from '@/state/personalBests';
import { useRunStore } from '@/state/run';
import { buildStats, missionBlockers } from './buildStats';
import { nextPollMs, parseRivalStatus, type RivalStatus } from './rivalStatus';

/** Long enough for a slider drag or a typed briefing to settle; the server computes at most a few ghosts at once. */
const SETTLE_MS = 700;

/**
 * Drive mode races a Jev ghost the server needs several seconds to compute, and the run only waits briefly for it.
 * This asks for it ahead of time, with exactly the values the run page will use, each time they settle, and reports
 * whether it is ready: the status call starts the server's run when it has not started, then it is polled until ready.
 * Idle in Jev mode, for a build that is over budget or blocked on this mission, and when the player has chosen to
 * race their own stored ghost. Never throws.
 */
export function useRivalPrefetch(mission: Mission): RivalStatus {
  const mode = useBuildStore((store) => store.mode);
  const briefing = useBuildStore((store) => store.briefing);
  const rival = useBuildStore((store) => store.rival);
  // The run page reads build and priority from the run store, so the prefetch does too.
  const build = useRunStore((store) => store.build);
  const priority = useRunStore((store) => store.priority);
  const [status, setStatus] = useState<RivalStatus>('idle');

  // Each prefetch is a full Jev run against a shared quota: not for a robot that is over budget or cannot finish here.
  const worthIt = buildStats(build).overBudgetEur === 0 && missionBlockers(mission, build).length === 0;

  useEffect(() => {
    // Racing your own best run needs no Jev ghost.
    if (mode !== 'drive' || !worthIt || (rival === 'self' && personalBestTrace(mission.id, build) !== null)) {
      setStatus('idle');
      return;
    }
    const url = `${ghostUrl({ mission, seed: driveSeed(mission), build, priority, briefing })}&status=1`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let asked = 0;
    const ask = async (): Promise<void> => {
      let next: RivalStatus = 'unknown';
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        next = response.ok ? parseRivalStatus(await response.json()) : 'unknown';
      } catch {
        if (controller.signal.aborted) return;
      }
      setStatus(next);
      asked += 1;
      const wait = nextPollMs(next, asked);
      if (wait !== null) timer = setTimeout(() => void ask(), wait);
    };
    setStatus('unknown');
    timer = setTimeout(() => void ask(), SETTLE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [mode, worthIt, rival, mission, build, priority, briefing]);

  return status;
}
