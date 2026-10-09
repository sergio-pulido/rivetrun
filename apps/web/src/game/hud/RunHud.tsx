'use client';

import type { GhostTrace, Mission } from '@rivetrun/contracts';
import { DNF_LABEL, UI } from '../palette';
import { useRunView, type RunFeed } from '../runFeed';
import { BrainHud } from './BrainHud';
import styles from './hud.module.css';
import { TopBar } from './TopBar';

export interface RunHudProps {
  mission: Mission;
  feed: RunFeed;
  ghosts?: readonly GhostTrace[];
}

/** DOM overlay for the run view: top bar, slow-mo pill + cyan frame, end stamp and the Brain sheet. */
export function RunHud({ mission, feed, ghosts = [] }: RunHudProps) {
  const view = useRunView(feed);
  const thinking = view.pending !== null;
  const dnf = view.dnfReason;

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      <div className={`${styles.frame} absolute inset-0`} style={{ opacity: thinking ? 1 : 0 }} />

      <div className="absolute inset-x-0 top-0 mx-auto max-w-[430px] px-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <TopBar mission={mission} state={view.state} ghosts={ghosts} />
        <div className="mt-2.5 flex justify-center">
          <span className={`${styles.pill} whitespace-nowrap px-3 py-1.5 font-mono text-[10px] leading-none`} style={{ opacity: thinking ? 1 : 0 }}>
            SLOW-MO · JEV IS DECIDING
          </span>
        </div>
      </div>

      {view.done && (
        <div className="absolute inset-x-0 flex justify-center" style={{ top: '24%' }}>
          <div
            className={`${styles.stamp} rounded-xl px-5 py-2.5 text-center`}
            style={{ border: `3px solid ${dnf ? UI.bad : UI.ok}`, color: dnf ? UI.bad : UI.ok, background: 'rgb(14 16 19 / 0.88)' }}
          >
            <div className="font-display text-[30px] font-bold leading-none tracking-[0.15em]">{dnf ? 'DNF' : 'FINISH'}</div>
            <div className="mt-1 font-mono text-[11px] font-semibold uppercase tracking-widest">
              {dnf ? DNF_LABEL[dnf] : `${view.outcome?.timeS.toFixed(1) ?? '–'} s · ${Math.round(view.outcome?.score ?? 0)} pts`}
            </div>
            {view.outcome?.why && (
              <div className="mx-auto mt-1.5 max-w-[240px] text-[12px] leading-snug" style={{ color: UI.text }}>
                {view.outcome.why}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[430px]">
        <BrainHud pending={view.pending} last={view.decision} decisionCount={view.decisionCount} />
      </div>
    </div>
  );
}
