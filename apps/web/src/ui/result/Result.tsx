'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { MISSION_IDS, MISSIONS, whyLine } from '@rivetrun/sim';
import { DNF_LABEL } from '@/game/palette';
import { useBuildStore } from '@/state/build';
import { AppHeader } from '@/ui/AppHeader';
import { buildStats } from '@/ui/buildStats';
import { formatSeconds } from '@/ui/format';
import { LOCKED_PARTS, isUnlocked, useProgressStore } from '@/state/progress';
import { useRunStore, type RunResult } from '@/state/run';
import { Icon, type IconName } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { Stars } from '@/ui/Stars';
import { DuelTable } from './DuelTable';
import { ScoreBreakdown } from './ScoreBreakdown';
import { downloadEpisode, share, type ShareResult } from './share';
import { SubmitRun } from './SubmitRun';
import { useCountUp } from './useCountUp';


const TILE = 'flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border border-line-3 font-mono text-[10px] font-medium tracking-[1px] text-text active:bg-panel-2';

function Tile({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <>
      <Icon name={icon} size={18} />
      {children}
    </>
  );
}

function NoRun() {
  const missionId = useBuildStore((store) => store.missionId);
  return (
    <Shell back="/" title="Result">
      <section className="rr-card mt-6 flex flex-col items-center gap-4 p-6 text-center">
        <p className="text-[15px] leading-snug text-text-2">Results live here after a run. They are kept in memory, so a page reload clears them.</p>
        <Link href={`/run/${missionId}`} className="rr-btn rr-btn-primary w-full">
          Run mission 0{missionId.slice(1)}
          <Icon name="next" size={18} />
        </Link>
      </section>
    </Shell>
  );
}

/** Points banked by this run and how far they go towards the cheapest part still locked. */
function PointsRow({ earned }: { readonly earned: number }) {
  const points = useProgressStore((store) => store.points);
  const unlocked = useProgressStore((store) => store.unlocked);
  const next = [...LOCKED_PARTS].filter((part) => !isUnlocked(unlocked, part.id)).sort((a, b) => a.unlockPoints - b.unlockPoints)[0];
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-[13px] font-semibold text-orange-soft">+{earned} PTS</span>
      <div className="rr-meter !h-1.5 flex-1">
        <span style={{ width: `${next ? Math.min(100, (points / next.unlockPoints) * 100) : 100}%`, backgroundColor: 'var(--color-orange)' }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted">
        {!next ? `${points.toLocaleString('en-US')} pts banked` : points >= next.unlockPoints ? `${next.name} ready to unlock` : `${next.name} ${points}/${next.unlockPoints}`}
      </span>
    </div>
  );
}

