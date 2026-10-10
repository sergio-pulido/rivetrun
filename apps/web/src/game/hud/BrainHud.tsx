'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ActionSchema,
  BRIEFING_PRESETS,
  type Action,
  type BrainDecision,
  type BrainQuestion,
  type DecisionTrigger,
  type Perception,
} from '@rivetrun/contracts';
import { TERRAIN_LOOK, UI } from '../palette';
import styles from './hud.module.css';

const TRIGGER_LABEL: Readonly<Record<DecisionTrigger, string>> = {
  start: 'start',
  terrain_ahead: 'terrain ahead',
  terrain_enter: 'new terrain',
  obstacle: 'obstacle',
  slip: 'slip',
  damage: 'damage',
  interval: 'check-in',
  energy: 'energy',
  actuator: 'actuator',
};

/** Brain v3 questions say why they were asked in their own words; older ones only have the trigger kind. */
const triggerText = (question: BrainQuestion): string => question.cause?.label ?? `trigger: ${TRIGGER_LABEL[question.trigger]}`;

/** Actions a build can lack, and the part that unlocks them. */
const LOCKED_BY: Readonly<Partial<Record<Action, string>>> = { deploy_winch: 'needs Winch' };

const DEFAULT_LOOKAHEAD_S = 1.5;

/**
 * What Jev is told (docs/QA.md Q20, docs/ARENA.md): the question names the option the fixed rules rate as
 * correct, so the percentages are how firmly Jev follows that in time, not a judgement of its own.
 */
export const JEV_IS_TOLD = 'Jev is told which option the fixed rules rate as correct. The % is how firmly it follows that.';
export const JEV_IS_TOLD_LONG =
  "The question Jev gets states, for some options, which one the game's fixed rules rate as correct (scan here, slow down before a scan zone, the priority rule). The percentages show how firmly it follows that under its real response time, not a judgement of its own. On facts alone it scores lower: the measured numbers are in docs/ARENA.md.";
/** Option rows the sheet has room for on a phone without covering the robot. */
const MAX_OPTION_ROWS = 6;

type ChipTone = 'known' | 'unknown' | 'drone' | 'alert';

const CHIP_STYLE: Readonly<Record<ChipTone, CSSProperties>> = {
  known: { background: '#1a2027', border: '1px solid transparent', color: UI.text },
  // No sensor for this reading: the Brain is blind here.
  unknown: { background: 'transparent', border: '1px dashed #4a525d', color: UI.dim },
  drone: { background: '#0c1a1d', border: '1px solid #1f5a63', color: UI.cyanText },
  alert: { background: '#2a170a', border: '1px solid #7a3d12', color: UI.safetyHi },
};

function Chip({ tone = 'known', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-[7px] px-2 py-[3px] font-mono text-[11px] leading-[16px]" style={CHIP_STYLE[tone]}>
      {children}
    </span>
  );
}

/** What the Brain perceives. A dashed "?" chip names the sensor the build is missing. */
function Perceived({ perceived }: { perceived: Perception | null }) {
  const p = perceived;
  const ahead = p?.terrainAhead ?? 'unknown';
  const distance = p?.terrainAheadDistanceM ?? 'unknown';
  const obstacle = p ? p.obstacleAheadM : 'unknown';
  const slip = p?.slipPct ?? 'unknown';
  const tilt = p?.tiltDeg ?? 'unknown';
  const depth = p?.depthAheadCm ?? 'unknown';
  const drone = p?.terrainAheadSource === 'scout_drone';

  const known: ReactNode[] = [];
  const blind: ReactNode[] = [];
  if (ahead === 'unknown') {
    blind.push(<Chip key="ahead" tone="unknown">ahead ? · no camera</Chip>);
  } else {
    known.push(
      <Chip key="ahead" tone={drone ? 'drone' : 'known'}>
        <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-baseline" style={{ background: TERRAIN_LOOK[ahead].hud }} />
        ahead {TERRAIN_LOOK[ahead].label.toUpperCase()}
        {drone ? ' (drone)' : ''}
        {distance !== 'unknown' && <span style={{ color: drone ? UI.cyanText : UI.dim }}> · {distance.toFixed(distance < 10 ? 1 : 0)} m</span>}
      </Chip>,
    );
  }
  if (obstacle === 'unknown') blind.push(<Chip key="obstacle" tone="unknown">obstacle ? · no sonar</Chip>);
  else known.push(obstacle === null ? <Chip key="obstacle">obstacle clear</Chip> : <Chip key="obstacle" tone="alert">obstacle {obstacle.toFixed(1)} m</Chip>);
  if (slip === 'unknown' && tilt === 'unknown') {
    blind.push(<Chip key="imu" tone="unknown">slip · slope ? · no IMU</Chip>);
  } else {
    if (slip !== 'unknown') known.push(<Chip key="slip" tone={slip > 25 ? 'alert' : 'known'}>slip {Math.round(slip)}%</Chip>);
    if (tilt !== 'unknown') known.push(<Chip key="slope">slope {Math.round(tilt)}°</Chip>);
  }
  if (depth === 'unknown') blind.push(<Chip key="depth" tone="unknown">depth ? · no probe</Chip>);
  else known.push(<Chip key="depth" tone={depth > 0 ? 'drone' : 'known'}>depth {Math.round(depth)} cm</Chip>);

  return (
    <div className="flex min-h-[52px] flex-wrap content-start gap-1.5">
      {known}
      {blind}
    </div>
  );
}

