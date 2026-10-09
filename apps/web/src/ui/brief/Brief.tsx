'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { Mission, MissionId } from '@rivetrun/contracts';
import { MISSIONS, TUNING, compileTrack } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';
import { useBuildStore } from '@/state/build';
import { useWorkshopUi } from '@/state/workshop';
import { BUDGET_EUR, buildName, buildStats, missionBlockers, missionWarnings, presetThatFinishes } from '@/ui/buildStats';
import { PlayLink } from '@/ui/coach/PlayLink';
import { Icon } from '@/ui/Icon';
import { MODE_NOTE, ModeSwitch } from '@/ui/ModeSwitch';
import { Shell } from '@/ui/Shell';
import { TrackProfile } from '@/ui/TrackProfile';
import { useRivalPrefetch } from '@/ui/useRivalPrefetch';
import { BriefTheBrain } from './BriefTheBrain';
import { DriveCard } from './DriveCard';
import { PrioritySlider } from './PrioritySlider';

const { rain, cold } = TUNING.weather;

/** The facts of a mission as chips: weather modifier, steepest climb, obstacles, crossings, seed. */
function conditionChips(mission: Mission): readonly string[] {
  const segments = mission.track.segments;
  const steepest = [...segments].sort((a, b) => b.slopeDeg - a.slopeDeg)[0];
  const deepest = [...segments].sort((a, b) => (b.depthCm ?? 0) - (a.depthCm ?? 0))[0];
  const current = Math.max(0, ...segments.map((segment) => segment.currentMps ?? 0));
  const features = compileTrack(mission.track).features;
  const ramps = features.filter((feature) => feature.type === 'ramp').length;
  const gaps = features.filter((feature) => feature.type === 'gap');
  const widestGapM = Math.max(0, ...gaps.map((gap) => gap.endM - gap.startM));
  const drops = features.flatMap((feature) => (feature.type === 'drop' ? [feature.heightM] : []));
  const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
  const obstacles = [...new Set(segments.flatMap((segment) => (segment.obstacle ? [segment.obstacle] : [])))];
  return [
    mission.weather === 'rain' ? `Rain · grip ×${rain.frictionFactor}` : null,
    mission.weather === 'cold' ? `Cold · battery ×${cold.batteryCapacityFactor}` : null,
    mission.weather === 'clear' ? 'Clear' : null,
    steepest && steepest.slopeDeg >= 5 ? `${steepest.slopeDeg}° ${TERRAIN_LOOK[steepest.terrain].label} climb` : null,
    ramps > 0 ? plural(ramps, 'ramp') : null,
    gaps.length > 0 ? `${plural(gaps.length, 'gap')} up to ${Math.round(widestGapM * 100) / 100} m` : null,
    drops.length > 0 ? `${Math.max(...drops)} m drop` : null,
    obstacles.length > 0 ? obstacles.join(' + ') : null,
    deepest?.depthCm ? `${TERRAIN_LOOK[deepest.terrain].label} ${deepest.depthCm} cm deep` : null,
    current > 0 ? `Current ${current} m/s` : null,
    mission.fixedSeed === undefined ? null : 'Same seed for everyone',
  ].flatMap((chip) => (chip ? [chip] : []));
}

