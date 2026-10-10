'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Part, Slot } from '@rivetrun/contracts';
import { MISSIONS, PARTS_BY_ID, PRESETS, buildIssues } from '@rivetrun/sim';
import type { RoverPick } from '@/game/robot/pick';
import { useBuildStore } from '@/state/build';
import { isUnlocked, useProgressStore } from '@/state/progress';
import { useWorkshopUi } from '@/state/workshop';
import { SavedBuilds } from '@/ui/builds/SavedBuilds';
import { BUDGET_EUR, buildStats, sameBuild } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import type { Bom } from '@/ui/real/bom';
import type { PartMedia } from '@/ui/real/bomData';
import { LockedCard, type LockedPart } from '@/ui/real/LockedCard';
import { SensePanel } from '@/ui/sensing/SensePanel';
import { Shell } from '@/ui/Shell';
import { TestRun } from '@/ui/strategy/TestRun';
import { useTestRun } from '@/ui/strategy/useTestRun';
import { Bench3D } from '@/ui/three/Bench3D';
import { PartCard } from './PartCard';
import { PartSheet } from './PartSheet';
import { Predicted } from './Predicted';
import { SLOTS, fitted, partsIn, withPart } from './slots';
import { Tuning } from './Tuning';
import { useAmbience } from '@/game/audio/samples';

const PRESET_LIST = Object.values(PRESETS);
const BAR_COLOR = { speed: 'var(--color-orange)', grip: 'var(--color-pcb)', endurance: '#E3B341', perception: 'var(--color-cyan)' } as const;
// A dark pill behind each hotspot label: the stage behind them may be light (the Workshop's studio) or dark.
const CALLOUT = 'absolute flex items-center gap-1.5 rounded-full bg-[#10151C]/85 py-1 pl-1 pr-2.5 font-mono text-[10px] font-medium tracking-[1px] backdrop-blur-sm';
/** The stat bars sit on their own dark strip at the foot of the stage; the 3D view ends above it. */
const STAT_STRIP = 'h-[38px]';
const DOT = 'grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-semibold';

interface WorkshopProps {
  /** Game part id → who makes its real component, from the MK-II bill of materials. */
  readonly makers: Readonly<Record<string, string>>;
  /** Real parts from the bill of materials that the game does not have yet. Shown locked on the shelf they belong to. */
  readonly locked: readonly LockedPart[];
  /** Ids of the printed parts that have an entry in the real-build view. */
  readonly printedIds: readonly string[];
  /** The bill of materials and its renders, for the part sheet when it opens as a side panel (desktop). */
  readonly bom: Bom | null;
  readonly media: Readonly<Record<string, PartMedia>>;
}

/** Desktop and projector: the two-column Workshop, where a part's sheet opens beside the rover instead of on its own page. */
const isWide = (): boolean => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

/** Which shelf a locked part sits on, by its BOM category. Anything unlisted is a sensor. */
const LOCKED_SLOT: Readonly<Record<string, Slot>> = { motor: 'motor', battery: 'battery', actuator: 'extra', compute: 'extra' };

