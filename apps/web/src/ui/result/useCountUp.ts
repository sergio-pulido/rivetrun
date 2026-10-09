'use client';

import { useEffect, useState } from 'react';

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Animates a number from 0 to target. Lands exactly on target; skips straight there with reduced motion or in a hidden tab. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    // A background tab gets no animation frames: land on the number instead of showing 0 until it is looked at.
    if (document.visibilityState === 'hidden' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
