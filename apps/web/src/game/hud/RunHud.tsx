'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Build, GhostTrace, Mission, Obstacle, SimState } from '@rivetrun/contracts';
import { atmosphereOf, weatherOverride, type Atmosphere } from '../atmosphere';
import { isMuted, toggleMute } from '../audio/sfx';
import { DriveControls } from '../drive/DriveControls';
import type { DriveInput } from '../drive/driveInput';
import { useRunHaptics } from '../drive/haptics';
import { DNF_LABEL, POLICY_LABEL, TERRAIN_LOOK, UI } from '../palette';
import { useRunView, type RunFeed, type RunView } from '../runFeed';
import { sensesOf, type Senses } from '../sense';
import { TelemetryButton, TelemetryDrawer } from '../telemetry/TelemetryDrawer';
import { telemetry, useTelemetryOpen } from '../telemetry/telemetryStore';
import { BrainHud } from './BrainHud';
import { DECISION_CHIPS, type DecisionChip } from './decisionChip';
import { DecisionChips } from './DecisionChips';
import { DriveAlerts } from './DriveAlerts';
import { FpsBadge } from './FpsBadge';
import styles from './hud.module.css';
import { TopBar } from './TopBar';

export interface RunHudProps {
  mission: Mission;
  feed: RunFeed;
  ghosts?: readonly GhostTrace[];
  /** Drive mode: the player's controls. Swaps the Brain sheet for the touch controls. */
  drive?: DriveInput;
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
      className={`${styles.topbar} pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center`}
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

/** Where a recorded ghost is at sim time t (frames are in time order; the last one holds). */
function ghostFrameAt(trace: GhostTrace, t: number): SimState | undefined {
  const frames = trace.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

/** Drive mode: how far ahead or behind the rival ghost is right now. Labelled by who actually drove it. */
function RivalChip({ trace, state }: { trace: GhostTrace; state: SimState | null }) {
  const t = state?.t ?? 0;
  const frame = ghostFrameAt(trace, t);
  const last = trace.frames[trace.frames.length - 1];
  if (!frame || !last) return null;
  const jev = trace.policy === 'jev';
  const ended = t >= last.t;
  const gap = frame.x - (state?.x ?? 0);
  const status = !ended
    ? `${Math.abs(gap).toFixed(1)} m ${gap >= 0 ? 'AHEAD' : 'BEHIND'}`
    : trace.outcome.finished
      ? `FINISHED ${trace.outcome.timeS.toFixed(1)} s`
      : (trace.outcome.dnfReason ? DNF_LABEL[trace.outcome.dnfReason] : 'DNF').toUpperCase();
  return (
    <span className="whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] leading-none tracking-[1px]" style={{ border: `1px solid ${jev ? UI.cyan : UI.dim}`, background: 'rgb(8 24 27 / 0.85)', color: UI.cyanText }}>
      <span style={{ color: jev ? UI.cyan : UI.text, fontWeight: 600 }}>{POLICY_LABEL[trace.policy]}</span> {status}
    </span>
  );
}

/** Fell into a gap: what it cost, for a moment. */
function FallToast({ fall }: { fall: { readonly falls: number; readonly at: number } }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const id = window.setTimeout(() => setShown(false), 1800);
    return () => window.clearTimeout(id);
  }, [fall.at]);
  if (!shown) return null;
  return (
    <>
      <span className="rounded-lg px-3 py-2 font-mono text-[12px] font-semibold tracking-[1px]" style={{ border: `2px solid ${UI.bad}`, background: 'rgb(14 16 19 / 0.88)', color: UI.bad }}>
        FELL · +5 s · {fall.falls} of 3
      </span>
    </>
  );
}

const NO_GHOSTS: readonly GhostTrace[] = [];
/** Height of the Drive-mode pedals: the telemetry drawer sits above them so the player can keep driving. */
const PEDALS_PX = 118;
const closeTelemetry = (): void => telemetry.set(false);

const OBSTACLE_NAME: Readonly<Record<Obstacle, string>> = { rock: 'ROCK', log: 'LOG', step: 'STEP' };

