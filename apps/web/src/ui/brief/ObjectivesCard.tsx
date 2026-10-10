'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Build, Mission } from '@rivetrun/contracts';
import { useWorkshopUi } from '@/state/workshop';
import { Icon } from '@/ui/Icon';
import { objectives, scanRules } from './objectives';

interface ObjectivesCardProps {
  readonly mission: Mission;
  readonly build: Build;
}

/** The mission's objectives: each scan zone, the sensor it needs, and whether the robot on the bench can scan it. Nothing for a mission without any. */
export function ObjectivesCard({ mission, build }: ObjectivesCardProps) {
  const rows = useMemo(() => objectives(mission, build), [mission, build]);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  if (rows.length === 0) return null;
  const rules = scanRules();
  const able = rows.filter((row) => row.canScan).length;

  return (
    <section className="rr-card flex flex-col gap-2.5 p-3" aria-label="Objectives">
      <div className="flex flex-col gap-0.5">
        <h3 className="rr-label !text-orange-soft">Objectives · scan {rows.length === 1 ? 'zone' : 'zones'}</h3>
        <span className={`text-[11px] leading-snug ${able === rows.length ? 'text-ok' : 'text-warn'}`}>
          This build can scan {able} of {rows.length}.
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-2 border-t border-tag py-2 first:border-t-0 first:pt-0 last:pb-0">
            <Icon name={row.canScan ? 'check' : 'close'} size={15} className={`mt-0.5 shrink-0 ${row.canScan ? 'text-ok' : 'text-warn'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-snug">
                <span className="font-display font-semibold capitalize">{row.label}</span>
                <span className="ml-1.5 font-mono text-[11px] tabular-nums text-muted">at {row.atM} m</span>
              </span>
              <span className="block text-xs leading-snug text-text-2">
                {row.canScan ? (
                  <>Your {row.with?.toLowerCase() ?? 'sensor'} can scan it.</>
                ) : (
                  <>
                    Needs {row.needs}. <span className="text-warn">This build cannot scan it.</span>
                  </>
                )}
              </span>
            </span>
            {row.canScan ? null : (
              <Link href="/workshop" onClick={() => setSlot('sensor')} className="-my-1 flex min-h-11 shrink-0 items-center font-mono text-[11px] font-medium tracking-[1px] text-orange-soft underline underline-offset-2">
                FIT ONE
              </Link>
            )}
          </li>
        ))}
      </ul>
      {rules ? (
        <p className="border-t border-line pt-2.5 text-[11px] leading-snug text-muted">
          Stop on a zone for {rules.holdS} s to scan it. Each zone left unscanned adds {rules.missPenaltyS} s to your time.
        </p>
      ) : null}
    </section>
  );
}
