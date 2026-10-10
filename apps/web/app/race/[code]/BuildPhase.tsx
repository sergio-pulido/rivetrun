'use client';

import type { Build, Mission, Part, Slot } from '@rivetrun/contracts';
import { BUILD_TUNING, buildIssues, compileTrack, PARTS, predictStats, PRESETS, TUNING } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';
import { MAX_EXTRAS, MAX_SENSORS, missionWarnings, sameBuild } from '@/ui/buildStats';

const BY_SLOT = (slot: Slot): readonly Part[] => PARTS.filter((part) => part.slot === slot);
const SHORT_NAME: Readonly<Record<string, string>> = {
  offroad_wheels: 'Off-road',
  motor_light: 'Light',
  motor_torque: 'Torque',
  battery_small: 'Small',
  battery_large: 'Large',
  waterproof_case: 'Sealed case',
  thruster_kit: 'Thrusters',
  piston_jump: 'Piston',
  moisture_probe: 'Moisture',
  scout_drone: 'Drone',
};
const label = (part: Part): string => SHORT_NAME[part.id] ?? part.name;

// Build tuning (docs/GAMEPLAY_V2.md). A build that arrives tuned from the solo Workshop shows its values here,
// so nothing the player cannot see rides into the race.
const CELLS = [1, 2, 3, 4] as const;
const WHEELS = [
  { mm: 60, label: 'S' },
  { mm: 80, label: 'M' },
  // L is the real 90 mm wheel (docs/MK2_BOM.md). Builds saved with the old 100 drive the same and read as L.
  { mm: 90, label: 'L' },
] as const;
const GEARS = [1, 2, 3, 4, 5] as const;
/** The wheel size as this screen offers it: a legacy 100 is the L wheel. */
const wheelOf = (build: Build): number => {
  const mm = build.wheelSizeMm ?? BUILD_TUNING.stockWheelMm;
  return mm === 100 ? 90 : mm;
};
const STOCK = { cells: BUILD_TUNING.stockCells, wheelMm: BUILD_TUNING.stockWheelMm, gear: BUILD_TUNING.stockGear } as const;

interface BuildPhaseProps {
  readonly mission: Mission;
  readonly build: Build;
  readonly ready: boolean;
  /** Whole seconds left in the BUILD phase. */
  readonly secondsLeft: number;
  readonly onChange: (build: Build, ready: boolean) => void;
}

