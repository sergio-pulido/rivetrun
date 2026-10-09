'use client';

import type { Build, Slot } from '@rivetrun/contracts';

/** 3.7 V per lithium cell (docs/GAMEPLAY_V2.md §2). */
const CELL_VOLTS = 3.7;

type TuneKey = 'batteryCells' | 'wheelSizeMm' | 'gearStep';

interface Option {
  readonly value: number;
  readonly label: string;
  readonly note: string;
}

interface Dial {
  readonly key: TuneKey;
  readonly title: string;
  /** What moving it trades. */
  readonly hint: string;
  readonly options: readonly Option[];
}

/** One tuning dial per core slot: drive → wheel size, motor → gearing, battery → cells. */
const DIALS: Readonly<Partial<Record<Slot, Dial>>> = {
  locomotion: {
    key: 'wheelSizeMm',
    title: 'Wheel size',
    hint: 'Bigger: faster per turn and more clearance, less pull, more mass.',
    options: [
      { value: 60, label: 'S', note: '60 mm' },
      { value: 80, label: 'M', note: '80 mm' },
      { value: 100, label: 'L', note: '100 mm' },
    ],
  },
  motor: {
    key: 'gearStep',
    title: 'Gearing',
    hint: '1 is geared for speed, 5 for torque.',
    options: [1, 2, 3, 4, 5].map((step) => ({ value: step, label: `${step}`, note: step === 1 ? 'speed' : step === 5 ? 'torque' : '' })),
  },
  battery: {
    key: 'batteryCells',
    title: 'Cells',
    hint: 'More cells: more voltage, power and capacity, and more mass and cost.',
    options: [1, 2, 3, 4].map((cells) => ({ value: cells, label: `${cells}S`, note: `${(cells * CELL_VOLTS).toFixed(1)} V` })),
  },
};

/** The build with one dial set, or back at stock when `value` is undefined. Never mutates the input. */
export function withTuning(build: Build, key: TuneKey, value: number | undefined): Build {
  const { [key]: _stock, ...rest } = build;
  return value === undefined ? rest : ({ ...rest, [key]: value } as Build);
}

interface TuningProps {
  readonly slot: Slot;
  readonly build: Build;
  readonly onChange: (build: Build) => void;
}

/** The v2 dial for the open slot. Stock = the part as it comes; the sim treats an unset dial as stock. */
export function Tuning({ slot, build, onChange }: TuningProps) {
  const dial = DIALS[slot];
  if (!dial) return null;
  const current = build[dial.key];
  return (
    <section className="rr-card flex flex-col gap-2 p-3" aria-label={dial.title}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold leading-none">{dial.title}</h2>
        <button
          type="button"
          aria-pressed={current === undefined}
          onClick={() => onChange(withTuning(build, dial.key, undefined))}
          className={`rounded-md border px-2 py-1 font-mono text-[10px] font-medium tracking-[1px] ${
            current === undefined ? 'border-cyan-line bg-cyan-deep text-cyan-soft' : 'border-line-3 text-muted'
          }`}
        >
          STOCK
        </button>
      </div>
      <div className="flex gap-1.5" role="group" aria-label={`${dial.title} options`}>
        {dial.options.map((option) => {
          const on = option.value === current;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(withTuning(build, dial.key, option.value))}
              className={`flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-[10px] border transition-colors ${
                on ? 'border-orange bg-orange-deep text-orange-soft' : 'border-line-2 bg-panel-2 text-text-2'
              }`}
            >
              <span className="font-display text-[15px] font-semibold leading-none">{option.label}</span>
              <span className="mt-1 h-2.5 font-mono text-[9px] leading-none text-muted">{option.note}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-snug text-muted">{dial.hint}</p>
    </section>
  );
}
