'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { Part, Slot } from '@rivetrun/contracts';
import { PARTS_BY_ID, PRESETS, buildIssues } from '@rivetrun/sim';
import type { RoverPick } from '@/game/robot/pick';
import { useBuildStore } from '@/state/build';
import { isUnlocked, useProgressStore } from '@/state/progress';
import { useWorkshopUi } from '@/state/workshop';
import { SavedBuilds } from '@/ui/builds/SavedBuilds';
import { BUDGET_EUR, buildStats, sameBuild } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { LockedCard, type LockedPart } from '@/ui/real/LockedCard';
import { Shell } from '@/ui/Shell';
import { Bench3D } from '@/ui/three/Bench3D';
import { PartCard } from './PartCard';
import { Predicted } from './Predicted';
import { SLOTS, fitted, partsIn, withPart } from './slots';
import { Tuning } from './Tuning';

const PRESET_LIST = Object.values(PRESETS);
const BAR_COLOR = { speed: 'var(--color-orange)', grip: 'var(--color-pcb)', endurance: '#E3B341', perception: 'var(--color-cyan)' } as const;
const CALLOUT = 'absolute flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-[1px]';
const DOT = 'grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-semibold';

interface WorkshopProps {
  /** Game part id → who makes its real component, from the MK-II bill of materials. */
  readonly makers: Readonly<Record<string, string>>;
  /** Real parts from the bill of materials that the game does not have yet. Shown locked on the shelf they belong to. */
  readonly locked: readonly LockedPart[];
  /** Ids of the printed parts that have an entry in the real-build view. */
  readonly printedIds: readonly string[];
}

/** Which shelf a locked part sits on, by its BOM category. Anything unlisted is a sensor. */
const LOCKED_SLOT: Readonly<Record<string, Slot>> = { motor: 'motor', battery: 'battery', actuator: 'extra', compute: 'extra' };

