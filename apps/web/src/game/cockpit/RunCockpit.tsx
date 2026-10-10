'use client';

import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Build, GhostTrace, SimState } from '@rivetrun/contracts';
import type { DriveInput } from '../drive/driveInput';
import { BrainHud, JEV_IS_TOLD, JEV_IS_TOLD_LONG } from '../hud/BrainHud';
import { StrategyChip } from '../hud/StrategyChip';
import type { PilotTag } from '../hud/strategy';
import { DNF_LABEL, POLICY_LABEL, UI } from '../palette';
import type { RunFeed } from '../runFeed';
import { BrainThread } from '../telemetry/TelemetryDrawer';
import { pedalsOf, readingsOf, type Pedals, type Reading } from '../telemetry/readings';
import { liveThread, threadAt, threadKey } from '../telemetry/thread';
import { rankRacers, type Racer, type Standing } from './standings';
import { thinkingCost } from './thinkingCost';

// RR-COCKPIT: on a desktop or a projector (1280 px and wider) the run view is three columns. The brain is on the
// left, the track in the middle with nothing over the robot, the robot's values and the race on the right.
// Both side columns repaint on their own 5 Hz clock, not with every sim frame.

const REPAINT_MS = 200;
const NO_GHOSTS: readonly GhostTrace[] = [];
/** Readings that describe the robot itself; every other reading is a sensor slot. */
const ROBOT_KEYS: ReadonlySet<string> = new Set(['speed', 'pedals', 'battery', 'draw']);
const TONE: Readonly<Record<Reading['tone'], string>> = { plain: UI.text, warn: UI.warn, bad: UI.bad, none: '#6f7883' };
const COLUMN: CSSProperties = { background: '#0d1116', color: UI.text };
const level = (value: boolean | number): number => (typeof value === 'number' ? value : value ? 1 : 0);

function useRepaint(): void {
  const [, repaint] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => repaint((n) => n + 1), REPAINT_MS);
    return () => window.clearInterval(id);
  }, []);
}

function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 font-mono text-[14px] leading-[18px]" style={{ color: UI.dim, letterSpacing: 1.5 }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

/** A value row: the label at reading size, the number large enough for the back of a room. */
function Row({ label, value, note, color = UI.text, italic = false }: { label: string; value: string; note?: string; color?: string; italic?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 font-mono">
      <span className="min-w-0 truncate text-[14px] leading-[20px]" style={{ color: UI.dim }}>
        {label}
      </span>
      <span className="shrink-0 whitespace-nowrap text-right tabular-nums" style={{ color, fontStyle: italic ? 'italic' : 'normal', fontSize: italic || value.length > 14 ? 15 : 18, lineHeight: '24px' }}>
        {value}
        {note ? <span className="text-[14px]" style={{ color: UI.dim }}> · {note}</span> : null}
      </span>
    </div>
  );
}

