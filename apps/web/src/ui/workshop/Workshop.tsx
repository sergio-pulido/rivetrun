'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Part, Slot } from '@rivetrun/contracts';
import { MISSIONS, PRESETS } from '@rivetrun/sim';
import { WorkshopCanvas } from '@/game';
import { useBuildStore } from '@/state/build';
import { isUnlocked, useProgressStore } from '@/state/progress';
import { buildName, buildStats, sameBuild } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { PartCard } from './PartCard';
import { SLOTS, fitted, partsIn, withPart } from './slots';
import { StatPanel } from './StatPanel';

const PRESET_LIST = Object.values(PRESETS);

export function Workshop() {
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const missionId = useBuildStore((store) => store.missionId);
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const unlock = useProgressStore((store) => store.unlock);
  const [slot, setSlot] = useState<Slot>('locomotion');
  const [notice, setNotice] = useState<string | null>(null);

  const stats = buildStats(build);
  const mission = MISSIONS[missionId];
  const active = SLOTS.find((info) => info.slot === slot) ?? SLOTS[0]!;
  const fittedIds = fitted(build, slot);
  const over = stats.overBudgetEur > 0;

  const tapPart = (part: Part): void => {
    if (!isUnlocked(unlocked, part.id)) {
      if (!unlock(part.id)) {
        setNotice(`${part.name} needs ${part.unlockPoints - points} more points. Finish runs to earn them.`);
        return;
      }
      setNotice(`${part.name} unlocked.`);
      if (!fittedIds.includes(part.id)) setBuild(withPart(build, part));
      return;
    }
    setNotice(null);
    setBuild(withPart(build, part));
  };

  return (
    <Shell
      back="/"
      kicker="Workshop"
      title={buildName(build)}
      footer={
        over ? (
          <button type="button" disabled className="rr-btn rr-btn-primary w-full">
            Over budget by €{stats.overBudgetEur}
          </button>
        ) : (
          <Link href={`/brief/${mission.id}`} className="rr-btn rr-btn-primary w-full !min-h-[60px] !justify-between !px-5">
            <span className="flex min-w-0 flex-col items-start">
              <span className="text-lg font-bold leading-none">Take it to {mission.id}</span>
              <span className="mt-1.5 truncate font-mono text-[10px] font-medium uppercase leading-none tracking-wider opacity-75">
                {mission.name} · mission brief
              </span>
            </span>
            <Icon name="next" size={22} />
          </Link>
        )
      }
    >
      <section className="relative -mx-4 -mt-1 h-[216px]">
        <div className="pointer-events-none absolute inset-x-10 bottom-6 top-8 rounded-[50%] bg-[radial-gradient(closest-side,rgb(59_130_196/0.26),transparent)]" />
        <span className="rr-label rr-blink pointer-events-none absolute inset-0 grid place-items-center">Powering up the bench</span>
        <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_80%,transparent)]">
          <WorkshopCanvas build={build} />
        </div>
        <span className="rr-label pointer-events-none absolute right-4 top-1">drag to spin</span>
      </section>

      <div className="-mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Presets">
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
              className={`rr-btn !min-h-12 !rounded-xl !px-1 text-[13px] ${on ? 'rr-btn-primary' : 'rr-btn-secondary'}`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <StatPanel stats={stats} />

      <div className="sticky top-0 z-10 -mx-4 bg-slate-ink/90 px-4 py-2 backdrop-blur" role="tablist" aria-label="Part slots">
        <div className="grid grid-cols-5 gap-1.5">
          {SLOTS.map((info) => {
            const on = info.slot === slot;
            const count = fitted(build, info.slot).length;
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
                className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition-colors ${
                  on ? 'border-safety bg-safety/15 text-safety' : 'border-slate-line bg-slate-panel text-slate-300'
                }`}
              >
                <Icon name={info.icon} size={20} />
                {info.label}
                {info.slot === 'sensor' || info.slot === 'extra' ? (
                  <span className={`absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] ${count > 0 ? 'bg-safety text-slate-deep' : 'bg-slate-line text-dim'}`}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <section role="tabpanel" aria-label={active.label} className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="rr-label">{active.rule}</h2>
          {notice ? <span className="text-right text-[12px] leading-tight text-warn">{notice}</span> : null}
        </div>
        {partsIn(slot).map((part) => {
          const locked = !isUnlocked(unlocked, part.id);
          return (
            <PartCard
              key={part.id}
              part={part}
              selected={fittedIds.includes(part.id)}
              locked={locked}
              affordable={points >= part.unlockPoints}
              onTap={tapPart}
            />
          );
        })}
      </section>
    </Shell>
  );
}
