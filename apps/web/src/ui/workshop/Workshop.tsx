'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Part } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { WorkshopCanvas } from '@/game';
import { useBuildStore } from '@/state/build';
import { isUnlocked, useProgressStore } from '@/state/progress';
import { useWorkshopUi } from '@/state/workshop';
import { BUDGET_EUR, buildStats, sameBuild } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { PartCard } from './PartCard';
import { SLOTS, fitted, partsIn, withPart } from './slots';

const PRESET_LIST = Object.values(PRESETS);
const BAR_COLOR = { speed: 'var(--color-orange)', grip: 'var(--color-pcb)', endurance: '#E3B341', perception: 'var(--color-cyan)' } as const;
const CALLOUT = 'absolute flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-[1px]';
const DOT = 'grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-semibold';

export function Workshop() {
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const missionId = useBuildStore((store) => store.missionId);
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const unlock = useProgressStore((store) => store.unlock);
  const slot = useWorkshopUi((store) => store.slot);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const [notice, setNotice] = useState<string | null>(null);

  const stats = buildStats(build);
  const fittedIds = fitted(build, slot);
  const over = stats.overBudgetEur > 0;

  const act = (part: Part): void => {
    if (!isUnlocked(unlocked, part.id) && !unlock(part.id)) {
      setNotice(`${part.name} needs ${part.unlockPoints - points} more points. Finish runs to earn them.`);
      return;
    }
    setNotice(null);
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
        <span className="rr-label rr-blink pointer-events-none absolute inset-0 grid place-items-center">Powering up the bench</span>
        <div className="absolute inset-x-0 bottom-7 top-0">
          <WorkshopCanvas build={build} />
        </div>
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

      <div className="flex gap-2" role="group" aria-label="Presets">
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
              className={`h-10 flex-1 rounded-[10px] border font-display text-[13px] font-semibold transition-colors ${
                on ? 'border-orange bg-orange-deep text-orange-soft' : 'border-line-2 bg-panel-2 text-text-2'
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

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

      {notice ? (
        <p role="status" className="text-xs leading-snug text-warn">
          {notice}
        </p>
      ) : null}

      <section role="tabpanel" className="grid grid-cols-2 gap-2.5">
        {partsIn(slot).map((part) => (
          <PartCard
            key={part.id}
            part={part}
            equipped={fittedIds.includes(part.id)}
            locked={!isUnlocked(unlocked, part.id)}
            affordable={points >= part.unlockPoints}
            onAct={act}
          />
        ))}
      </section>
    </Shell>
  );
}
