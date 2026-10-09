'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { MISSION_IDS, MISSIONS, whyLine } from '@rivetrun/sim';
import { DNF_LABEL } from '@/game/palette';
import { useBuildStore } from '@/state/build';
import { LOCKED_PARTS, isUnlocked, useProgressStore } from '@/state/progress';
import { useRunStore, type RunResult } from '@/state/run';
import { Icon, type IconName } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { Stars } from '@/ui/Stars';
import { DuelTable } from './DuelTable';
import { ScoreBreakdown } from './ScoreBreakdown';
import { downloadEpisode, share } from './share';
import { SubmitRun } from './SubmitRun';
import { useCountUp } from './useCountUp';

const SHARE_NOTE = { shared: null, copied: 'Copied to the clipboard.', failed: 'Sharing is blocked in this browser.' } as const;

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
        {next ? `${next.name} ${Math.min(points, next.unlockPoints)}/${next.unlockPoints}` : `${points.toLocaleString('en-US')} pts banked`}
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
  const [shareNote, setShareNote] = useState<string | null>(null);
  const tenths = useCountUp(Math.round(outcome.timeS * 10));
  const percent = useCountUp(Math.round(outcome.progressFraction * 100));
  const next = MISSION_IDS[MISSION_IDS.indexOf(mission.id) + 1];
  const headline = outcome.finished ? 'Finished' : outcome.dnfReason ? DNF_LABEL[outcome.dnfReason] : 'Did not finish';

  // Pays the points once per episode; the store ignores an episode it has already paid.
  useEffect(() => {
    const paid = award(episode);
    if (paid > 0) setEarned(paid);
  }, [award, episode]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-3 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
      <header className="rr-rise relative flex flex-col items-center gap-1">
        <Link href="/" aria-label="Home" className="rr-iconbtn absolute right-0 top-0">
          <Icon name="close" />
        </Link>
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
            {' '}
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
        <Link href={`/run/${mission.id}`} className={TILE}>
          <Tile icon="retry">RETRY</Tile>
        </Link>
        <Link href="/workshop" className={`${TILE} ${outcome.finished ? '' : '!border-orange !text-orange-soft'}`}>
          <Tile icon="wrench">UPGRADE</Tile>
        </Link>
        <button
          type="button"
          className={TILE}
          onClick={() => {
            void share(episode).then((kind) => setShareNote(SHARE_NOTE[kind]));
          }}
        >
          <Tile icon="share">SHARE</Tile>
        </button>
        <button type="button" className={TILE} onClick={() => downloadEpisode(episode)}>
          <Tile icon="download">EPISODE</Tile>
        </button>
      </nav>
      {shareNote ? (
        <p role="status" className="text-center font-mono text-[11px] text-muted">
          {shareNote}
        </p>
      ) : null}
    </main>
  );
}

export function Result() {
  const result = useRunStore((store) => store.result);
  return result ? <Summary result={result} /> : <NoRun />;
}
