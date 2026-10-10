'use client';

import { useEffect, useState } from 'react';
import type { Build, Mission } from '@rivetrun/contracts';
import { useBuildStore, type Rival } from '@/state/build';
import { bestFor, bestOnMission, buildKey, personalBestTrace, usePersonalBestsStore } from '@/state/personalBests';
import { Stars } from '@/ui/Stars';
import { bestLine } from './bests';

const RIVALS: readonly { readonly id: Rival; readonly label: string }[] = [
  { id: 'jev', label: 'Race Jev' },
  { id: 'self', label: 'Race your best' },
];

interface PersonalBestCardProps {
  readonly mission: Mission;
  readonly build: Build;
}

/**
 * The replay pull on the Brief: your best with this robot on this mission, the best you have set here with any robot,
 * and (Drive mode) the choice to race Jev or the ghost of your own best run. Nothing until a first run is on record.
 */
export function PersonalBestCard({ mission, build }: PersonalBestCardProps) {
  const bests = usePersonalBestsStore((store) => store.bests);
  const mode = useBuildStore((store) => store.mode);
  const rival = useBuildStore((store) => store.rival);
  const setRival = useBuildStore((store) => store.setRival);
  // The ghost lives in local storage: looked up after mount, and again when the robot or the bests change.
  const [hasGhost, setHasGhost] = useState(false);
  useEffect(() => setHasGhost(personalBestTrace(mission.id, build) !== null), [mission.id, build, bests]);

  const mine = bestFor(bests, mission.id, build);
  const top = bestOnMission(bests, mission.id);
  if (!mine && !top) return null;
  const otherRobot = top && top.buildKey !== buildKey(build) ? top : null;

  return (
    <section className="rr-card flex flex-col gap-2.5 p-3" aria-label="Your best">
      <h3 className="rr-label !text-orange-soft">Your best</h3>
      {mine ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-[11px] leading-tight text-muted">With this robot</span>
            <span className="block font-mono text-[15px] font-semibold tabular-nums">{bestLine(mine)}</span>
          </span>
          {mine.timeS !== null ? <Stars count={mine.stars} size={16} /> : null}
        </div>
      ) : (
        <p className="text-xs leading-snug text-muted">No run with this robot on this mission yet.</p>
      )}
      {otherRobot ? (
        <p className="border-t border-tag pt-2 text-xs leading-snug text-text-2">
          Your best here with any robot: <span className="font-mono font-semibold tabular-nums text-text">{bestLine(otherRobot)}</span> with <span className="font-semibold text-text">{otherRobot.buildName}</span>.
        </p>
      ) : null}

      {mode === 'drive' ? (
        <div className="flex flex-col gap-1.5 border-t border-tag pt-2.5">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Who to race">
            {RIVALS.map((entry) => {
              const disabled = entry.id === 'self' && !hasGhost;
              // Without a stored ghost the run races Jev whatever was chosen: show it that way.
              const on = (hasGhost ? rival : 'jev') === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => setRival(entry.id)}
                  className={`h-11 flex-1 rounded-[10px] border font-display text-[13px] font-semibold transition-colors disabled:opacity-45 ${on ? 'border-orange bg-orange-deep text-orange-soft' : 'border-line-2 bg-panel-2 text-text-2'}`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-snug text-muted">
            {hasGhost ? 'Your best run with this robot is saved on this device as a ghost you can race.' : 'Finish a Drive run with this robot to save its ghost, then race it here.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