export function Workshop({ makers, locked, printedIds, bom, media }: WorkshopProps) {
  useAmbience('amb_workshop'); // RR-SOUND: workshop ambience, quiet on a phone; silent when the pack has no file
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const missionId = useBuildStore((store) => store.missionId);
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const unlock = useProgressStore((store) => store.unlock);
  const slot = useWorkshopUi((store) => store.slot);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const [notice, setNotice] = useState<string | null>(null);
  const shelf = useRef<HTMLElement>(null);
  // Wide screens: the part whose sheet is open as a side panel. Phones navigate to the sheet's own page instead.
  const [panelPart, setPanelPart] = useState<Part | null>(null);
  const openPanel = useCallback((part: Part): boolean => {
    if (!isWide()) return false;
    setPanelPart(part);
    return true;
  }, []);
  useEffect(() => {
    if (!panelPart) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPanelPart(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelPart]);
  // The shelf sits under the sticky tab bar and often below the fold: after a tab is tapped (not on first load, and not when
  // another screen changed the slot) its cards are brought into view, once the new shelf has rendered.
  const tapped = useRef(false);
  useEffect(() => {
    if (!tapped.current) return;
    tapped.current = false;
    // On wide screens the shelf is already beside the rover.
    if (!isWide()) shelf.current?.scrollIntoView({ block: 'start' });
  }, [slot]);
  const setMission = useBuildStore((store) => store.setMission);
  const priority = useBuildStore((store) => store.priority);
  const testing = useWorkshopUi((store) => store.testRun);
  const mission = MISSIONS[missionId];
  const testRun = useTestRun(build, mission, priority, testing);
  // Parts the test run points at, each with the capability it would provide: marked on the shelf and on their slot's tab.
  const fixNames = new Map(testRun.fixes.flatMap((fix) => fix.partIds.map((id): [string, string] => [id, fix.name])));
  const slotHasFix = (candidate: Slot): boolean => partsIn(candidate).some((part) => fixNames.has(part.id));

  const router = useRouter();
  // Tapping a part on the 3D rover opens its sheet; a printed part opens its line in the real-build list. Unknown picks do nothing.
  const openPicked = useCallback(
    (pick: RoverPick | null): void => {
      if (!pick) return;
      const picked = 'partId' in pick ? PARTS_BY_ID.get(pick.partId) : undefined;
      if (picked) {
        if (!openPanel(picked)) router.push(`/workshop/part/${picked.id}`);
      }
      else if ('printedPartId' in pick && printedIds.includes(pick.printedPartId)) router.push(`/workshop/real#printed-${pick.printedPartId}`);
    },
    [router, printedIds, openPanel],
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

  // Assembly and the way to the Brief: pinned to the foot of the screen on a phone, at the foot of the right column on wide screens.
  const actions = (
    <>
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
        </>
  );

  return (
    <Shell
      back="/"
      title="Workshop"
      wide
      bodyClassName="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6"
      footerClassName="lg:hidden"
      right={
        <span className="flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-line-2 bg-panel-2 px-3 font-mono text-[13px] tabular-nums">
          <span className={`font-semibold ${over ? 'text-bad' : 'text-orange'}`}>€{stats.costEur}</span>
          <span className="text-muted">/ €{BUDGET_EUR}</span>
        </span>
      }
      footer={<div className="flex gap-2.5">{actions}</div>}
    >
      {/* Wide screens: the left column, about 60 %: the stage at full height with presets and saved builds under it.
          On a phone this wrapper has no box (display: contents), so the screen is one column in the same order as before. */}
      <div className="contents lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-3">
      {/* The Workshop's 3D view is a light studio (the game's backdrop colour): the same light grey sits behind the canvas, so
          nothing dark flashes before its first frame, and the loading label is dark enough to read on it. */}
      <section className="rr-stage h-[270px] shrink-0 !bg-[#e6e8eb] [background-image:none] lg:h-[min(calc(100dvh-200px),700px)] lg:min-h-[360px] [&_.rr-label]:!text-[#3F4854]">
        <Bench3D build={build} onPick={openPicked} className="bottom-[38px]" />
        <button type="button" onClick={() => setSlot('sensor')} className={`${CALLOUT} right-3 top-[18px] text-[#CFE9EE]`}>
          <span className={`${DOT} bg-cyan text-on-cyan`}>1</span>SENSORS
        </button>
        <Link href="/workshop/assembly" className={`${CALLOUT} left-3 top-[18px] text-[#CDE9D9]`}>
          <span className={`${DOT} bg-pcb text-[#04140B]`}>2</span>BRAIN BOARD
        </Link>
        <button type="button" onClick={() => setSlot('locomotion')} className={`${CALLOUT} left-3 bottom-[48px] text-[#D7DBE0]`}>
          <span className={`${DOT} bg-text text-ground`}>3</span>DRIVE
        </button>
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 ${STAT_STRIP} border-t border-[#262b33] bg-[#10151C]`} />
        <div className="absolute inset-x-3 bottom-2 grid grid-cols-4 gap-2">
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
      </div>

      {/* Wide screens: the right column. Its order there is shelf, Predicted, Test run, Build it for real, then the way on. */}
      <div className="contents lg:flex lg:flex-col lg:gap-3">
      <Link href="/workshop/real" className="flex h-11 items-center justify-between rounded-[10px] border border-[#3A2A1C] bg-[#17120D] px-3 lg:order-4">
        <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">FROM GAME TO REALITY</span>
        <span className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[1px]">
          Build it for real
          <Icon name="next" size={16} />
        </span>
      </Link>

      <div className="contents lg:order-2 lg:block">
        <Predicted build={build} />
      </div>

      <div className="contents lg:order-3 lg:block">
        <TestRun mission={mission} result={testRun} onMission={setMission} />
      </div>

      <div className="contents lg:order-1 lg:flex lg:flex-col lg:gap-3">
      <div className="sticky top-0 z-10 -mx-4 flex gap-1.5 border-b border-[#222831] bg-ground px-4 lg:mx-0 lg:px-0" role="tablist" aria-label="Part slots">
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
                tapped.current = true;
              }}
              className={`-mb-px flex h-11 flex-1 flex-col items-center justify-center gap-px border-b-2 font-mono text-[11px] font-medium uppercase tracking-[1px] ${
                on ? 'border-cyan text-cyan' : 'border-transparent text-muted'
              }`}
            >
              <span className="flex items-center gap-1">
                {info.label}
                {slotHasFix(info.slot) ? <span className="h-1.5 w-1.5 rounded-full bg-orange" aria-label="the test run points at a part here" /> : null}
              </span>
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

      {/* On the shelf where it can be changed: what the fitted sensors tell the brain, and what stays unknown. */}
      {slot === 'sensor' ? (
        // Wide screens: after the cards, so the shelf starts right under its tabs.
        <div className="contents lg:order-last lg:block">
          <SensePanel build={build} />
        </div>
      ) : null}

      {partsIn(slot).some((part) => !isUnlocked(unlocked, part.id)) ? (
        <p className="flex items-center justify-between font-mono text-[10px] font-medium tracking-[1px] text-muted">
          <span>LOCKED PARTS COST POINTS FROM RUNS</span>
          <span className="tabular-nums text-orange-soft">{points.toLocaleString('en-US')} PTS</span>
        </p>
      ) : null}

      <section ref={shelf} role="tabpanel" className="grid scroll-mt-[56px] grid-cols-2 gap-2.5">
        {partsIn(slot).map((part) => (
          <PartCard
            key={part.id}
            part={part}
            model={makers[part.id] ?? null}
            equipped={fittedIds.includes(part.id)}
            locked={!isUnlocked(unlocked, part.id)}
            affordable={points >= part.unlockPoints}
            fixes={fixNames.get(part.id)}
            onOpen={openPanel}
            onAct={act}
          />
        ))}
        {locked
          .filter((part) => (LOCKED_SLOT[part.category] ?? 'sensor') === slot)
          .map((part) => (
            <LockedCard key={part.key} part={part} />
          ))}
      </section>
      </div>

      {/* Wide screens: the way on sits at the foot of the right column, where the phone has its pinned bar. */}
      <div className="hidden gap-2.5 rounded-2xl bg-ground/95 p-2 lg:sticky lg:bottom-3 lg:z-10 lg:order-5 lg:flex">{actions}</div>
      </div>

      {panelPart ? (
        <div className="fixed inset-0 z-40 hidden lg:block">
          {/* Nothing is dimmed: the rover stays in view and changes as parts are fitted. A click beside the panel closes it. */}
          <button type="button" aria-label="Close the part sheet" tabIndex={-1} onClick={() => setPanelPart(null)} className="absolute inset-0 cursor-default" />
          <aside aria-label={`${panelPart.name}: details`} className="absolute inset-y-0 right-0 w-[448px] overflow-y-auto border-l border-line-2 bg-ground shadow-[-18px_0_40px_rgb(0_0_0/0.45)]">
            <PartSheet key={panelPart.id} part={panelPart} bom={bom} media={media} onClose={() => setPanelPart(null)} />
          </aside>
        </div>
      ) : null}
    </Shell>
  );
}
