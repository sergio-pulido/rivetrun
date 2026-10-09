'use client';

import { useState } from 'react';
import type { Build, GhostTrace, Mission, SimState } from '@rivetrun/contracts';
import { isMuted, toggleMute } from '../audio/sfx';
import { DriveControls } from '../drive/DriveControls';
import type { DriveInput } from '../drive/driveInput';
import { useRunHaptics } from '../drive/haptics';
import { ACTION_LABEL, DNF_LABEL, UI } from '../palette';
import { useRunView, type RunFeed } from '../runFeed';
import { BrainHud } from './BrainHud';
import styles from './hud.module.css';
import { TopBar } from './TopBar';

export interface RunHudProps {
  mission: Mission;
  feed: RunFeed;
  ghosts?: readonly GhostTrace[];
  /** Drive mode: the player's controls. Swaps the Brain sheet for the touch controls. */
  drive?: DriveInput;
  /** Drive mode: Jev's live run, shown as a gap chip and a marker on the strip. */
  rival?: RunFeed;
  /** Needed in Drive mode: which action-button parts the robot has. */
  build?: Build;
}

/** Sound on / off. The choice persists (sfx.ts keeps it in localStorage). */
function MuteButton() {
  const [muted, setMuted] = useState(() => isMuted());
  return (
    <button
      type="button"
      onClick={() => setMuted(toggleMute())}
      aria-label={muted ? 'Turn sound on' : 'Mute sound'}
      aria-pressed={muted}
      className={`${styles.topbar} pointer-events-auto absolute right-0 top-full mt-1.5 flex h-11 w-11 items-center justify-center`}
      style={{ borderRadius: 22, color: muted ? UI.dim : UI.cyan }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 7.5h2.8L10 4v12l-4.2-3.5H3z" fill="currentColor" fillOpacity="0.25" />
        {muted ? <path d="m13 7.5 4.5 5m0-5-4.5 5" /> : <path d="M13 7.2a4 4 0 0 1 0 5.6m2.3-7.9a7.2 7.2 0 0 1 0 10.2" />}
      </svg>
    </button>
  );
}

const GAUGE_STEP_M = 0.3;
const GAUGE_HEIGHT_PX = 150;

/**
 * Under water (docs/design/v1/RunDeep.dc.html): a blue tint that deepens as the robot goes under,
 * and a depth scale with the robot's own depth marked. Fades out on dry ground and in a wade.
 */
function Underwater({ state }: { state: SimState | null }) {
  const submerged = state?.submergedDepthM ?? 0;
  const column = state?.waterDepthM ?? 0;
  const under = submerged >= 0.1;
  const max = Math.max(1.2, Math.ceil(column / GAUGE_STEP_M) * GAUGE_STEP_M);
  const ticks = Array.from({ length: Math.round(max / GAUGE_STEP_M) + 1 }, (_, i) => i * GAUGE_STEP_M);
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgb(8 50 70 / 0) 8%, rgb(8 50 70 / 0.3) 40%, rgb(4 27 36 / 0.5) 100%)',
          opacity: Math.min(1, submerged / 0.4),
          transition: 'opacity 400ms ease-out',
        }}
      />
      <div
        className="absolute right-3 rounded-xl font-mono"
        style={{
          top: '29%',
          height: GAUGE_HEIGHT_PX + 24,
          width: 58,
          background: 'rgb(6 27 36 / 0.72)',
          border: '1px solid #16404b',
          opacity: under ? 1 : 0,
          transition: 'opacity 300ms ease-out',
        }}
      >
        <div className="absolute right-2.5 w-0.5" style={{ top: 12, height: GAUGE_HEIGHT_PX, background: '#3f6e7a' }} />
        {ticks.map((tick) => (
          <div key={tick} className="absolute right-2.5 flex items-center gap-1" style={{ top: 12 + (tick / max) * GAUGE_HEIGHT_PX - 5 }}>
            <span className="text-[9px] leading-[10px]" style={{ color: '#9fcfd9' }}>
              {tick.toFixed(1)}
            </span>
            <span className="h-0.5 w-2.5" style={{ background: '#3f6e7a' }} />
          </div>
        ))}
        {/* The robot's own depth: tag and pointer sit outside the scale, to its left. */}
        <div
          className="absolute flex items-center gap-1"
          style={{ right: 62, top: 12 + (Math.min(submerged, max) / max) * GAUGE_HEIGHT_PX - 11, transition: 'top 150ms linear' }}
        >
          <span className="whitespace-nowrap rounded-lg px-2 py-1 text-[10px] leading-[12px]" style={{ border: `1px solid ${UI.cyan}`, background: 'rgb(6 27 36 / 0.9)', color: UI.cyanText }}>
            {submerged.toFixed(1)} m
          </span>
          <span style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: `9px solid ${UI.cyan}` }} />
        </div>
      </div>
    </>
  );
}

