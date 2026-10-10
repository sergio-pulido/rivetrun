'use client';

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Build, GhostTrace } from '@rivetrun/contracts';
import type { DriveInput } from '../drive/driveInput';
import { JEV_IS_TOLD, JEV_IS_TOLD_LONG } from '../hud/BrainHud';
import { ACTION_LABEL, POLICY_LABEL, UI } from '../palette';
import type { RunFeed } from '../runFeed';
import { pedalsOf, readingsOf, type Pedals, type Reading, type ReadingTone } from './readings';
import styles from './telemetry.module.css';
import { liveThread, threadAt, threadKey, type ThreadEntry } from './thread';

/** Live values repaint this often. The scene keeps its own frame rate: nothing here runs per frame. */
const REPAINT_MS = 200;

const TONE_COLOR: Readonly<Record<ReadingTone, string>> = { plain: UI.text, warn: UI.warn, bad: UI.bad, none: '#6f7883' };

const NO_GHOSTS: readonly GhostTrace[] = [];

const level = (value: boolean | number): number => (typeof value === 'number' ? value : value ? 1 : 0);

/** The TELEMETRY button on the run HUD. */
export function TelemetryButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={open ? 'Close telemetry' : 'Open telemetry'}
      className="pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-mono text-[10px] font-semibold leading-none tracking-[1.5px]"
      style={{ border: `1px solid ${open ? UI.cyan : UI.line}`, background: open ? 'rgb(8 24 27 / 0.92)' : 'rgb(14 16 19 / 0.82)', color: open ? UI.cyan : UI.text }}
    >
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1 6h2.6l1.6-4.4L8 10.4 10 4l1.2 2H15" />
      </svg>
      TELEMETRY
    </button>
  );
}

function ReadingRow({ reading }: { reading: Reading }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 font-mono" style={reading.wide ? { gridColumn: '1 / -1' } : undefined}>
      <span className="truncate text-[0.82em] tracking-[0.5px]" style={{ color: UI.dim }}>
        {reading.label}
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums" style={{ color: TONE_COLOR[reading.tone], fontStyle: reading.tone === 'none' ? 'italic' : 'normal' }}>
        {reading.value}
        {reading.note && <span style={{ color: reading.tone === 'plain' ? UI.dim : TONE_COLOR[reading.tone] }}> · {reading.note}</span>}
      </span>
    </div>
  );
}

const SECTION: CSSProperties = { color: UI.dim, letterSpacing: 1.5 };