export function Brief({ missionId }: { readonly missionId: MissionId }) {
  const mission = MISSIONS[missionId];
  const build = useBuildStore((store) => store.build);
  const setMission = useBuildStore((store) => store.setMission);
  const setBuild = useBuildStore((store) => store.setBuild);
  const mode = useBuildStore((store) => store.mode);
  const warnings = missionWarnings(mission, build, { aiSenses: mode === 'jev' });
  const stats = buildStats(build);
  const blockers = missionBlockers(mission, build);
  const blocked = blockers.length > 0;
  const rescue = blocked ? presetThatFinishes(mission) : null;
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const overBudget = stats.overBudgetEur > 0;

  useEffect(() => setMission(missionId), [missionId, setMission]);
  useRivalPrefetch(mission);

  const robotCard = (
    <section className="rr-rise flex flex-col gap-2 rounded-xl border border-dashed border-line-3 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-xs text-[#B8C0C9]">
          <span className="font-mono text-text">{buildName(build).toUpperCase()}</span> · €{stats.costEur} of €{BUDGET_EUR} · {stats.massKg.toFixed(1)} kg
        </span>
        <Link href="/workshop" className="shrink-0 font-mono text-[11px] font-medium tracking-[1px] text-orange-soft">
          CHANGE
        </Link>
      </div>
      {blockers.map((blocker) => (
        <p key={blocker} className="flex items-start gap-2 text-xs leading-snug text-warn">
          <Icon name="warn" size={14} className="mt-px shrink-0" />
          <span className="min-w-0 flex-1">{blocker}</span>
          {/* One tap: straight to the Extras shelf, where the missing parts are. */}
          <Link href="/workshop" onClick={() => setSlot('extra')} className="shrink-0 font-mono text-[11px] font-medium tracking-[1px] text-orange-soft underline underline-offset-2">
            FIX IN WORKSHOP
          </Link>
        </p>
      ))}
      {rescue ? (
        <button
          type="button"
          onClick={() => setBuild(rescue.build)}
          className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] border border-orange px-3 text-left active:bg-orange-deep"
        >
          <span className="min-w-0 text-xs leading-snug text-text-2">
            <span className="font-display text-[13px] font-semibold text-orange-soft">Switch to {rescue.name}</span>
            <span className="block truncate">{rescue.blurb}</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">€{buildStats(rescue.build).costEur}</span>
        </button>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning} className="flex items-start gap-2 text-xs leading-snug text-warn">
          <Icon name="warn" size={14} className="mt-px shrink-0" />
          {warning}
        </p>
      ))}
      <p className="text-xs text-[#B8C0C9]">
        {mode === 'drive' ? (
          <>
            Same seed, one ghost: <span className="font-mono text-text">JEV</span>.
          </>
        ) : (
          <>
            Same seed, two ghosts: <span className="font-mono text-text">HEURISTIC</span> and <span className="font-mono text-text">RANDOM</span>.
          </>
        )}
      </p>
    </section>
  );

  return (
    <Shell
      back="/workshop"
      title={`Mission 0${mission.id.slice(1)}`}
      titleStyle="label"
      footer={
        overBudget ? (
          <Link href="/workshop" className="rr-btn rr-btn-secondary w-full !min-h-[60px] !rounded-2xl">
            Over budget by €{stats.overBudgetEur} · fix in Workshop
          </Link>
        ) : (
          <PlayLink href={`/run/${mission.id}`} className="rr-btn rr-btn-primary w-full !min-h-[60px] !rounded-2xl !text-xl !tracking-[2px]">
            {mode === 'drive' ? 'Drive' : 'Deploy'}
            <Icon name="next" size={22} />
          </PlayLink>
        )
      }
    >
      <section className="rr-rise flex flex-col gap-2">
        <h2 className="font-display text-4xl font-bold leading-none">{mission.name}</h2>
        <div className="flex flex-wrap gap-1.5">
          {conditionChips(mission).map((chip, index) => (
            <span key={chip} className="rr-chip">
              {index === 0 && mission.weather !== 'clear' ? <Icon name={mission.weather === 'rain' ? 'rain' : 'cold'} size={14} className="text-[#8FB8D6]" /> : null}
              {chip}
            </span>
          ))}
        </div>
      </section>

      <section className="rr-card rr-rise !rounded-2xl px-3 pb-2.5 pt-3" style={{ ['--i' as string]: 1 }}>
        <TrackProfile mission={mission} />
      </section>

      {/* A build that cannot finish goes above the fold, next to its fix; otherwise the robot is a footnote. */}
      {blocked ? robotCard : null}

      <section className="rr-rise flex flex-col gap-1.5" style={{ ['--i' as string]: 2 }}>
        <ModeSwitch />
        <p className="px-1 text-xs leading-snug text-muted">{MODE_NOTE[mode]}</p>
      </section>

      {mode === 'drive' ? (
        <div className="rr-rise" style={{ ['--i' as string]: 3 }}>
          <DriveCard />
        </div>
      ) : (
        <>
          <div className="rr-rise" style={{ ['--i' as string]: 3 }}>
            <BriefTheBrain />
          </div>
          <div className="rr-rise" style={{ ['--i' as string]: 4 }}>
            <PrioritySlider />
          </div>
        </>
      )}

      {blocked ? null : robotCard}
    </Shell>
  );
}
