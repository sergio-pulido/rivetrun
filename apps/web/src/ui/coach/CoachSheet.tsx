'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PlayMode } from '@/state/build';
import { Icon } from '@/ui/Icon';

type Zone = 'right' | 'left' | 'ghost' | 'panel' | 'ghosts' | 'brief';

interface Mark {
  readonly zone: Zone;
  readonly title: string;
  readonly body: string;
}

/** Three things a first-time player needs, per mode. Drive mode teaches the controls; Jev mode teaches what to watch. */
const MARKS: Readonly<Record<PlayMode, readonly Mark[]>> = {
  drive: [
    { zone: 'right', title: 'Hold the right side to go', body: 'Let go and the robot coasts.' },
    { zone: 'left', title: 'Hold the left side to brake', body: 'Slow down before steps, rocks and water.' },
    { zone: 'ghost', title: 'The ghost is Jev', body: 'The AI drives the same robot on the same track. Beat its time.' },
  ],
  jev: [
    { zone: 'panel', title: 'Watch the Brain panel', body: 'Every decision Jev makes, and what its sensors could and could not tell it.' },
    { zone: 'ghosts', title: 'The ghosts are other brains', body: 'Fixed rules and coin flips drive the same robot on the same track.' },
    { zone: 'brief', title: 'Brief your brain', body: 'On the mission brief, give Jev its orders: Daredevil, Careful, Eco or your own words.' },
  ],
};

const ORANGE = '#FF7A1A';
const CYAN = '#3FD0E0';

/** Where on the run screen each mark points, drawn on a tiny phone. */
const ZONES: Readonly<Record<Zone, ReactNode>> = {
  right: <rect x="23" y="4" width="19" height="64" rx="3" fill={ORANGE} opacity="0.85" />,
  left: <rect x="4" y="4" width="19" height="64" rx="3" fill="#EDEFF2" opacity="0.75" />,
  ghost: (
    <>
      <rect x="9" y="24" width="16" height="8" rx="2" fill={CYAN} opacity="0.45" />
      <circle cx="13" cy="34" r="2.5" fill={CYAN} opacity="0.45" />
      <circle cx="21" cy="34" r="2.5" fill={CYAN} opacity="0.45" />
      <rect x="19" y="38" width="16" height="8" rx="2" fill={ORANGE} />
      <circle cx="23" cy="48" r="2.5" fill={ORANGE} />
      <circle cx="31" cy="48" r="2.5" fill={ORANGE} />
    </>
  ),
  panel: (
    <>
      <rect x="4" y="44" width="38" height="24" rx="3" fill={CYAN} opacity="0.85" />
      <path d="M9 52h20M9 58h28M9 63h14" stroke="#06191C" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  ghosts: (
    <>
      <rect x="7" y="20" width="14" height="7" rx="2" fill="#9AA3AE" opacity="0.6" />
      <rect x="13" y="30" width="14" height="7" rx="2" fill="#9AA3AE" opacity="0.6" />
      <rect x="20" y="40" width="16" height="8" rx="2" fill={ORANGE} />
    </>
  ),
  brief: (
    <>
      <rect x="7" y="22" width="32" height="26" rx="3" fill="none" stroke={CYAN} strokeWidth="2" />
      <rect x="10" y="26" width="6" height="5" rx="1.5" fill={CYAN} />
      <rect x="18" y="26" width="6" height="5" rx="1.5" fill={CYAN} opacity="0.4" />
      <rect x="26" y="26" width="6" height="5" rx="1.5" fill={CYAN} opacity="0.4" />
      <path d="M11 37h24M11 42h16" stroke={CYAN} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

function Phone({ zone }: { readonly zone: Zone }) {
  return (
    <svg viewBox="0 0 46 72" width="46" height="72" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="44" height="70" rx="7" fill="#12161B" stroke="#3A414C" strokeWidth="2" />
      {ZONES[zone]}
    </svg>
  );
}

interface CoachSheetProps {
  readonly mode: PlayMode;
  /** The player is ready: start the run. */
  readonly onStart: () => void;
  /** Closed without starting. Either way the marks do not show again. */
  readonly onClose: () => void;
}

/** First-run coach marks: three, shown once per mode, before the run starts so nothing covers the track. */
export function CoachSheet({ mode, onStart, onClose }: CoachSheetProps) {
  // Rendered on <body>: an animated ancestor would otherwise trap the fixed overlay inside its own box.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Before your first run" className="fixed inset-0 z-50 flex items-end justify-center bg-ground/85 backdrop-blur-sm">
      <div className="rr-rise flex w-full max-w-[430px] flex-col gap-3 rounded-t-[22px] border border-b-0 border-line-2 bg-panel px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center justify-between">
          <h2 className={`font-mono text-[11px] font-medium uppercase tracking-[2px] ${mode === 'drive' ? 'text-orange-soft' : 'text-cyan'}`}>
            First run · {mode === 'drive' ? 'you drive' : 'Jev drives'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rr-iconbtn !h-9 !w-9">
            <Icon name="close" size={16} />
          </button>
        </div>
        <ol className="flex flex-col gap-2.5">
          {MARKS[mode].map((mark, index) => (
            <li key={mark.title} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel-2 p-2.5">
              <Phone zone={mark.zone} />
              <span className="min-w-0">
                <span className="block font-display text-[17px] font-bold leading-tight">
                  <span className="mr-1.5 font-mono text-[11px] font-medium text-muted">{index + 1}</span>
                  {mark.title}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-text-2">{mark.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={onStart} autoFocus className="rr-btn rr-btn-primary !min-h-[58px] !rounded-2xl !text-lg !tracking-[2px]">
          {mode === 'drive' ? 'Start driving' : 'Start'}
          <Icon name="next" size={20} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
