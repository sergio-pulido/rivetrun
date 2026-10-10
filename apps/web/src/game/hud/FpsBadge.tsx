'use client';

import { useEffect, useState } from 'react';
import { UI } from '../palette';
import { quality } from '../quality';
import { mk2Requested } from '../robot/mk2/flag';
import { mk2Live } from '../robot/mk2/live';

const STORAGE_KEY = 'rivetrun.fps';

/** Opt-in frame-rate readout for the phone gate: open any page once with `?fps=1` (`?fps=0` turns it off). */
export function fpsRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const forced = new URLSearchParams(window.location.search).get('fps');
    if (forced === '1' || forced === '0') window.localStorage.setItem(STORAGE_KEY, forced);
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Frames per second as the browser delivers them: the last second, and the worst second since the page opened
 * (after a 3 s warm-up, so shader compilation does not count). Tap it to reset the worst value.
 */
export function FpsBadge() {
  const [shown, setShown] = useState(false);
  const [stats, setStats] = useState({ now: 0, worst: 0 });
  const [epoch, setEpoch] = useState(0);

  useEffect(() => setShown(fpsRequested()), []);

  useEffect(() => {
    if (!shown) return undefined;
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();
    const opened = windowStart;
    let worst = Infinity;
    const tick = (time: number): void => {
      frames += 1;
      if (time - windowStart >= 1000) {
        const fps = Math.round((frames * 1000) / (time - windowStart));
        if (time - opened > 3000) worst = Math.min(worst, fps);
        setStats({ now: fps, worst: Number.isFinite(worst) ? worst : fps });
        frames = 0;
        windowStart = time;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, epoch]);

  if (!shown) return null;
  const ok = stats.worst >= 50;
  return (
    <button
      type="button"
      onClick={() => setEpoch((n) => n + 1)}
      className="pointer-events-auto absolute left-3 rounded-lg px-2.5 py-1.5 text-left font-mono text-[11px] leading-tight"
      style={{ top: 'calc(max(14px, env(safe-area-inset-top)) + 136px)', background: 'rgb(14 16 19 / 0.88)', border: `1px solid ${ok ? UI.ok : UI.bad}`, color: UI.text }}
      aria-label="Frame rate. Tap to reset the worst value."
    >
      <span className="block text-[15px] font-semibold tabular-nums" style={{ color: ok ? UI.ok : UI.bad }}>
        {stats.now} fps
      </span>
      <span className="block tabular-nums" style={{ color: UI.dim }}>
        worst {stats.worst} · {!mk2Requested('run') ? 'procedural' : mk2Live.robots > 0 ? 'MK-II' : `MK-II not loaded${mk2Live.reason ? ` (${mk2Live.reason})` : ''}: procedural`} · dpr ≤ {quality().maxDpr}
      </span>
    </button>
  );
}
