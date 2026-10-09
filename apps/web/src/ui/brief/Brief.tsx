'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { MissionId, Weather } from '@rivetrun/contracts';
import { MISSIONS, TUNING } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { BUDGET_EUR, buildName, buildStats, missionWarnings, partsOf } from '@/ui/buildStats';
import { Icon, type IconName } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { TrackProfile } from '@/ui/TrackProfile';
import { PrioritySlider } from './PrioritySlider';

const WEATHER: Readonly<Record<Weather, { label: string; icon: IconName; effects: readonly string[] }>> = {
  clear: { label: 'Clear', icon: 'sun', effects: [] },
  rain: {
    label: 'Rain',
    icon: 'rain',
    effects: [
      `Friction ×${TUNING.weather.rain.frictionFactor}`,
      `Mud sinkage ×${TUNING.weather.rain.mudSinkageFactor}`,
      `Camera range ×${TUNING.weather.rain.cameraRangeFactor}`,
    ],
  },
  cold: {
    label: 'Cold',
    icon: 'cold',
    effects: [`Battery ×${TUNING.weather.cold.batteryCapacityFactor}`, `Ice friction ×${TUNING.weather.cold.iceFrictionFactor}`],
  },
};

function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-slate-line bg-slate-deep/60 px-1 py-2.5 text-center">
      <span className="text-safety">
        <Icon name={icon} size={20} />
      </span>
      <span className="text-sm font-semibold leading-none">{value}</span>
      <span className="rr-label !text-[9px]">{label}</span>
    </div>
  );
}

export function Brief({ missionId }: { readonly missionId: MissionId }) {
  const mission = MISSIONS[missionId];
  const build = useBuildStore((store) => store.build);
  const setMission = useBuildStore((store) => store.setMission);
  const stats = buildStats(build);
  const warnings = missionWarnings(mission, build);
  const weather = WEATHER[mission.weather];
  const length = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  const overBudget = stats.overBudgetEur > 0;

  useEffect(() => setMission(missionId), [missionId, setMission]);

  return (
    <Shell
      back="/"
      kicker={`${mission.id} · mission brief`}
      title={mission.name}
      footer={
        overBudget ? (
          <Link href="/workshop" className="rr-btn rr-btn-secondary w-full">
            <Icon name="wrench" />
            Over budget by €{stats.overBudgetEur} · fix in Workshop
          </Link>
        ) : (
          <Link href={`/run/${mission.id}`} className="rr-btn rr-btn-primary rr-sheen w-full !min-h-[60px] text-xl">
            <Icon name="play" size={20} />
            Deploy
          </Link>
        )
      }
    >
      <p className="rr-rise text-[15px] leading-snug text-slate-300">{mission.description}</p>

      <section className="rr-panel rr-rise p-3" style={{ ['--i' as string]: 1 }}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="rr-label">Track</h2>
          <span className="font-mono text-[11px] text-dim">
            <span className="text-slate-200">{length} m</span> · {mission.track.segments.length} segments
          </span>
        </div>
        <TrackProfile mission={mission} />
      </section>

      <section className="rr-rise" style={{ ['--i' as string]: 2 }}>
        <div className="flex gap-2">
          <Tile icon={weather.icon} label="Weather" value={weather.label} />
          <Tile icon={mission.fixedSeed === undefined ? 'dice' : 'users'} label="Seed" value={mission.fixedSeed === undefined ? 'Random' : 'Shared'} />
          <Tile icon="star" label="2-star score" value={`${mission.starThreshold}`} />
        </div>
        <p className="mt-2 px-1 font-mono text-[11px] leading-relaxed text-dim">
          {weather.effects.length > 0 ? `${weather.label}: ${weather.effects.join(' · ')}. ` : 'No weather modifiers. '}
          {mission.fixedSeed === undefined
            ? `Friction varies ±${TUNING.practice.frictionJitter * 100}% run to run.`
            : 'Every player in the room gets this exact run.'}
        </p>
      </section>

      <section className="rr-panel rr-rise p-3" style={{ ['--i' as string]: 3 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="rr-label">Your robot</h2>
            <div className="mt-1.5 text-base font-semibold leading-tight">{buildName(build)}</div>
            <div className="mt-1 font-mono text-[11px] text-dim">
              €{stats.costEur} of €{BUDGET_EUR} · {stats.massKg.toFixed(1)} kg
            </div>
          </div>
          <Link href="/workshop" className="rr-btn rr-btn-secondary !min-h-11 shrink-0 !rounded-xl !px-3.5 text-sm">
            <Icon name="wrench" size={16} />
            Change
          </Link>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {partsOf(build).map((part) => (
            <span key={part.id} className="rr-chip">
              {part.name}
            </span>
          ))}
        </div>
        {warnings.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5 border-t border-slate-line pt-3">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2 text-[13px] leading-snug text-warn">
                <Icon name="warn" size={15} className="mt-0.5 shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 border-t border-slate-line pt-3 text-[13px] text-ok">
            <Icon name="check" size={15} />
            Nothing on this track catches this build off guard.
          </p>
        )}
      </section>

      <section className="rr-panel rr-rise p-3" style={{ ['--i' as string]: 4 }}>
        <PrioritySlider />
      </section>
    </Shell>
  );
}
