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

/** DOM overlay for the run view: top bar, slow-mo vignette, end stamp and the Brain HUD. */
export function RunHud({ mission, feed, ghosts = [] }: RunHudProps) {
  const view = useRunView(feed);
  const thinking = view.pending !== null;
  const dnf = view.dnfReason;

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      <div className={`${styles.vignette} absolute inset-0`} style={{ opacity: thinking ? 1 : 0 }} />

      <div className="absolute inset-x-0 top-0 mx-auto max-w-md px-2.5" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <TopBar mission={mission} state={view.state} ghosts={ghosts} />
        <div className="mt-2 flex justify-center" style={{ opacity: thinking ? 1 : 0, transition: 'opacity 140ms' }}>
          <span className="rounded-full px-3 py-1 font-mono text-[10px] font-bold tracking-[0.2em]" style={{ color: '#0f141b', background: UI.safety }}>
            SLOW-MO ×0.25 · DECIDING
          </span>
        </div>
      </div>

      {view.done && (
        <div className="absolute inset-x-0 flex justify-center" style={{ top: '27%' }}>
          <div
            className={`${styles.stamp} rounded-lg px-5 py-2 text-center font-mono`}
            style={{ border: `4px solid ${dnf ? UI.bad : UI.ok}`, color: dnf ? UI.bad : UI.ok, background: 'rgb(15 20 27 / 0.85)' }}
          >
            <div className="text-[30px] font-black leading-none tracking-[0.15em]">{dnf ? 'DNF' : 'FINISH'}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest">
              {dnf ? DNF_LABEL[dnf] : `${view.outcome?.timeS.toFixed(1) ?? '–'} s · ${Math.round(view.outcome?.score ?? 0)} pts`}
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md px-2.5" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        <BrainHud pending={view.pending} last={view.decision} decisionCount={view.decisionCount} />
      </div>
    </div>
  );
}
