'use client';

import { useRef, useState } from 'react';
import { BRIEFING_MAX_CHARS, BRIEFING_PRESETS } from '@rivetrun/contracts';
import { useBuildStore } from '@/state/build';

const CUSTOM = 'custom';

/** The preset whose text is the briefing, 'custom' for any other text, null for no briefing. */
export function briefingKind(briefing: string): string | null {
  const text = briefing.trim();
  if (!text) return null;
  return BRIEFING_PRESETS.find((preset) => preset.text === text)?.id ?? CUSTOM;
}

/** Short name of a briefing for tables: the preset name, or the player's own words in quotes. */
export function briefingName(briefing: string): string | null {
  const kind = briefingKind(briefing);
  if (kind === null) return null;
  return BRIEFING_PRESETS.find((preset) => preset.id === kind)?.name ?? `“${briefing.trim()}”`;
}

/** "Brief your brain": three ready-made orders, or the player's own words (≤140 chars). Only Jev reads them. */
export function BriefTheBrain() {
  const briefing = useBuildStore((store) => store.briefing);
  const setBriefing = useBuildStore((store) => store.setBriefing);
  const [customOpen, setCustomOpen] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const kind = customOpen ? CUSTOM : briefingKind(briefing);
  const chips = [...BRIEFING_PRESETS.map((preset) => ({ id: preset.id as string, name: preset.name as string })), { id: CUSTOM, name: 'Custom' }];

  const pick = (id: string): void => {
    if (id === CUSTOM) {
      setCustomOpen(true);
      field.current?.focus();
      return;
    }
    setCustomOpen(false);
    const preset = BRIEFING_PRESETS.find((candidate) => candidate.id === id);
    // Tapping the active preset again clears the briefing.
    if (preset) setBriefing(kind === id ? '' : preset.text);
  };

  return (
    <section className="rr-card-brain flex flex-col gap-2.5 !rounded-2xl p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold leading-none text-cyan">Brief your brain</h2>
        <span className="text-right text-[11px] leading-tight text-cyan-muted">Jev follows it. The ghosts can&apos;t.</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Briefing presets">
        {chips.map((chip) => {
          const on = chip.id === kind;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(chip.id)}
              className={`h-10 rounded-[10px] border font-display text-[13px] font-semibold transition-colors ${
                on ? 'border-cyan bg-cyan text-on-cyan' : 'border-[#2B4A50] bg-transparent text-cyan-soft'
              }`}
            >
              {chip.name}
            </button>
          );
        })}
      </div>
      <label htmlFor="briefing" className="rr-label !text-cyan-muted">
        In your words
      </label>
      <textarea
        id="briefing"
        ref={field}
        rows={2}
        maxLength={BRIEFING_MAX_CHARS}
        value={briefing}
        onChange={(event) => {
          setCustomOpen(false);
          setBriefing(event.target.value);
        }}
        placeholder="No briefing: Jev follows the priority slider."
        className="resize-none rounded-[10px] border border-[#2B4A50] bg-[#081214] px-3 py-2.5 text-[15px] leading-snug outline-none placeholder:text-cyan-muted/60 focus:border-cyan"
      />
      <span className="self-end font-mono text-[10px] text-cyan-muted">
        {briefing.length} / {BRIEFING_MAX_CHARS}
      </span>
    </section>
  );
}
