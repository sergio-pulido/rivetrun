'use client';

import type { Build, Mission, Part, Slot } from '@rivetrun/contracts';
import { buildIssues, compileTrack, PARTS, PRESETS, TUNING } from '@rivetrun/sim';
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
  const parts = PARTS.filter((part) => [build.locomotion, build.motor, build.battery, ...build.sensors, ...build.extras].includes(part.id));
  const cost = parts.reduce((sum, part) => sum + part.costEur, 0);
  const mass = parts.reduce((sum, part) => sum + part.massKg, 0);
  const budget = TUNING.defaultBudgetEur;
  const over = cost > budget;
  // The player drives, so warnings about what the AI can sense do not apply here.
  const warnings = [...buildIssues(build), ...missionWarnings(mission, build).filter((line) => !line.includes('the AI'))];
  const set = (next: Build): void => onChange(next, false);
  const toggle = (list: readonly string[], id: string, max: number): string[] =>
    list.includes(id) ? list.filter((item) => item !== id) : list.length < max ? [...list, id] : [...list];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-3 py-3">
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

      <div className="flex items-center justify-between font-mono text-xs">
        <span className={over ? 'font-bold text-bad' : 'text-slate-200'}>
          €{cost} of €{budget}
          {over ? ' · over budget' : ''}
        </span>
        <span className="text-dim">{mass.toFixed(1)} kg</span>
      </div>
      {warnings.length > 0 ? (
        <ul className="rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-[13px] text-amber-100">
          {warnings.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        disabled={over}
        aria-pressed={ready}
        onClick={() => onChange(build, !ready)}
        className={`rr-btn mt-auto text-lg ${ready ? 'rr-btn-secondary' : 'rr-btn-primary'}`}
      >
        {over ? 'Over budget: remove a part' : ready ? 'Ready ✓ · tap to keep building' : 'Ready'}
      </button>
      <p className="text-center font-mono text-[11px] text-dim">The race starts when everyone is ready or the timer runs out.</p>
    </main>
  );
}