/** What the robot just ran into, in the sim's own words: an obstacle, or rough ground taken too fast. */
function ContactToast({ hit }: { hit: NonNullable<RunView['lastDamage']> }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const id = window.setTimeout(() => setShown(false), 1600);
    return () => window.clearTimeout(id);
  }, [hit.at]);
  const what = hit.obstacle ? `HIT ${OBSTACLE_NAME[hit.obstacle]}` : hit.roughEntry ? `TOO FAST ONTO ${TERRAIN_LOOK[hit.roughEntry].label.toUpperCase()}` : null;
  if (!shown || !what || hit.amountPct < 0.5) return null;
  return (
    <>
      <span className="rounded-lg px-3 py-2 font-mono text-[12px] font-semibold tracking-[1px]" style={{ border: `2px solid ${UI.warn}`, background: 'rgb(14 16 19 / 0.88)', color: UI.warn }}>
        {what} · −{hit.amountPct.toFixed(0)}%
      </span>
    </>
  );
}

/** Stopped against an obstacle the robot cannot roll over: stays up for as long as the sim says so. */
function BlockedChip({ kind }: { kind: Obstacle }) {
  return (
    <>
      <span className="rounded-lg px-3 py-2 text-center font-mono text-[12px] font-semibold leading-snug tracking-[1px]" style={{ border: `2px solid ${UI.bad}`, background: 'rgb(14 16 19 / 0.88)', color: UI.bad }}>
        BLOCKED BY {OBSTACLE_NAME[kind]}
        <span className="block text-[10px] font-normal" style={{ color: UI.text }}>
          too tall to roll over
        </span>
      </span>
    </>
  );
}

/** The mission's weather in a few words; GUST lights up while the sim says one is blowing. */
function WeatherChip({ atmosphere, gust }: { atmosphere: Atmosphere; gust: boolean }) {
  if (atmosphere.labels.length === 0) return null;
  return (
    <span className="rounded-[7px] px-2 py-1 font-mono text-[10px] leading-[13px]" style={{ border: `1px solid ${gust ? UI.warn : UI.line}`, background: 'rgb(14 16 19 / 0.82)', color: UI.text }}>
      <span style={{ color: UI.dim }}>WEATHER · </span>
      {gust && <span style={{ color: UI.warn, fontWeight: 600 }}>GUST · </span>}
      {atmosphere.labels.join(' · ')}
    </span>
  );
}

/** What the build senses ahead, or that it senses nothing: the same fact the band on the track shows. */
function SenseChip({ senses }: { senses: Senses }) {
  const color = senses.blind ? UI.bad : UI.cyanText;
  return (
    <span className="rounded-[7px] px-2 py-1 font-mono text-[10px] leading-[13px]" style={{ border: `1px solid ${senses.blind ? UI.bad : '#1f5a63'}`, background: senses.blind ? 'rgb(42 14 12 / 0.88)' : 'rgb(8 24 27 / 0.85)', color }}>
      {senses.blind ? (
        <>
          <span className="font-semibold">BLIND</span> · no forward sensor
        </>
      ) : (
        <>
          <span style={{ color: UI.dim }}>SENSES AHEAD · </span>
          {senses.ranges.map((range) => `${range.label} ${Number.isInteger(range.rangeM) ? range.rangeM : range.rangeM.toFixed(1)} m`).join(' · ')}
        </>
      )}
    </span>
  );
}

const OBSTACLE_WORD: Readonly<Record<Obstacle, string>> = { rock: 'rock', log: 'log', step: 'step' };

/**
 * The decision log for the HUD. A blind build that hits an obstacle gets its chip even when the sim
 * did not label the hit (events older than Brain v3): the sim's own label wins when it is there.
 */
function logChips(chips: readonly DecisionChip[], hit: RunView['lastHit'], senses: Senses | null): readonly DecisionChip[] {
  if (!senses?.blind || !hit || hit.blind) return chips;
  const blind: DecisionChip = { id: `b${hit.t}`, t: hit.t, text: `BLIND · hit ${OBSTACLE_WORD[hit.obstacle]} at ${Math.round(hit.xM)} m: no distance sensor`, tone: 'blind' };
  return [...chips, blind].sort((a, b) => a.t - b.t).slice(-DECISION_CHIPS);
}

