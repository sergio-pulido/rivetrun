'use client';

import Link from 'next/link';
import type { Mission, MissionId } from '@rivetrun/contracts';
import { MISSION_IDS, PARTS_BY_ID } from '@rivetrun/sim';
import { useWorkshopUi } from '@/state/workshop';
import { Icon } from '@/ui/Icon';
import type { TestRunResult } from './useTestRun';
import { VERDICT_LOOK } from './verdict';

const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' } as const;
const FRAME = { ok: 'border-ok/40', warn: 'border-warn/40', bad: 'border-bad/60' } as const;

interface TestRunProps {
  readonly mission: Mission;
  readonly result: TestRunResult;
  /** Lets the player test against another mission (the Workshop). */
  readonly onMission?: (id: MissionId) => void;
}

/**
 * "Test run": a dry run of the build on the mission. Closed, it is one button; open, it says where the build fails
 * and why, and which parts would fix it. It only informs: the screen's own button into the run is untouched.
 */
export function TestRun({ mission, result, onMission }: TestRunProps) {
  const open = useWorkshopUi((store) => store.testRun);
  const setOpen = useWorkshopUi((store) => store.setTestRun);
  const setSlot = useWorkshopUi((store) => store.setSlot);
  const { report, fixes } = result;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rr-btn rr-btn-secondary w-full !min-h-12 !bg-transparent">
        <Icon name="flag" size={18} />
        Test run · {mission.name}
      </button>
    );
  }

  return (
    <section className={`rr-card rr-pop flex flex-col gap-2.5 p-3 ${report ? FRAME[report.tone] : ''}`} aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h3 className="rr-label">Test run · {mission.name}</h3>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close the test run" className="-m-2 grid h-11 w-11 place-items-center text-muted">
          <Icon name="close" size={16} />
        </button>
      </div>

      {onMission ? (
        <div className="rr-scroll-x -mx-3 flex gap-1.5 px-3" role="group" aria-label="Mission to test on">
          {MISSION_IDS.map((id) => (
            <button key={id} type="button" aria-pressed={id === mission.id} onClick={() => onMission(id)} className={`rr-chip !h-9 shrink-0 !px-3 ${id === mission.id ? 'rr-chip-on' : ''}`}>
              {id}
            </button>
          ))}
        </div>
      ) : null}

      {report ? (
        <>
          <div>
            <p className={`font-display text-xl font-semibold leading-tight ${TONE[report.tone]}`}>{report.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-text-2">{report.detail}</p>
          </div>
          {report.trouble.length > 0 ? (
            <ul className="flex flex-col gap-1 border-t border-line pt-2">
              {report.trouble.map((entry) => (
                <li key={`${entry.atM}:${entry.note}`} className="flex items-baseline gap-2 text-xs leading-snug text-text-2">
                  <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">{Math.round(entry.atM)} m</span>
                  <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[1px] ${VERDICT_LOOK[entry.verdict].text}`}>{VERDICT_LOOK[entry.verdict].label}</span>
                  <span className="min-w-0">{entry.note}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {fixes.length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-line pt-2">
              <span className="rr-label !text-orange-soft">{report.tone === 'bad' ? 'Fit to fix' : 'Would help'}</span>
              {fixes.map((fix) => (
                <div key={fix.capability} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-text-2">{fix.name.charAt(0).toUpperCase() + fix.name.slice(1)}:</span>
                  {fix.partIds.map((id) => {
                    const part = PARTS_BY_ID.get(id);
                    return part ? (
                      <Link key={id} href={`/workshop/part/${id}`} onClick={() => setSlot(part.slot)} className="rr-chip !h-9 !border-orange !px-2.5 !text-orange-soft">
                        {part.name}
                        <Icon name="next" size={13} />
                      </Link>
                    ) : null;
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-[13px] leading-snug text-muted">The test run has nothing to say about this build.</p>
      )}

      <p className="text-[11px] leading-snug text-faint">A dry run by the fixed rules on this mission&apos;s seed. Your own run can go better or worse.</p>
    </section>
  );
}
