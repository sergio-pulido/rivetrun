'use client';

import { useEffect } from 'react';
import type { RunFeed } from '../runFeed';

/** Vibrate where the device supports it (Android Chrome; iOS Safari ignores it). Never throws. */
export function haptic(pattern: number | number[]): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    // Browsers only vibrate after a tap on the page; asking earlier just logs a warning.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch {
    // Blocked by the browser or by a permissions policy: the game plays the same without it.
  }
}

/** Landings, crashes, falls and the wreck, felt in the hand. Driven by the run feed only. */
export function useRunHaptics(feed: RunFeed, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    let prev = feed.get();
    return feed.subscribe(() => {
      const view = feed.get();
      if (view.lastLanding && view.lastLanding !== prev.lastLanding) haptic(Math.round(Math.min(90, 14 + view.lastLanding.impactMps * 22)));
      if (view.lastDamage && view.lastDamage !== prev.lastDamage) haptic([45, 30, 70]);
      if (view.lastFall && view.lastFall !== prev.lastFall) haptic([90, 40, 90]);
      if (view.done && !prev.done) haptic(view.dnfReason ? [130, 60, 180] : [30, 40, 30, 40, 60]);
      prev = view;
    });
  }, [feed, enabled]);
}