/** DOM overlay for the run view: top bar, the decision log, a mark while Jev is thinking, end stamp and the Brain sheet. */
export function RunHud({ mission, feed, ghosts = NO_GHOSTS, drive, build }: RunHudProps) {
  const view = useRunView(feed);
  const driving = drive !== undefined;
  // The run keeps its pace while Jev thinks (Brain v3): a small mark says a question is out. Not in Drive mode: the player decides there.
  const thinking = view.pending !== null && !driving;
  useRunHaptics(feed, driving);
  const dnf = view.dnfReason;
  const telemetryOpen = useTelemetryOpen();
  const drawerOpen = telemetryOpen && build !== undefined && !view.done;
  const senses = useMemo(() => (build ? sensesOf(build, mission.weather) : null), [build, mission.weather]);
  const atmosphere = useMemo(() => atmosphereOf(mission, weatherOverride()), [mission]);
  const chips = useMemo(() => logChips(view.chips, view.lastHit, senses), [view.chips, view.lastHit, senses]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      <Underwater state={view.state} />
      {drive && build ? (
        <div className="pointer-events-auto absolute inset-0">
          <DriveControls drive={drive} feed={feed} build={build} />
        </div>
      ) : null}

      {/* Everything but the pedals keeps clear of the telemetry panel when it stands beside the track (landscape). */}
      <div className={`absolute inset-y-0 left-0 ${drawerOpen ? styles.beside : 'right-0'}`}>
      <div className="absolute inset-x-0 top-0 mx-auto max-w-[430px] px-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <TopBar mission={mission} state={view.state} ghosts={ghosts} />
        <div>
          <FpsBadge />
        </div>
        {/* One row under the top bar: telemetry on the left, the rival or the thinking mark in the middle, sound on the right. */}
        <div className="mt-1.5 flex items-center gap-2">
          {build ? <TelemetryButton open={telemetryOpen} onToggle={telemetry.toggle} /> : <span className="w-11" />}
          <div className="flex min-w-0 flex-1 justify-center">
            {driving && ghosts[0] ? (
              <RivalChip trace={ghosts[0]} state={view.state} />
            ) : (
              <span className={`${styles.pill} whitespace-nowrap px-3 py-1.5 font-mono text-[10px] leading-none`} style={{ opacity: thinking ? 1 : 0 }}>
                JEV IS THINKING
              </span>
            )}
          </div>
          <MuteButton />
        </div>
        {/* The decision log (Brain v3): what the robot senses, then its last three decisions, newest first. */}
        {!view.done && (
          <div className="mt-2 flex flex-col items-start gap-1">
            <WeatherChip atmosphere={atmosphere} gust={view.state?.gust === true} />
            {senses && <SenseChip senses={senses} />}
            {/* With the drawer open the thread has the detail: one chip keeps the track in view. */}
            {/* A driver gets one hint at a time: the alerts below are what to act on. */}
            <DecisionChips chips={telemetryOpen || driving ? chips.slice(-1) : chips} />
          </div>
        )}
      </div>

      {/* One column for everything that needs the driver's eyes: what just happened, then what is coming. */}
      {!view.done && (
        <div className="absolute inset-x-0 flex flex-col items-center gap-1.5 px-3" style={{ top: '33%' }}>
          {view.lastFall ? <FallToast fall={view.lastFall} /> : null}
          {view.state?.blockedBy ? <BlockedChip kind={view.state.blockedBy} /> : view.lastDamage ? <ContactToast hit={view.lastDamage} /> : null}
          {driving && build ? <DriveAlerts mission={mission} build={build} state={view.state} observation={view.observation?.value ?? null} /> : null}
        </div>
      )}

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
        // With the telemetry drawer open the thread replaces the Brain sheet where the two would cover the robot between them.
        <div className={`absolute inset-x-0 bottom-0 mx-auto max-w-[430px] ${drawerOpen ? 'portrait:hidden max-[1239px]:hidden' : ''}`}>
          <BrainHud pending={view.pending} last={view.decision} decisionCount={view.decisionCount} />
        </div>
      )}
      </div>

      {drawerOpen && build ? (
        <TelemetryDrawer feed={feed} build={build} drive={drive} ghosts={ghosts} onClose={closeTelemetry} bottomPx={driving ? PEDALS_PX : 0} />
      ) : null}
    </div>
  );
}
