'use client';

import { useEffect, useState } from 'react';
import { UI } from './palette';
import styles from './scene.module.css';
import { TIPS } from './tips';

const TIP_MS = 3600;

export interface SceneLoaderProps {
  /** What is getting ready, e.g. "Building the track". */
  label?: string;
  /** Rotate gameplay tips under the label. */
  tips?: boolean;
  /** Fade out (the scene has drawn its first frame). */
  leaving?: boolean;
  /** Shown instead of the spinner when the 3D view cannot run at all. */
  failed?: string | null;
}

/**
 * What a 3D scene shows until it has drawn its first frame: a drafting-sheet cover, a spinner,
 * a label and a rotating tip. Pure DOM, so it is also the fallback while the three.js chunk downloads.
 */
export function SceneLoader({ label = 'Starting the 3D view', tips = true, leaving = false, failed = null }: SceneLoaderProps) {
  // The first tip is fixed so server and client markup agree; later ones are random.
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (!tips || failed) return undefined;
    setTip(Math.floor(Math.random() * TIPS.length));
    const id = window.setInterval(() => setTip((current) => (current + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length), TIP_MS);
    return () => window.clearInterval(id);
  }, [tips, failed]);

  return (
    <div
      className={`${styles.cover} pointer-events-none absolute inset-0 flex flex-col items-center px-6 text-center`}
      style={{ opacity: leaving ? 0 : 1, color: UI.text, paddingTop: '26vh' }}
      role="status"
      aria-live="polite"
    >
      {failed ? (
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke={UI.warn} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 5 40 37H4Z" />
          <path d="M22 17v9m0 5v.5" />
        </svg>
      ) : (
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className={styles.spinner} aria-hidden>
          <circle cx="22" cy="22" r="17" stroke={UI.line} strokeWidth="5" />
          <path d="M22 5a17 17 0 0 1 17 17" stroke={UI.cyan} strokeWidth="5" strokeLinecap="round" />
        </svg>
      )}
      <p className="mt-4 font-display text-[15px] font-bold uppercase tracking-[2px]" style={{ color: failed ? UI.warn : UI.cyan }}>
        {failed ?? label}
      </p>
      {tips && !failed ? (
        <p key={tip} className={`${styles.tip} mt-3 max-w-[300px] text-[13px] leading-snug`} style={{ color: UI.text }}>
          <span className="mr-1.5 font-mono text-[10px] tracking-[1.5px]" style={{ color: UI.dim }}>
            TIP
          </span>
          {TIPS[tip]}
        </p>
      ) : null}
    </div>
  );
}
