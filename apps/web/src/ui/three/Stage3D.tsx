'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** How long the browser gets to go idle before the 3D code is fetched anyway. */
const IDLE_TIMEOUT_MS = 2000;
/** Browsers without requestIdleCallback (Safari) wait this long after load instead. */
const NO_IDLE_API_DELAY_MS = 600;
const FADE_MS = 450;

interface Connection {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/** Data saver or a 2G-class link: the 3D download waits for a tap instead of starting by itself. */
const prefersManualLoad = (): boolean => {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  return connection?.saveData === true || /(^|-)2g$/.test(connection?.effectiveType ?? '');
};

type Phase = 'waiting' | 'manual' | 'loading' | 'ready' | 'done';

interface Stage3DProps {
  /** The 3D canvas. Rendered only once the stage decides to load it; call `onReady` when it can draw. */
  readonly children: (onReady: () => void) => ReactNode;
  /** Shown from the first paint until the canvas is drawing: a flat drawing of what the 3D will show. */
  readonly placeholder: ReactNode;
  /** Short caption under the placeholder while the 3D code downloads. */
  readonly loadingLabel: string;
  readonly className?: string;
  /** Positions the placeholder inside the stage when the 3D subject is off-centre. */
  readonly placeholderClassName?: string;
}

/**
 * Keeps three.js off the critical path. The page paints and hydrates with a drawn placeholder; the 3D chunk is
 * requested only after the window has loaded, the stage is on screen and the main thread has gone idle.
 */
export function Stage3D({ children, placeholder, loadingLabel, className = '', placeholderClassName = 'inset-0' }: Stage3DProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('waiting');

  useEffect(() => {
    if (prefersManualLoad()) {
      setPhase('manual');
      return;
    }
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const load = (): void => setPhase((current) => (current === 'waiting' ? 'loading' : current));
    const whenIdle = (): void => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
      else timer = setTimeout(load, NO_IDLE_API_DELAY_MS);
    };
    const whenVisible = (): void => {
      const node = stage.current;
      if (!node || typeof IntersectionObserver !== 'function') return whenIdle();
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        whenIdle();
      });
      observer.observe(node);
    };
    if (document.readyState === 'complete') whenVisible();
    else window.addEventListener('load', whenVisible, { once: true });
    return () => {
      window.removeEventListener('load', whenVisible);
      observer?.disconnect();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  // The placeholder fades out over the first frames of the canvas, then leaves the page.
  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = setTimeout(() => setPhase('done'), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const onReady = useCallback(() => setPhase((current) => (current === 'loading' ? 'ready' : current)), []);
  const armed = phase === 'loading' || phase === 'ready' || phase === 'done';

  return (
    <div ref={stage} className={`absolute inset-0 ${className}`}>
      {phase === 'done' ? null : (
        <div
          className={`absolute ${placeholderClassName} flex flex-col items-center justify-center gap-3 transition-opacity ${phase === 'ready' ? 'opacity-0' : 'opacity-100'}`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          aria-hidden={phase !== 'manual'}
        >
          {placeholder}
          {phase === 'manual' ? (
            <button type="button" onClick={() => setPhase('loading')} className="rr-btn rr-btn-secondary !min-h-11 !rounded-xl !text-xs">
              Load the 3D view
            </button>
          ) : (
            <span className={`rr-label ${phase === 'loading' ? 'rr-blink' : ''}`}>{phase === 'loading' ? loadingLabel : '3D view'}</span>
          )}
        </div>
      )}
      {armed ? <div className="absolute inset-0">{children(onReady)}</div> : null}
    </div>
  );
}