type RowState = 'chosen' | 'other' | 'thinking' | 'locked';

const ROW_STYLE: Readonly<Record<RowState, { border: string; fill: string; color: string }>> = {
  chosen: { border: `1px solid ${UI.cyan}`, fill: 'rgb(63 208 224 / 0.35)', color: UI.text },
  other: { border: `1px solid ${UI.line}`, fill: 'rgb(154 163 174 / 0.18)', color: '#c9ced6' },
  thinking: { border: `1px solid ${UI.line}`, fill: 'transparent', color: '#c9ced6' },
  locked: { border: '1px dashed #3a414c', fill: 'transparent', color: '#6f7883' },
};

interface OptionRowProps {
  action: Action;
  state: RowState;
  probability: number | null;
  height: number;
  progressM?: number;
  risky?: boolean;
}

function OptionRow({ action, state, probability, height, progressM, risky = false }: OptionRowProps) {
  const look = ROW_STYLE[state];
  const pct = probability === null ? null : Math.round(probability * 100);
  return (
    <div className={`${state === 'chosen' ? styles.chosen : ''} relative overflow-hidden rounded-lg`} style={{ height, background: state === 'locked' ? 'transparent' : '#161c22', border: look.border }}>
      {state === 'thinking' ? (
        <div className={`${styles.shimmer} absolute inset-0`} />
      ) : (
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct ?? 0}%`, background: look.fill, transition: 'width 240ms cubic-bezier(0.2, 0.9, 0.3, 1)' }} />
      )}
      <div className="relative flex h-full items-center justify-between gap-2 px-2.5 font-mono text-[12px] leading-none" style={{ color: look.color }}>
        <span className="truncate">
          {state === 'chosen' ? '▶ ' : ''}
          {action}
          {state === 'locked' && LOCKED_BY[action] ? ` · ${LOCKED_BY[action]}` : ''}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {progressM !== undefined && state !== 'locked' && (
            <span className="flex items-center gap-1 text-[10px] tabular-nums" style={{ color: UI.dim }}>
              {risky && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: UI.safety }} />}
              {progressM >= 0 ? '+' : ''}
              {progressM.toFixed(1)} m
            </span>
          )}
          <span className="w-[34px] text-right font-semibold tabular-nums">{state === 'locked' ? '—' : pct === null ? '··' : `${pct}%`}</span>
        </span>
      </div>
    </div>
  );
}

/** Live counter while Jev has the question. */
function Elapsed({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - since), 50);
    return () => window.clearInterval(id);
  }, [since]);
  return <span className="tabular-nums">{Math.max(0, Math.round(elapsed))} ms</span>;
}

function briefLabel(briefing: string | undefined): string | null {
  const text = briefing?.trim();
  if (!text) return null;
  const preset = BRIEFING_PRESETS.find((candidate) => candidate.text === text);
  return preset ? preset.name : `“${text}”`;
}

export interface BrainHudProps {
  /** The question the brain is answering right now, if any. The run does not wait for it. */
  pending?: { readonly question: BrainQuestion; readonly since: number } | null;
  /** The last answered question and its decision. */
  last?: { readonly question: BrainQuestion; readonly decision: BrainDecision } | null;
  decisionCount?: number;
  /** A short screen (a phone on its side), a corner card or the telemetry panel: the header and the likeliest options only. */
  compact?: boolean;
  /** Option rows shown. Defaults to three when compact, six otherwise. */
  rows?: number;
  /** Where it stands: a bottom sheet (default), a card in a corner, or plain inside another panel. */
  frame?: BrainFrame;
  /** Makes the header a button that folds the panel to one line (BrainLine). */
  onCollapse?: () => void;
  /** The "Jev is told…" line under the options. False where the caller prints it once itself (the desktop cockpit). */
  explain?: boolean;
  /** The last row: the briefing and the decision count. False on a short desktop screen, where the thread needs the room. */
  footer?: boolean;
}

export type BrainFrame = 'sheet' | 'card' | 'plain';

const FRAME_CLASS: Readonly<Record<BrainFrame, string>> = {
  sheet: '',
  card: 'rounded-2xl',
  plain: '',
};
const FRAME_STYLE: Readonly<Record<BrainFrame, CSSProperties>> = {
  sheet: { paddingBottom: 'max(14px, env(safe-area-inset-bottom))' },
  card: { background: 'rgb(16 21 26 / 0.94)', border: '1px solid #1f5a63', paddingBottom: 12 },
  plain: { paddingBottom: 10 },
};

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d={up ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'} />
    </svg>
  );
}

export interface BrainLineProps {
  pending?: BrainHudProps['pending'];
  last?: BrainHudProps['last'];
  frame?: BrainFrame;
  onExpand: () => void;
}

/**
 * The Brain panel folded to one line: who decided, what, how firmly and how fast ("JEV · slow_down 88 % · 211 ms").
 * A fallback still says FALLBACK. Tap to open the panel.
 */
export function BrainLine({ pending = null, last = null, frame = 'sheet', onExpand }: BrainLineProps) {
  const decision = pending ? null : (last?.decision ?? null);
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label="Show the Brain panel"
      className={`${frame === 'sheet' ? styles.sheet : FRAME_CLASS[frame]} pointer-events-auto flex min-h-[44px] w-full items-center gap-2 px-4 text-left font-mono text-[12px] leading-none`}
      style={{ color: UI.dim, ...(frame === 'sheet' ? { paddingBottom: 'env(safe-area-inset-bottom)' } : frame === 'card' ? { background: 'rgb(16 21 26 / 0.94)', border: '1px solid #1f5a63' } : { paddingLeft: 12, paddingRight: 12 }) }}
    >
      <span className="min-w-0 flex-1 truncate">
        {pending ? (
          <span className={styles.pulse} style={{ color: UI.cyan }}>
            JEV · thinking · <Elapsed since={pending.since} />
          </span>
        ) : decision ? (
          <>
            <span style={{ color: decision.fallback ? UI.bad : decision.policy === 'jev' ? UI.cyan : UI.dim, fontWeight: 600 }}>{decision.fallback ? 'FALLBACK' : decision.policy.toUpperCase()}</span>
            {' · '}
            <span style={{ color: UI.text }}>{decision.selected}</span>{' '}
            <span className="tabular-nums" style={{ color: UI.text }}>
              {Math.round((decision.probabilities[decision.selected] ?? 0) * 100)} %
            </span>
            {' · '}
            <span className="tabular-nums">{Math.round(decision.latencyMs)} ms</span>
          </>
        ) : (
          <>
            <span style={{ color: UI.cyan, fontWeight: 600 }}>JEV</span> · standby
          </>
        )}
      </span>
      <span style={{ color: UI.cyan }}>
        <Chevron up />
      </span>
    </button>
  );
}

/** The panel's first row. With `onCollapse` it is a button: tap to fold the panel to one line. */
function Header({ onCollapse, children }: { onCollapse?: () => void; children: ReactNode }) {
  if (!onCollapse) return <div className="flex items-center justify-between gap-2">{children}</div>;
  return (
    <button type="button" onClick={onCollapse} aria-expanded aria-label="Fold the Brain panel" className="pointer-events-auto -my-2 flex min-h-[36px] w-full items-center justify-between gap-2 text-left">
      {children}
      <span style={{ color: UI.cyan }}>
        <Chevron up={false} />
      </span>
    </button>
  );
}

/**
 * The Brain panel (bottom sheet): what the AI perceives, its options with %, the chosen one in cyan,
 * who decided (JEV / FALLBACK), latency, trigger and the active briefing.
 */
export function BrainHud({ pending = null, last = null, decisionCount = 0, compact = false, rows: wantedRows, frame = 'sheet', onCollapse, explain = true, footer = true }: BrainHudProps) {
  const maxRows = wantedRows ?? (compact ? 3 : MAX_OPTION_ROWS);
  const question = pending?.question ?? last?.question ?? null;
  const decision = pending ? null : (last?.decision ?? null);
  const thinking = pending !== null;
  const options: readonly Action[] = question?.options ?? ['cruise', 'accelerate', 'slow_down', 'brake'];
  const locked = question ? ActionSchema.options.filter((action) => !question.options.includes(action) && LOCKED_BY[action]) : [];
  // The sheet keeps its height however many commands a build has (gameplay v3 added three): the chosen
  // option and the likeliest ones get a row, in the question's order; the rest are named in one line.
  const ranked = decision ? [...options].sort((a, b) => (decision.probabilities[b] ?? 0) - (decision.probabilities[a] ?? 0)) : options;
  const kept = new Set(ranked.slice(0, maxRows));
  const shown = options.filter((action) => kept.has(action));
  const folded = options.filter((action) => !kept.has(action));
  const lockedShown = locked.slice(0, Math.max(0, maxRows - shown.length));
  const rows = shown.length + lockedShown.length;
  const rowHeight = rows <= 5 ? 32 : 28;
  const brief = briefLabel(question?.briefing);
  const lookaheadS = question?.lookaheadS ?? DEFAULT_LOOKAHEAD_S;

  return (
    <div className={`${frame === 'sheet' ? styles.sheet : FRAME_CLASS[frame]} flex flex-col gap-2.5 ${frame === 'plain' ? 'px-3 pt-2.5' : 'px-4 pt-3.5'}`} style={{ color: UI.text, ...FRAME_STYLE[frame] }}>
      <Header onCollapse={onCollapse}>
        <span className="font-display text-[16px] font-bold leading-none tracking-[2px]" style={{ color: UI.cyan }}>
          BRAIN
        </span>
        <span className="truncate font-mono text-[11px] leading-none" style={{ color: UI.dim }}>
          {thinking && pending ? (
            <>
              <span className={styles.pulse} style={{ color: UI.cyan }}>
                JEV · <Elapsed since={pending.since} />
              </span>
              {' · '}
              {triggerText(pending.question)}
            </>
          ) : decision && question ? (
            <>
              {decision.fallback ? (
                <span className={styles.pulse} style={{ color: UI.bad, fontWeight: 600 }}>
                  FALLBACK → HEURISTIC
                </span>
              ) : (
                <span style={{ color: decision.policy === 'jev' ? UI.cyanText : UI.dim }}>{decision.policy.toUpperCase()}</span>
              )}
              {' · '}
              <span className="tabular-nums">{Math.round(decision.latencyMs)} ms</span>
              {' · '}
              {triggerText(question)}
            </>
          ) : (
            'standby'
          )}
        </span>
      </Header>

      {!compact && <Perceived perceived={question?.perceived ?? null} />}

      <div className="flex flex-col" style={{ gap: rows <= 5 ? 6 : 5 }}>
        {shown.map((action) => {
          const entry = question?.lookahead.find((candidate) => candidate.action === action);
          const chosen = decision?.selected === action;
          return (
            <OptionRow
              key={action}
              action={action}
              state={thinking ? 'thinking' : chosen ? 'chosen' : 'other'}
              probability={decision ? (decision.probabilities[action] ?? 0) : null}
              height={rowHeight}
              progressM={entry?.progressM}
              risky={(entry?.damagePct ?? 0) > 0.5}
            />
          );
        })}
        {lockedShown.map((action) => (
          <OptionRow key={action} action={action} state="locked" probability={null} height={rowHeight} />
        ))}
        {folded.length > 0 && (
          <span className="truncate px-1 font-mono text-[10px] leading-[13px]" style={{ color: UI.dim }}>
            +{folded.length} more: {folded.join(' · ')}
          </span>
        )}
      </div>

      {!compact && explain && (
        <p className="m-0 text-[11px] leading-[14px]" style={{ color: UI.dim }}>
          {JEV_IS_TOLD}
        </p>
      )}

      {!compact && footer && (
      <div className="flex items-center justify-between gap-3">
        {brief ? (
          <span className="min-w-0 truncate rounded-lg px-2.5 py-1 text-[12px] leading-[16px]" style={{ border: '1px solid #1f5a63', background: '#0c1a1d', color: UI.cyanText }}>
            Brief: {brief}
          </span>
        ) : (
          <span className="rounded-lg px-2.5 py-1 text-[12px] leading-[16px]" style={{ border: '1px dashed #3a414c', color: '#6f7883' }}>
            No briefing
          </span>
        )}
        <span className="shrink-0 font-mono text-[10px] tracking-[1px]" style={{ color: UI.dim }}>
          #{decisionCount + (thinking ? 1 : 0)} · LOOKAHEAD {lookaheadS} s
        </span>
      </div>
      )}
    </div>
  );
}
