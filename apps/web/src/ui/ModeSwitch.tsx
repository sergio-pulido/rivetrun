'use client';

import { useBuildStore, type PlayMode } from '@/state/build';

const MODES: readonly { id: PlayMode; label: string }[] = [
  { id: 'drive', label: 'You drive' },
  { id: 'jev', label: 'Jev drives' },
];

/** What each mode is, in one line. */
export const MODE_NOTE: Readonly<Record<PlayMode, string>> = {
  drive: 'You drive: throttle on the right, brake on the left. A ghost races you on the same robot.',
  jev: 'Jev drives and you brief it. Fixed rules and coin flips race as ghosts.',
};

/** Drive / Jev: who is at the wheel for the next run. Orange is the player, cyan is the brain. */
export function ModeSwitch({ className = '' }: { readonly className?: string }) {
  const mode = useBuildStore((store) => store.mode);
  const setMode = useBuildStore((store) => store.setMode);
  return (
    <div className={`flex gap-1.5 rounded-xl border border-line bg-panel-2 p-1 ${className}`} role="group" aria-label="Who drives">
      {MODES.map((option) => {
        const on = option.id === mode;
        const active = option.id === 'drive' ? 'bg-orange text-on-orange' : 'bg-cyan text-on-cyan';
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => setMode(option.id)}
            className={`h-[38px] flex-1 rounded-[9px] font-display text-[13px] uppercase tracking-[1px] transition-colors ${on ? `font-bold ${active}` : 'font-semibold text-muted'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
