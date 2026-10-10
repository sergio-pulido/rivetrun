'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { UI } from '../palette';

export interface RunMenuProps {
  /** Show the word MENU beside the icon (desktop); the icon alone on a phone. */
  labelled?: boolean;
  /**
   * Called when the "Leave the run?" sheet opens (true) and when the player resumes (false). The page that owns the
   * run pauses and resumes its clock here; a room race cannot pause and may ignore it.
   */
  onPauseChange?: (paused: boolean) => void;
  /** Quit to menu. Default: go to Home. A room race passes its own, which leaves the room first. */
  onQuit?: () => void;
}

/**
 * The way out of a run: a Menu button, and Esc on a keyboard. Either opens "Leave the run?" with Resume and
 * Quit to menu. Mount it inside a positioned overlay; the button sits where it is placed, the sheet covers the overlay.
 */
export function RunMenu({ labelled = false, onPauseChange, onQuit }: RunMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const show = useCallback(
    (next: boolean) => {
      setOpen(next);
      onPauseChange?.(next);
    },
    [onPauseChange],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      show(!open);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, show]);
  const quit = (): void => {
    if (onQuit) onQuit();
    else router.push('/');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => show(true)}
        aria-label="Menu"
        aria-haspopup="dialog"
        className="pointer-events-auto flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full font-mono text-[10px] font-semibold leading-none tracking-[1.5px]"
        style={{ minWidth: 44, padding: labelled ? '0 14px' : 0, border: `1px solid ${UI.line}`, background: 'rgb(14 16 19 / 0.82)', color: UI.text }}
      >
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M1 1h14M1 6h14M1 11h14" />
        </svg>
        {labelled ? 'MENU' : null}
      </button>
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: 'rgb(6 8 10 / 0.72)' }} role="dialog" aria-modal="true" aria-labelledby="rr-leave-title">
          <div className="w-full max-w-[340px] rounded-2xl p-5 text-center" style={{ background: '#10151a', border: `2px solid ${UI.cyan}`, color: UI.text }}>
            <h2 id="rr-leave-title" className="m-0 font-display text-[22px] font-bold leading-tight tracking-[1.5px]">
              Leave the run?
            </h2>
            <p className="m-0 mt-2 text-[14px] leading-snug" style={{ color: UI.dim }}>
              Quitting ends this run without a result.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              <button type="button" onClick={() => show(false)} autoFocus className="h-12 rounded-xl font-display text-[16px] font-bold tracking-[1.5px]" style={{ background: UI.safety, color: '#14110d' }}>
                RESUME
              </button>
              <button type="button" onClick={quit} className="h-12 rounded-xl font-display text-[16px] font-bold tracking-[1.5px]" style={{ border: `1px solid ${UI.line}`, background: 'transparent', color: UI.text }}>
                QUIT TO MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
