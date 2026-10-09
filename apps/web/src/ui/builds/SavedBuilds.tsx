'use client';

import { useState } from 'react';
import { useBuildStore } from '@/state/build';
import { useSavedBuildsStore } from '@/state/savedBuilds';
import { sameBuild } from '@/ui/buildStats';
import { BuildsSheet } from './BuildsSheet';

interface SavedBuildsProps {
  /** Workshop: always shown, with the save / manage button. Brief: only the picker, and nothing when no build is saved. */
  readonly manage?: boolean;
  readonly className?: string;
}

/** The player's saved builds as a row of chips: tap one to put it on the bench. */
export function SavedBuilds({ manage = false, className = '' }: SavedBuildsProps) {
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const builds = useSavedBuildsStore((store) => store.builds);
  const [open, setOpen] = useState(false);

  if (!manage && builds.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="rr-label shrink-0">My builds</span>
      <ul className="rr-scroll-x flex min-w-0 flex-1 gap-1.5" aria-label="Saved builds">
        {builds.map((saved) => {
          const on = sameBuild(saved.build, build);
          return (
            <li key={saved.id} className="shrink-0 snap-start">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setBuild(saved.build)}
                className={`h-9 max-w-[150px] truncate rounded-[10px] border px-3 font-display text-xs font-semibold transition-colors ${
                  on ? 'border-orange bg-orange-deep text-orange-soft' : 'border-line-2 bg-panel-2 text-text-2'
                }`}
              >
                {saved.name}
              </button>
            </li>
          );
        })}
        {builds.length === 0 ? <li className="flex h-9 items-center text-xs text-faint">none saved yet</li> : null}
      </ul>
      {manage ? (
        <button type="button" onClick={() => setOpen(true)} className="h-9 shrink-0 rounded-[10px] border border-orange px-3 font-mono text-[11px] font-medium tracking-[1px] text-orange-soft active:bg-orange-deep">
          {builds.length === 0 ? 'SAVE' : 'SAVE · EDIT'}
        </button>
      ) : null}
      {open ? <BuildsSheet onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
