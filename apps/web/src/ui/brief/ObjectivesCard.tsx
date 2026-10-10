'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Build, Mission } from '@rivetrun/contracts';
import { MISSIONS, MISSION_IDS } from '@rivetrun/sim';
import { isUnlocked, useProgressStore } from '@/state/progress';
import { useWorkshopUi } from '@/state/workshop';
import { MAX_SENSORS } from '@/ui/buildStats';
import { assessBuild } from '@/ui/strategy/sim';
import { SimplifiedNote } from '@/ui/honesty/SimplifiedNote';
import { simplifiedForObjectives } from '@/ui/honesty/simplified';
import { Icon } from '@/ui/Icon';
import { lockedLine, objectives, scanFixes, scanRules, type ScanFix } from './objectives';

interface ObjectivesCardProps {
  readonly mission: Mission;
  readonly build: Build;
}

/** How many of the shortest missions are tried when looking for one run that pays for the locked parts. */
const EARN_TRIES = 3;

/**
 * Where one finished run with this robot would pay for the locked parts: the shortest mission whose test run finishes
 * with at least that score (a run pays its score in points). Null when none of the shortest few does.
 */
function earnIn(build: Build, pointsNeeded: number): string | null {
  const byLength = [...MISSION_IDS].map((id) => MISSIONS[id]).sort((a, b) => a.track.segments.reduce((sum, seg) => sum + seg.lengthM, 0) - b.track.segments.reduce((sum, seg) => sum + seg.lengthM, 0));
  for (const candidate of byLength.slice(0, EARN_TRIES)) {
    const run = assessBuild(build, candidate);
    if (run?.finished && run.score >= pointsNeeded) return candidate.name;
  }
  return null;
}

function Fixes({ fixes, build }: { readonly fixes: readonly ScanFix[]; readonly build: Build }) {
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const locked = lockedLine(fixes, (id) => isUnlocked(unlocked, id));
  const short = locked ? Math.max(0, locked.total - points) : 0;
  const where = useMemo(() => (short > 0 ? earnIn(build, short) : null), [build, short]);
  return (
    <span className="mt-1.5 flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">Fit</span>
        {fixes.map((fix) => (
          <Link key={fix.partId} href={`/workshop/part/${fix.partId}`} onClick={() => setSlot('sensor')} className="rr-chip !h-9 !border-orange !px-2.5 !normal-case !text-orange-soft">
            {fix.unlockPoints > 0 && !isUnlocked(unlocked, fix.partId) ? <Icon name="lock" size={12} /> : null}
            {fix.name}
            <Icon name="next" size={12} />
          </Link>
        ))}
      </span>
      {fixes.some((fix) => fix.replaces) ? (
        <span className="text-[11px] leading-snug text-muted">
          {fixes
            .filter((fix) => fix.replaces)
            .map((fix) => `${fix.name} takes the place of your ${fix.replaces!.toLowerCase()}`)
            .join('; ')}
          .
        </span>
      ) : null}
      {locked ? (
        <span className="text-[11px] leading-snug text-text-2">
          {locked.text}{' '}
          {short === 0
            ? `You have ${points} points: enough to unlock ${locked.count > 1 ? 'both' : 'it'}.`
            : where
              ? `One finished run pays for ${locked.count > 1 ? 'them' : 'it'}: ${where} is the shortest.`
              : `You have ${points} points; finished runs pay their score in points.`}
        </span>
      ) : null}
    </span>
  );
}

/** The mission's objectives: each scan zone, the sensor it needs, and whether the robot on the bench can scan it. Nothing for a mission without any. */
export function ObjectivesCard({ mission, build }: ObjectivesCardProps) {
  const rows = useMemo(() => objectives(mission, build), [mission, build]);
  // For each zone the build cannot scan: the sensors that would let it, by the sim's verdict.
  const fixesByZone = useMemo(
    () => Object.fromEntries(rows.filter((row) => !row.canScan).map((row) => [row.id, scanFixes(mission, build, row.id, { maxSensors: MAX_SENSORS })])),
    [rows, mission, build],
  );
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
                  <>Your {row.with?.toLowerCase() ?? 'sensors'} can scan it.</>
                ) : row.blocked ? (
                  <span className="text-warn">{row.blocked}</span>
                ) : (
                  <>
                    Needs {row.needs}. <span className="text-warn">This build cannot scan it.</span>
                  </>
                )}
              </span>
              {!row.canScan && (fixesByZone[row.id]?.length ?? 0) > 0 ? <Fixes fixes={fixesByZone[row.id]!} build={build} /> : null}
            </span>
            {row.canScan || (fixesByZone[row.id]?.length ?? 0) > 0 ? null : (
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
      <SimplifiedNote entries={simplifiedForObjectives(mission)} />
    </section>
  );
}