/** Where a recorded ghost is at sim time t (frames are in time order; the last one holds). */
function frameAt(trace: GhostTrace, t: number): SimState | undefined {
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

export interface BrainColumnProps {
  feed: RunFeed;
  /** Drive mode: the player decides; the column then shows the rival ghost's thread on the ghost's clock. */
  drive?: DriveInput;
  ghosts?: readonly GhostTrace[];
  pilot?: PilotTag;
  width: number;
}

/** Left column: who drives, what thinking has cost so far, the decision being made, and the thread, newest first. */
export const BrainColumn = memo(function BrainColumn({ feed, drive, ghosts = NO_GHOSTS, pilot, width }: BrainColumnProps) {
  useRepaint();
  const [more, setMore] = useState(false);
  const view = feed.get();
  const driving = drive !== undefined;
  const rival = driving ? ghosts[0] : undefined;
  const now = view.state?.t ?? 0;
  const entries = rival ? threadAt(rival.log ?? [], now) : liveThread(view.log, view.pending?.question ?? null);
  const key = threadKey(entries);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const thread = useMemo(() => entries, [key, rival]);
  const answered = thread.flatMap((entry) => (entry.decision ? [entry.decision] : []));
  const cost = thinkingCost(answered);
  const who = rival ? POLICY_LABEL[rival.policy] : (pilot?.agent.toUpperCase() ?? 'JEV');
  const thinking = !driving && view.pending !== null;
  const status = driving ? 'YOU DRIVE' : thinking ? `${who} IS THINKING` : view.done ? `${who} · RUN OVER` : `${who} · LIVE`;
  const empty = rival && !rival.log ? `This ${who} ghost carries no decision log.` : 'Nothing yet: an entry appears when a sensor reports something new.';
  // A short screen keeps the thread in view: fewer option rows in the current decision, and no briefing row.
  const tall = typeof window === 'undefined' ? 1080 : window.innerHeight;
  const rows = tall < 800 ? 3 : tall < 1000 ? 4 : 6;

  return (
    <aside className="pointer-events-auto absolute inset-y-0 left-0 flex select-none flex-col" style={{ ...COLUMN, width, borderRight: '1px solid #1f5a63' }} aria-label="Brain">
      <div className="flex-none px-4 pb-2 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[22px] font-bold leading-none tracking-[2px]" style={{ color: UI.cyan }}>
            BRAIN
          </span>
          <span className="truncate font-mono text-[14px] font-semibold leading-none" style={{ color: thinking ? UI.cyan : UI.cyanText, letterSpacing: 1 }}>
            {status}
          </span>
        </div>
        {pilot && !driving ? (
          <div className="mt-2 flex">
            <StrategyChip {...pilot} size="screen" />
          </div>
        ) : null}
      </div>

      <div className="flex-none px-4 pb-3" style={{ borderBottom: '1px solid #232932' }}>
        <Title>{rival ? `${who} GHOST · THINKING COST` : 'THINKING COST'}</Title>
        <div className="mt-1 flex items-baseline gap-3 font-mono">
          <span className="flex-none whitespace-nowrap text-[26px] font-semibold leading-none tabular-nums" style={{ color: UI.text }}>
            {cost.metres > 0 && cost.metres < 0.05 ? '<0.1' : cost.metres.toFixed(1)} m
          </span>
          <span className="text-[14px] leading-[18px]" style={{ color: UI.dim }}>
            driven blind · <span style={{ color: UI.text }}>{cost.decisions}</span> decisions
            {cost.late > 0 ? <span style={{ color: UI.warn }}> · {cost.late} late</span> : null}
          </span>
        </div>
      </div>

      {!driving && (
        // The panel is drawn at phone size and enlarged as a whole: 12 px text reads as 14 px and above.
        <div className="flex-none" style={{ zoom: width < 340 ? 1.17 : 1.2, borderBottom: '1px solid #232932' }}>
          <BrainHud pending={view.pending} last={view.decision} decisionCount={view.decisionCount} rows={rows} frame="plain" explain={false} footer={tall >= 900} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col text-[14px] leading-[1.45]">
        <div className="flex-none px-3 pt-2">
          <Title>
            {who}&apos;S THREAD · {rival ? "GHOST'S CLOCK" : 'LIVE'}
          </Title>
        </div>
        <BrainThread entries={thread} empty={empty} cost />
      </div>

      {!driving && (
        <div className="relative flex-none px-4 py-2 text-[14px] leading-[18px]" style={{ borderTop: '1px solid #232932', color: UI.dim }}>
          {more && (
            <p className="absolute inset-x-3 bottom-full m-0 rounded-xl p-3 text-[14px] leading-[19px]" style={{ background: '#161c22', border: '1px solid #1f5a63', color: UI.text }}>
              {JEV_IS_TOLD_LONG}
            </p>
          )}
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 truncate" title={JEV_IS_TOLD}>
              {JEV_IS_TOLD}
            </span>
            <button type="button" onClick={() => setMore((open) => !open)} aria-expanded={more} aria-label="What the percentages mean" className="flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[14px] font-semibold" style={{ border: `1px solid ${UI.cyan}`, color: UI.cyan }}>
              i
            </button>
          </div>
        </div>
      )}
    </aside>
  );
});

/** Live order of a race: rank, name, the agent and strategy chip when there is one, gap to the leader, damage. */
export function RaceStandings({ racers }: { racers: readonly Racer[] }) {
  const rows: readonly Standing[] = rankRacers(racers);
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {rows.map((row) => (
        <li key={row.id} className="rounded-lg px-2.5 py-1.5 font-mono" style={{ background: row.me ? 'rgb(255 122 26 / 0.12)' : '#161c22', border: `1px solid ${row.me ? UI.safety : UI.line}` }}>
          <div className="flex items-baseline gap-2">
            <span className="w-5 flex-none text-[18px] font-semibold leading-[24px] tabular-nums" style={{ color: UI.dim }}>
              {row.rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[24px]" style={{ color: row.tint ?? (row.me ? UI.safetyHi : UI.text) }}>
              {row.name}
            </span>
            <span className="flex-none text-[18px] leading-[24px] tabular-nums" style={{ color: row.out ? UI.bad : UI.text }}>
              {row.gap}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pl-7">
            <span className="min-w-0">{row.pilot ? <StrategyChip {...row.pilot} tint={row.tint} /> : null}</span>
            <span className="flex-none text-[14px] leading-[18px] tabular-nums" style={{ color: row.damagePct >= 50 ? UI.warn : UI.dim }}>
              damage {Math.round(row.damagePct)} %
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface RobotColumnProps {
  feed: RunFeed;
  build: Build;
  drive?: DriveInput;
  ghosts?: readonly GhostTrace[];
  pilot?: PilotTag;
  width: number;
}

/** Right column: the robot's own numbers, one row per sensor slot (live value or "no sensor"), and the race. */
export const RobotColumn = memo(function RobotColumn({ feed, build, drive, ghosts = NO_GHOSTS, pilot, width }: RobotColumnProps) {
  useRepaint();
  const view = feed.get();
  const driving = drive !== undefined;
  const control = view.observation?.control;
  const hands = drive?.peek();
  const pedals: Pedals = control ? { throttle: control.throttle, brake: control.brake } : hands ? { throttle: level(hands.throttle), brake: level(hands.brake) } : pedalsOf(view.decision?.decision.selected ?? null);
  const readings = readingsOf({ build, state: view.state, observation: view.observation?.value ?? null, pedals });
  const robot = readings.filter((reading) => ROBOT_KEYS.has(reading.key));
  const senses = readings.filter((reading) => !ROBOT_KEYS.has(reading.key));
  const state = view.state;
  const t = state?.t ?? 0;
  const hit = view.lastDamage;
  // The cause of the latest damage, in the sim's words: the obstacle, rough ground taken too fast, or the kind of damage.
  const hitBy = hit ? (hit.obstacle ?? (hit.roughEntry ? `rough ${hit.roughEntry}` : hit.cause.replace('_', ' '))) : null;

  const me: Racer = {
    id: 'me',
    name: driving ? POLICY_LABEL.human : (pilot?.agent ?? POLICY_LABEL.jev),
    me: true,
    xM: state?.x ?? 0,
    damagePct: state?.damage ?? 0,
    finishedS: view.done && !view.dnfReason ? view.outcome?.timeS : undefined,
    out: view.dnfReason ? DNF_LABEL[view.dnfReason].toUpperCase() : undefined,
    pilot: driving ? undefined : pilot,
  };
  const others: Racer[] = ghosts.flatMap((trace) => {
    const frame = frameAt(trace, t);
    const last = trace.frames[trace.frames.length - 1];
    if (!frame || !last) return [];
    const ended = t >= last.t;
    return [
      {
        id: `ghost-${trace.policy}`,
        name: `${POLICY_LABEL[trace.policy]} ghost`,
        xM: frame.x,
        damagePct: frame.damage,
        finishedS: ended && trace.outcome.finished ? trace.outcome.timeS : undefined,
        out: ended && !trace.outcome.finished ? (trace.outcome.dnfReason ? DNF_LABEL[trace.outcome.dnfReason] : 'DNF').toUpperCase() : undefined,
      },
    ];
  });

  return (
    <aside className="pointer-events-auto absolute inset-y-0 right-0 flex select-none flex-col gap-4 overflow-y-auto px-4 py-4" style={{ ...COLUMN, width, borderLeft: '1px solid #1f5a63', scrollbarWidth: 'thin' }} aria-label="Robot and race">
      <section aria-label="Robot, live">
        <Title>{driving ? 'YOUR ROBOT · LIVE' : 'ROBOT · LIVE'}</Title>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {robot.map((reading) => (
            <Row key={reading.key} label={reading.label} value={reading.value} note={reading.note} color={TONE[reading.tone]} />
          ))}
          <Row label="DAMAGE" value={`${Math.round(state?.damage ?? 0)} %`} note={hit && hitBy ? `last: ${hitBy} −${hit.amountPct.toFixed(0)} %` : undefined} color={(state?.damage ?? 0) >= 50 ? UI.warn : UI.text} />
        </div>
      </section>
      <section aria-label="Sensors">
        <Title>SENSES</Title>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {senses.map((reading) => (
            <Row key={reading.key} label={reading.label} value={reading.value} note={reading.note} color={TONE[reading.tone]} italic={reading.tone === 'none'} />
          ))}
        </div>
      </section>
      <section aria-label="Race">
        <Title>RACE</Title>
        <div className="mt-1.5">
          <RaceStandings racers={[me, ...others]} />
        </div>
      </section>
    </aside>
  );
});
