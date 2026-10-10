'use client';

import { useMemo } from 'react';
import type { Build, Mission } from '@rivetrun/contracts';
import { Icon } from '@/ui/Icon';
import { planFacts, simWeatherEffects, simWeatherFacts, weatherLines } from './weather';

const TONE = { info: 'text-text-2', warn: 'text-warn', bad: 'text-bad' } as const;

interface WeatherCardProps {
  readonly mission: Mission;
  readonly build: Build;
}

/** The mission's weather as the plan gives it, and what it does to the robot on the bench. Nothing on a calm, clear mission. */
export function WeatherCard({ mission, build }: WeatherCardProps) {
  const facts = useMemo(() => planFacts(mission), [mission]);
  // The sim's own lines when it gives them; otherwise the same factors worded here.
  const lines = useMemo(() => simWeatherEffects(build, mission) ?? weatherLines(mission, build, simWeatherFacts(mission)), [mission, build]);
  if (facts.length === 0 && lines.length === 0) return null;
  const icon = mission.weather === 'rain' || mission.conditions?.precipitation === 'rain' || mission.conditions?.precipitation === 'heavy_rain' ? 'rain' : mission.weather === 'cold' || mission.conditions?.precipitation === 'snow' ? 'cold' : 'sun';

  return (
    <section className="rr-card flex flex-col gap-2.5 p-3" aria-label="Weather">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={18} className="shrink-0 text-[#8FB8D6]" />
        <h3 className="rr-label !text-[#8FB8D6]">Weather</h3>
        <span className="min-w-0 truncate text-[13px] font-semibold">{facts.join(' · ')}</span>
      </div>
      {lines.length > 0 ? (
        <ul className="flex flex-col">
          {lines.map((line) => (
            <li key={line.id} className="flex items-baseline gap-2 border-t border-tag py-1.5 first:border-t-0 first:pt-0 last:pb-0">
              <span className={`w-[96px] shrink-0 font-mono text-[10px] font-medium uppercase leading-snug tracking-[1px] ${TONE[line.tone]}`}>{line.label}</span>
              <span className="min-w-0 text-xs leading-snug text-text-2">{line.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-snug text-muted">Nothing on this build is affected.</p>
      )}
      <p className="border-t border-line pt-2 text-[11px] leading-snug text-faint">From the mission plan. Every driver knows it before the start; gusts are felt only as they come.</p>
    </section>
  );
}