function Summary({ result }: { readonly result: RunResult }) {
  const { episode } = result;
  const { outcome } = episode;
  const mission = MISSIONS[result.missionId];
  const briefing = useBuildStore((store) => store.briefing);
  const award = useProgressStore((store) => store.award);
  const [earned, setEarned] = useState(0);
  const [shared, setShared] = useState<ShareResult | null>(null);
  // Retry deploys the robot on the bench now, which may have changed since this run.
  const overBudgetEur = buildStats(useBuildStore((store) => store.build)).overBudgetEur;
  // Counts up to the formatted time, so the headline lands on the same figure as the table and the breakdown.
  const tenths = useCountUp(Math.round(Number(formatSeconds(outcome.timeS)) * 10));
  const percent = useCountUp(Math.round(outcome.progressFraction * 100));
  const next = MISSION_IDS[MISSION_IDS.indexOf(mission.id) + 1];
  const headline = outcome.finished ? 'Finished' : outcome.dnfReason ? DNF_LABEL[outcome.dnfReason] : 'Did not finish';

  // Pays the points once per episode; the store ignores an episode it has already paid.
  useEffect(() => {
    const paid = award(episode);
    if (paid > 0) setEarned(paid);
  }, [award, episode]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-3 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))]">
      <AppHeader back="/" label="Result" />
      <header className="flex flex-col items-center gap-1">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[2px] text-muted">
          Mission 0{mission.id.slice(1)} · {mission.name}
        </span>
        <h1 className={`font-display text-xl font-bold uppercase tracking-[4px] ${outcome.finished ? 'text-orange' : 'text-bad'}`}>{headline}</h1>
        <span className="font-mono text-[54px] font-semibold leading-none tabular-nums">
          {outcome.finished ? (tenths / 10).toFixed(1) : percent}
          <span className="text-[22px] text-muted">{outcome.finished ? ' s' : ' % of track'}</span>
        </span>
        <div className="mt-1">
          <Stars count={outcome.stars} size={30} animate />
        </div>
      </header>

      <p className="rr-rise rounded-[14px] border border-line bg-panel-2 px-3 py-2.5 text-[13px] leading-snug text-[#D7DBE0]" style={{ ['--i' as string]: 1 }}>
        <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">WHY · </span>
        {whyLine(episode)}
        {outcome.finished && outcome.stars < 3 ? (
          <span className="text-muted">
            {'. '}
            {outcome.stars < 2 ? `Second star: ${mission.starThreshold} points.` : 'Third star: finish with zero damage.'}
          </span>
        ) : null}
      </p>

      <div className="rr-rise" style={{ ['--i' as string]: 2 }}>
        <DuelTable episode={episode} ghosts={result.ghosts} briefing={briefing} />
      </div>

      <div className="rr-rise" style={{ ['--i' as string]: 3 }}>
        <ScoreBreakdown outcome={outcome} />
      </div>

      <div className="rr-rise" style={{ ['--i' as string]: 4 }}>
        <PointsRow earned={earned} />
      </div>

      <div className="rr-rise" style={{ ['--i' as string]: 5 }}>
        <SubmitRun episode={episode} leaderboard={mission.leaderboard} />
      </div>

      {next && outcome.finished ? (
        <Link href={`/brief/${next}`} className="flex items-center justify-between rounded-xl border border-dashed border-line-3 px-3 py-2.5 text-xs text-[#B8C0C9]">
          <span>
            Next: <span className="font-mono text-text">MISSION 0{next.slice(1)}</span> · {MISSIONS[next].name}
          </span>
          <Icon name="next" size={16} className="text-orange" />
        </Link>
      ) : null}

      <nav className="mt-auto grid grid-cols-4 gap-2 pt-1" aria-label="After the run">
        {overBudgetEur > 0 ? (
          <Link href="/workshop" className={`${TILE} !border-bad/60 !text-bad`} title={`The robot on the bench is €${overBudgetEur} over budget`}>
            <Tile icon="retry">OVER €{overBudgetEur}</Tile>
          </Link>
        ) : (
          <Link href={`/run/${mission.id}`} className={TILE}>
            <Tile icon="retry">RETRY</Tile>
          </Link>
        )}
        <Link href="/workshop" className={`${TILE} ${outcome.finished ? '' : '!border-orange !text-orange-soft'}`}>
          <Tile icon="wrench">UPGRADE</Tile>
        </Link>
        <button
          type="button"
          className={TILE}
          onClick={() => {
            void share(episode).then(setShared);
          }}
        >
          <Tile icon="share">SHARE</Tile>
        </button>
        <button type="button" className={TILE} onClick={() => downloadEpisode(episode)}>
          <Tile icon="download">EPISODE</Tile>
        </button>
      </nav>
      {shared?.outcome === 'copied' ? (
        <p role="status" className="text-center font-mono text-[11px] text-muted">
          Copied to the clipboard.
        </p>
      ) : null}
      {shared?.outcome === 'manual' ? (
        <label className="flex flex-col gap-1.5">
          <span role="status" className="font-mono text-[11px] text-muted">
            This browser won&apos;t share or copy for you. Select the text and copy it:
          </span>
          <textarea
            readOnly
            rows={3}
            value={shared.message}
            onFocus={(event) => event.target.select()}
            className="resize-none rounded-xl border border-line-3 bg-panel-2 px-3 py-2 text-[13px] leading-snug outline-none focus:border-orange"
          />
        </label>
      ) : null}
    </main>
  );
}

export function Result() {
  const result = useRunStore((store) => store.result);
  return result ? <Summary result={result} /> : <NoRun />;
}
