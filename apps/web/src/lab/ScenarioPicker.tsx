'use client';

import Link from 'next/link';
import { LAB_SCENARIOS, LAB_SCENARIO_IDS } from '@rivetrun/lab';
import { Stars } from '@/ui/Stars';
import { useLabBests } from './bests';
import { SCENARIO_BRIEFS } from './copy';
import { Simplifications } from './Simplifications';

/** The five Lab Missions, each with what decides it and the best score on this device. */
export function ScenarioPicker() {
  const bests = useLabBests();

  return (
    <div className="flex flex-col gap-3">
      <section className="rr-rise flex flex-col gap-1.5">
        <h2 className="font-display text-xl font-bold uppercase tracking-[1px]">Lab Missions</h2>
        <p className="text-[13px] leading-snug text-text-2">
          Tasks a race track cannot ask: mazes, deliveries, sample returns. Same parts, same sensors, same battery, and the robot knows only what its sensors report.
        </p>
        <Simplifications />
      </section>

      <ul className="flex flex-col gap-2.5">
        {LAB_SCENARIO_IDS.map((id, i) => {
          const scenario = LAB_SCENARIOS[id];
          const brief = SCENARIO_BRIEFS[id];
          const best = bests[id];
          return (
            <li key={id} className="rr-rise" style={{ ['--i' as string]: i }}>
              <Link href={`/scenarios/${id}`} className="rr-card flex flex-col gap-2 p-3 active:bg-panel-2" data-testid={`scenario-${id}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="font-display text-base font-semibold uppercase tracking-[0.5px]">{scenario.name}</span>
                  {best ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <Stars count={best.stars} size={14} />
                      <span className="font-mono text-xs tabular-nums text-orange-soft">{best.score}</span>
                    </span>
                  ) : (
                    <span className="rr-label shrink-0">Not run yet</span>
                  )}
                </span>
                <span className="text-[13px] leading-snug text-text-2">{brief.tagline}</span>
                <span className="flex flex-wrap gap-1.5">
                  {brief.matters.map((part) => <span key={part} className="rr-chip rr-chip-on">{part}</span>)}
                  {scenario.agents.length > 1 ? <span className="rr-chip">2 robots</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