export function Workshop({ makers, locked, printedIds }: WorkshopProps) {
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const missionId = useBuildStore((store) => store.missionId);
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const unlock = useProgressStore((store) => store.unlock);
  const slot = useWorkshopUi((store) => store.slot);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const [notice, setNotice] = useState<string | null>(null);

  const router = useRouter();
  // Tapping a part on the 3D rover opens its sheet; a printed part opens its line in the real-build list. Unknown picks do nothing.
  const openPicked = useCallback(
    (pick: RoverPick | null): void => {
      if (!pick) return;
      if ('partId' in pick && PARTS_BY_ID.has(pick.partId)) router.push(`/workshop/part/${pick.partId}`);
      else if ('printedPartId' in pick && printedIds.includes(pick.printedPartId)) router.push(`/workshop/real#printed-${pick.printedPartId}`);
    },
    [router, printedIds],
  );

  const stats = buildStats(build);
  const fittedIds = fitted(build, slot);
  const over = stats.overBudgetEur > 0;
  const issues = buildIssues(build);

  const act = (part: Part): void => {
    const wasLocked = !isUnlocked(unlocked, part.id);
    if (wasLocked && !unlock(part.id)) {
      setNotice(`${part.name} needs ${part.unlockPoints - points} more points. Finish runs to earn them.`);
      return;
    }
    setNotice(wasLocked ? `${part.name} unlocked for ${part.unlockPoints} points and fitted.` : null);
    if (!fittedIds.includes(part.id)) setBuild(withPart(build, part));
  };

  return (
    <Shell
      back="/"
      title="Workshop"
      right={
        <span className="flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-line-2 bg-panel-2 px-3 font-mono text-[13px] tabular-nums">
          <span className={`font-semibold ${over ? 'text-bad' : 'text-orange'}`}>€{stats.costEur}</span>
          <span className="text-muted">/ €{BUDGET_EUR}</span>
        </span>
      }
      footer={
        <div className="flex gap-2.5">
          <Link href="/workshop/assembly" className="rr-btn rr-btn-secondary !min-h-[54px] flex-1 !bg-transparent">
            Assembly
          </Link>
          {over ? (
            <button type="button" disabled className="rr-btn rr-btn-primary !min-h-[54px] flex-[1.6] !text-[13px]">
              Over by €{stats.overBudgetEur}
            </button>
          ) : (
            <Link href={`/brief/${missionId}`} className="rr-btn rr-btn-primary !min-h-[54px] flex-[1.6] !text-[15px]">
              Brief the brain
              <Icon name="next" size={18} />
            </Link>
          )}
        </div>
      }
    >
      <section className="rr-stage h-[270px] shrink-0">
        <Bench3D build={build} onPick={openPicked} className="bottom-7" />
        <button type="button" onClick={() => setSlot('sensor')} className={`${CALLOUT} right-3 top-[18px] text-[#CFE9EE]`}>
          <span className={`${DOT} bg-cyan text-on-cyan`}>1</span>SENSORS
        </button>
        <Link href="/workshop/assembly" className={`${CALLOUT} left-3 top-[18px] text-[#CDE9D9]`}>
          <span className={`${DOT} bg-pcb text-[#04140B]`}>2</span>BRAIN BOARD
        </Link>
        <button type="button" onClick={() => setSlot('locomotion')} className={`${CALLOUT} left-3 bottom-[46px] text-[#D7DBE0]`}>
          <span className={`${DOT} bg-text text-ground`}>3</span>DRIVE
        </button>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#10151C] from-45% to-transparent" />
        <div className="absolute inset-x-3 bottom-2.5 grid grid-cols-4 gap-2">
          {stats.bars.map((bar) => (
            <div key={bar.key} className="flex flex-col gap-1" title={bar.figure}>
              <span className="font-mono text-[9px] font-medium uppercase tracking-[1px] text-muted">{bar.label}</span>
              <div className="rr-meter">
                <span style={{ width: `${bar.fill * 100}%`, backgroundColor: BAR_COLOR[bar.key] }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-1.5" role="group" aria-label="Presets">
        {PRESET_LIST.map((preset) => {
          const on = sameBuild(preset.build, build);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setNotice(null);
                setBuild(preset.build);
              }}
              className={`h-10 min-w-0 flex-1 whitespace-nowrap rounded-[10px] border px-0.5 font-display text-xs font-semibold transition-colors ${
                on ? 'border-orange bg-orange-deep text-orange-soft' : 'border-line-2 bg-panel-2 text-text-2'
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <SavedBuilds manage />

      <Link href="/workshop/real" className="flex h-11 items-center justify-between rounded-[10px] border border-[#3A2A1C] bg-[#17120D] px-3">
        <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">FROM GAME TO REALITY</span>
        <span className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[1px]">
          Build it for real
          <Icon name="next" size={16} />
        </span>
      </Link>

      <Predicted build={build} />

      <div className="sticky top-0 z-10 -mx-4 flex gap-1.5 border-b border-[#222831] bg-ground px-4" role="tablist" aria-label="Part slots">
        {SLOTS.map((info) => {
          const on = info.slot === slot;
          return (
            <button
              key={info.slot}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setSlot(info.slot);
                setNotice(null);
              }}
              className={`-mb-px flex h-11 flex-1 flex-col items-center justify-center gap-px border-b-2 font-mono text-[11px] font-medium uppercase tracking-[1px] ${
                on ? 'border-cyan text-cyan' : 'border-transparent text-muted'
              }`}
            >
              <span>{info.label}</span>
              <span className="text-[9px] text-faint">
                {fitted(build, info.slot).length}/{info.max}
              </span>
            </button>
          );
        })}
      </div>

      {[...issues, ...(notice ? [notice] : [])].map((line) => (
        <p key={line} role="status" className="text-xs leading-snug text-warn">
          {line}
        </p>
      ))}

      <Tuning slot={slot} build={build} onChange={setBuild} />

      {partsIn(slot).some((part) => !isUnlocked(unlocked, part.id)) ? (
        <p className="flex items-center justify-between font-mono text-[10px] font-medium tracking-[1px] text-muted">
          <span>LOCKED PARTS COST POINTS FROM RUNS</span>
          <span className="tabular-nums text-orange-soft">{points.toLocaleString('en-US')} PTS</span>
        </p>
      ) : null}

      <section role="tabpanel" className="grid grid-cols-2 gap-2.5">
        {partsIn(slot).map((part) => (
          <PartCard
            key={part.id}
            part={part}
            model={makers[part.id] ?? null}
            equipped={fittedIds.includes(part.id)}
            locked={!isUnlocked(unlocked, part.id)}
            affordable={points >= part.unlockPoints}
            onAct={act}
          />
        ))}
        {locked
          .filter((part) => (LOCKED_SLOT[part.category] ?? 'sensor') === slot)
          .map((part) => (
            <LockedCard key={part.key} part={part} />
          ))}
      </section>
    </Shell>
  );
}
