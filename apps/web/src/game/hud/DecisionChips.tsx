'use client';

import type { CSSProperties } from 'react';
import { UI } from '../palette';
import type { DecisionChip, DecisionChipTone } from './decisionChip';

const TONE: Readonly<Record<DecisionChipTone, CSSProperties>> = {
  decision: { border: '1px solid #1f5a63', color: UI.cyanText },
  fallback: { border: `1px solid ${UI.warn}`, color: UI.warn },
  // A Drive-mode hint: shown, not applied.
  hint: { border: '1px dashed #4a525d', color: UI.text },
  blind: { border: `1px solid ${UI.bad}`, color: UI.bad },
};

const SIZE = {
  hud: { font: 10, line: 13, padX: 8, padY: 4, gap: 4, radius: 7 },
  screen: { font: 20, line: 26, padX: 16, padY: 8, gap: 8, radius: 12 },
} as const;

export interface DecisionChipsProps {
  /** Oldest first (as `RunView.chips` and `chipsFromRecords` give them). The newest is drawn on top, brightest. */
  chips: readonly DecisionChip[];
  /** `screen` is the same list at big-screen size. */
  size?: keyof typeof SIZE;
  /** Chips hug this side of their container. */
  align?: 'start' | 'center' | 'end';
}

/** The decision log (the AI showcase): the last decisions as chips. Plain DOM, no canvas, no state. */
export function DecisionChips({ chips, size = 'hud', align = 'start' }: DecisionChipsProps) {
  const s = SIZE[size];
  if (chips.length === 0) return null;
  const newestFirst = [...chips].reverse();
  return (
    <ol className="m-0 flex list-none flex-col p-0" style={{ gap: s.gap, alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center' }} aria-label="Last decisions">
      {newestFirst.map((chip, i) => (
        <li
          key={chip.id}
          className="max-w-full font-mono"
          style={{
            ...TONE[chip.tone],
            background: 'rgb(14 16 19 / 0.82)',
            borderRadius: s.radius,
            padding: `${s.padY}px ${s.padX}px`,
            fontSize: s.font,
            lineHeight: `${s.line}px`,
            opacity: i === 0 ? 1 : i === 1 ? 0.72 : 0.5,
            overflowWrap: 'anywhere',
          }}
        >
          {chip.tone === 'hint' && <span style={{ color: UI.dim }}>HINT · </span>}
          {chip.text}
        </li>
      ))}
    </ol>
  );
}