function Choice({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 flex-1 rounded-lg border px-2 text-[13px] font-bold leading-tight disabled:opacity-35 ${
        on ? 'border-safety bg-safety text-slate-deep' : 'border-slate-line bg-slate-deep text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

/** The compact workshop phones show for 45 s before the start: presets, one row per slot, cost and warnings. */
export function BuildPhase({ mission, build, ready, secondsLeft, onChange }: BuildPhaseProps) {
  const world = compileTrack(mission.track);
  // The sim's own numbers: chassis, cells, wheel size and gearing included, the same as the Workshop shows.
  const stats = predictStats(build);
  const cost = stats.costEur;
  const mass = stats.massKg;
  const budget = TUNING.defaultBudgetEur;
  const over = cost > budget;
  // The player drives, so warnings about what the AI can sense do not apply here.
  const warnings = [...buildIssues(build), ...missionWarnings(mission, build).filter((line) => !line.includes('the AI'))];
  const set = (next: Build): void => onChange(next, false);
  const toggle = (list: readonly string[], id: string, max: number): string[] =>
    list.includes(id) ? list.filter((item) => item !== id) : list.length < max ? [...list, id] : [...list];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-3 pb-40 pt-3">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="rr-label text-blueprint">Build phase · {mission.name}</p>
          <h1 className="font-mono text-2xl font-black leading-tight text-safety">Build for this track</h1>
        </div>
        <p className={`shrink-0 font-mono text-4xl font-black tabular-nums ${secondsLeft <= 10 ? 'text-bad' : 'text-slate-100'}`} aria-label={`${secondsLeft} seconds left`}>
          {secondsLeft}
          <span className="text-base text-dim"> s</span>
        </p>
      </header>

      <div className="flex h-7 overflow-hidden rounded-md border border-slate-line" role="img" aria-label="Track terrains in order">
        {world.segments.map((segment) => (
          <div
            key={segment.index}
            className="flex items-center justify-center overflow-hidden font-mono text-[9px] font-bold uppercase text-slate-deep"
            style={{ width: `${((segment.endM - segment.startM) / world.lengthM) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }}
          >
            <span className="truncate px-0.5">{TERRAIN_LOOK[segment.terrain].label}</span>
          </div>
        ))}
      </div>

      <section className="rr-panel flex flex-col gap-2.5 p-3">
        <div>
          <p className="rr-label mb-1.5">One-tap builds</p>
          <div className="flex gap-1.5">
            {Object.values(PRESETS).map((preset) => (
              <Choice key={preset.id} on={sameBuild(build, preset.build)} onClick={() => set(preset.build)}>
                {preset.name}
              </Choice>
            ))}
          </div>
        </div>
        {(['locomotion', 'motor', 'battery'] as const).map((slot) => (
          <div key={slot}>
            <p className="rr-label mb-1.5">{slot}</p>
            <div className="flex gap-1.5">
              {BY_SLOT(slot).map((part) => (
                <Choice key={part.id} on={build[slot] === part.id} onClick={() => set({ ...build, [slot]: part.id })}>
                  {label(part)}
                </Choice>
              ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[4fr_3fr] gap-2">
          <div>
            <p className="rr-label mb-1.5">Cells</p>
            <div className="flex gap-1">
              {CELLS.map((cells) => (
                <Choice key={cells} on={(build.batteryCells ?? STOCK.cells) === cells} onClick={() => set({ ...build, batteryCells: cells })}>
                  {cells}S
                </Choice>
              ))}
            </div>
          </div>
          <div>
            <p className="rr-label mb-1.5">Wheel size</p>
            <div className="flex gap-1">
              {WHEELS.map((wheel) => (
                <Choice key={wheel.mm} on={wheelOf(build) === wheel.mm} onClick={() => set({ ...build, wheelSizeMm: wheel.mm })}>
                  {wheel.label}
                </Choice>
              ))}
            </div>
          </div>
        </div>
        <div>
          <p className="rr-label mb-1.5">Gearing · speed ← → torque</p>
          <div className="flex gap-1">
            {GEARS.map((gear) => (
              <Choice key={gear} on={(build.gearStep ?? STOCK.gear) === gear} onClick={() => set({ ...build, gearStep: gear })}>
                {gear}
              </Choice>
            ))}
          </div>
        </div>
        <div>
          <p className="rr-label mb-1.5">Extras · up to {MAX_EXTRAS}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {BY_SLOT('extra').map((part) => (
              <Choice
                key={part.id}
                on={build.extras.includes(part.id)}
                disabled={!build.extras.includes(part.id) && build.extras.length >= MAX_EXTRAS}
                onClick={() => set({ ...build, extras: toggle(build.extras, part.id, MAX_EXTRAS) })}
              >
                {label(part)}
              </Choice>
            ))}
          </div>
        </div>
        <div>
          <p className="rr-label mb-1.5">Sensors · only an AI driver needs them · up to {MAX_SENSORS}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {BY_SLOT('sensor').map((part) => (
              <Choice
                key={part.id}
                on={build.sensors.includes(part.id)}
                disabled={!build.sensors.includes(part.id) && build.sensors.length >= MAX_SENSORS}
                onClick={() => set({ ...build, sensors: toggle(build.sensors, part.id, MAX_SENSORS) })}
              >
                {label(part)}
              </Choice>
            ))}
          </div>
        </div>
      </section>

      {/* Pinned to the viewport: with a 45 s timer running, the cost and READY must never be below the fold. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-line bg-slate-ink/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {/* The only copy of the build warnings: the first one, always in view above READY. */}
          {warnings[0] ? (
            <p role="status" className="truncate rounded-md border border-warn/50 bg-warn/10 px-2 py-1 text-[12px] text-amber-100">
              ⚠ {warnings[0]}
              {warnings.length > 1 ? ` · +${warnings.length - 1} more` : ''}
            </p>
          ) : null}
          <div className="flex items-center justify-between font-mono text-xs">
            <span className={over ? 'font-bold text-bad' : 'text-slate-200'}>
              €{cost} of €{budget}
              {over ? ' · over budget' : ''}
            </span>
            <span className="text-dim">
              top {stats.topSpeedMps.toFixed(1)} m/s · climbs {Math.round(stats.maxClimbDeg)}° · {mass.toFixed(2)} kg
            </span>
          </div>
          <button
            type="button"
            disabled={over}
            aria-pressed={ready}
            onClick={() => onChange(build, !ready)}
            className={`rr-btn text-lg ${ready ? 'rr-btn-secondary' : 'rr-btn-primary'}`}
          >
            {over ? 'Over budget: remove a part' : ready ? 'Ready ✓ · tap to keep building' : 'Ready'}
            {/* The timer stays in view when the header has scrolled away. */}
            <span className={`ml-2 font-mono text-base tabular-nums ${secondsLeft <= 10 ? 'font-black' : 'font-normal opacity-80'}`}>· {secondsLeft} s</span>
          </button>
        </div>
      </div>
    </main>
  );
}