/** Drive mode: how far ahead or behind Jev is right now, and what it is doing. */
function RivalChip({ rival, meX }: { rival: RunFeed; meX: number }) {
  const view = useRunView(rival);
  if (!view.state) return null;
  const gap = view.state.x - meX;
  const decision = view.decision?.decision;
  const fallback = decision?.fallback === true;
  const status = view.dnfReason ? DNF_LABEL[view.dnfReason].toUpperCase() : view.done ? 'FINISHED' : `${Math.abs(gap).toFixed(1)} m ${gap >= 0 ? 'AHEAD' : 'BEHIND'}`;
  return (
    <span className="whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] leading-none tracking-[1px]" style={{ border: `1px solid ${fallback ? UI.bad : UI.cyan}`, background: 'rgb(8 24 27 / 0.85)', color: UI.cyanText }}>
      <span style={{ color: fallback ? UI.bad : UI.cyan, fontWeight: 600 }}>{fallback ? 'JEV · FALLBACK' : 'JEV'}</span> {status}
      {decision && !view.done ? <span style={{ color: UI.dim }}> · {ACTION_LABEL[decision.selected].toLowerCase()}</span> : null}
    </span>
  );
}

/** DOM overlay for the run view: top bar, slow-mo pill + cyan frame, end stamp and the Brain sheet. */
export function RunHud({ mission, feed, ghosts = [], drive, rival, build }: RunHudProps) {
  const view = useRunView(feed);
  const rivalView = useRunView(rival ?? feed);
  const driving = drive !== undefined;
  // Drive mode has no slow-mo: the player is the one deciding.
  const thinking = view.pending !== null && !driving;
  useRunHaptics(feed, driving);
  const dnf = view.dnfReason;

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      <Underwater state={view.state} />
      <div className={`${styles.frame} absolute inset-0`} style={{ opacity: thinking ? 1 : 0 }} />
      {drive && build ? (
        <div className="pointer-events-auto absolute inset-0">
          <DriveControls drive={drive} feed={feed} build={build} />
        </div>
      ) : null}

      <div className="absolute inset-x-0 top-0 mx-auto max-w-[430px] px-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <div className="relative">
          <TopBar mission={mission} state={view.state} ghosts={ghosts} rivals={rival && rivalView.state ? [{ x: rivalView.state.x, color: UI.cyan }] : []} />
          <MuteButton />
        </div>
        <div className="mt-2.5 flex justify-center">
          {rival ? (
            <RivalChip rival={rival} meX={view.state?.x ?? 0} />
          ) : (
            <span className={`${styles.pill} whitespace-nowrap px-3 py-1.5 font-mono text-[10px] leading-none`} style={{ opacity: thinking ? 1 : 0 }}>
              SLOW-MO · JEV IS DECIDING
            </span>
          )}
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

      {!driving && (
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[430px]">
          <BrainHud pending={view.pending} last={view.decision} decisionCount={view.decisionCount} />
        </div>
      )}
    </div>
  );
}