function Entry({ entry, open, onToggle }: { entry: ThreadEntry; open: boolean; onToggle: (id: string) => void }) {
  const d = entry.decision;
  const share = d ? d.options.find((option) => option.action === d.choice)?.probability : undefined;
  return (
    <li className="list-none" style={{ borderBottom: `1px solid ${UI.line}` }}>
      <button type="button" onClick={() => onToggle(entry.id)} aria-expanded={open} className="block w-full py-1.5 text-left font-mono" style={{ minHeight: 44 }}>
        <span className="block" style={{ color: UI.cyanText }}>
          <span className="tabular-nums" style={{ color: UI.dim }}>
            {entry.t.toFixed(1)} s ·{' '}
          </span>
          {entry.label}
        </span>
        <span className="block" style={{ color: d ? (d.fallback ? UI.warn : UI.text) : UI.cyan }}>
          {d ? (
            <>
              → {ACTION_LABEL[d.choice].toLowerCase()}
              {share === undefined ? '' : ` (${Math.round(share * 100)} %)`} · <span className="tabular-nums">{Math.round(d.latencyMs)} ms</span>
              {d.fallback ? ' · fallback' : ''}
            </>
          ) : (
            'thinking…'
          )}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 pb-2 font-mono text-[0.92em]">
          {entry.knew.length > 0 && (
            <div>
              <div className="text-[0.85em]" style={SECTION}>
                KNEW
              </div>
              {entry.knew.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
          {entry.unknown.length > 0 && (
            <div>
              <div className="text-[0.85em]" style={SECTION}>
                COULD NOT KNOW
              </div>
              {entry.unknown.map((line) => (
                <div key={line} style={{ color: UI.dim }}>
                  {line}
                </div>
              ))}
            </div>
          )}
          {d && (
            <div>
              <div className="text-[0.85em]" style={SECTION}>
                OPTIONS
              </div>
              {d.options.map((option) => {
                const chosen = option.action === d.choice;
                return (
                  <div key={option.action} className="relative flex items-center justify-between gap-2 px-1.5 py-[2px]" style={{ color: chosen ? UI.cyanText : UI.text }}>
                    <span className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${Math.round(option.probability * 100)}%`, background: chosen ? 'rgb(63 208 224 / 0.3)' : 'rgb(237 239 242 / 0.1)' }} />
                    <span className="relative truncate">
                      {chosen ? '▸ ' : ''}
                      {ACTION_LABEL[option.action].toLowerCase()}
                    </span>
                    <span className="relative shrink-0 tabular-nums" style={{ color: chosen ? UI.cyanText : UI.dim }}>
                      {option.progressM >= 0 ? '+' : ''}
                      {option.progressM.toFixed(1)} m
                      {option.projectedFinishPct === undefined ? '' : ` · finish ${Math.round(option.projectedFinishPct)} %`} · <span style={{ color: chosen ? UI.cyan : UI.text }}>{Math.round(option.probability * 100)} %</span>
                    </span>
                  </div>
                );
              })}
              <div className="mt-1 text-[0.9em]" style={{ color: UI.dim }}>
                {POLICY_LABEL[d.policy]}
                {d.fallback ? ' (fallback)' : ''} · applied at {d.appliedT.toFixed(1)} s · {d.lostM.toFixed(1)} m covered while thinking
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** A brain's thread, newest on top. Stays at the top as entries arrive unless the reader scrolled down. */
export const BrainThread = memo(function BrainThread({ entries, empty }: { entries: readonly ThreadEntry[]; empty: string }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const toggle = useMemo(
    () => (id: string) =>
      setOpen((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  useEffect(() => {
    const node = scroller.current;
    if (node && node.scrollTop < 48) node.scrollTop = 0;
  }, [entries.length]);
  return (
    <div ref={scroller} className={`${styles.thread} pointer-events-auto`}>
      {entries.length === 0 ? (
        <p className="m-0 py-2 font-mono" style={{ color: UI.dim }}>
          {empty}
        </p>
      ) : (
        <ol className="m-0 p-0">
          {[...entries].reverse().map((entry) => (
            <Entry key={entry.id} entry={entry} open={open.has(entry.id)} onToggle={toggle} />
          ))}
        </ol>
      )}
    </div>
  );
});

export interface TelemetryDrawerProps {
  feed: RunFeed;
  build: Build;
  /** Drive mode: the player's controls. The thread is then the rival ghost's, on the ghost's clock. */
  drive?: DriveInput;
  ghosts?: readonly GhostTrace[];
  onClose: () => void;
  /** Leave this much room under the drawer (the Drive-mode pedals). */
  bottomPx?: number;
}

/**
 * The telemetry console: the robot's live values (only what its sensors report) and the brain's
 * thread: each sensor event, what was known, the options with their probabilities, the choice and
 * the latency. A bottom sheet in portrait, a side panel in landscape (docs/BRAIN_V3_SENSING.md).
 * Memoised and on its own 5 Hz clock: the HUD around it repaints with every sim frame, this does not.
 */
export const TelemetryDrawer = memo(function TelemetryDrawer({ feed, build, drive, ghosts = NO_GHOSTS, onClose, bottomPx = 0 }: TelemetryDrawerProps) {
  const [, repaint] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => repaint((n) => n + 1), REPAINT_MS);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const view = feed.get();
  const driving = drive !== undefined;
  const rival = driving ? ghosts[0] : undefined;
  const control = view.observation?.control;
  const hands = drive?.peek();
  const pedals: Pedals = control
    ? { throttle: control.throttle, brake: control.brake }
    : hands
      ? { throttle: level(hands.throttle), brake: level(hands.brake) }
      : pedalsOf(view.decision?.decision.selected ?? null);
  const readings = readingsOf({ build, state: view.state, observation: view.observation?.value ?? null, pedals });

  const now = view.state?.t ?? 0;
  const entries = rival ? threadAt(rival.log ?? [], now) : liveThread(view.log, view.pending?.question ?? null);
  const key = threadKey(entries);
  // The thread repaints only when an entry arrives or gets its answer, not five times a second.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const thread = useMemo(() => entries, [key, rival]);
  const who = rival ? POLICY_LABEL[rival.policy] : 'JEV';
  const empty = rival && !rival.log ? `This ${who} ghost carries no decision log.` : 'Nothing yet: an entry appears when a sensor reports something new.';
  const stale = view.observation && !view.observation.live ? `sensor values as of the last decision (${view.observation.t.toFixed(1)} s)` : !view.observation ? 'sensor values arrive with the first decision' : null;

  return (
    <aside
      className={`${styles.drawer} pointer-events-auto text-[11px] leading-[1.45] min-[1700px]:text-[15px]`}
      style={{ '--telemetry-bottom': `${bottomPx}px`, '--telemetry-height': bottomPx > 0 ? '36dvh' : '44dvh' } as CSSProperties}
      aria-label="Telemetry"
    >
      <div className="flex flex-none items-center justify-between pl-3">
        <span className="font-display text-[1.2em] font-bold tracking-[2px]" style={{ color: UI.cyan }}>
          TELEMETRY
        </span>
        <button type="button" onClick={onClose} aria-label="Close telemetry" className="flex h-9 w-11 items-center justify-center" style={{ color: UI.dim }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M2 2l10 10M12 2 2 12" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        <section className={styles.robot} aria-label="Your robot, live">
          <div className="mb-1 font-mono text-[0.85em]" style={SECTION}>
            {driving ? 'YOUR ROBOT' : 'ROBOT · JEV DRIVING'} · LIVE
          </div>
          <div className={styles.grid}>
            {readings.map((reading) => (
              <ReadingRow key={reading.key} reading={reading} />
            ))}
          </div>
          {stale && (
            <div className="mt-1 font-mono text-[0.82em]" style={{ color: '#6f7883' }}>
              {stale}
            </div>
          )}
        </section>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-none px-3 pt-1.5 font-mono text-[0.85em]" style={SECTION}>
            {who}&apos;S THREAD · {rival ? "GHOST'S CLOCK" : 'LIVE'}
          </div>
          {/* What the percentages in the thread mean, said once (Q20). Only Jev is told the rules' verdict this way. */}
          {who === 'JEV' && (
            <p className="m-0 flex-none px-3 pt-1 text-[0.9em] leading-snug" style={{ color: UI.dim }}>
              {/* The bottom sheet on a phone has room for the short form only; the side panel takes the long one. */}
              <span className="landscape:hidden">{JEV_IS_TOLD}</span>
              <span className="hidden landscape:inline">{JEV_IS_TOLD_LONG}</span>
            </p>
          )}
          <BrainThread entries={thread} empty={empty} />
        </div>
      </div>
    </aside>
  );
});
