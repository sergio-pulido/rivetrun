'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GhostTrace } from '@rivetrun/contracts';
import { MISSION_IDS, MISSIONS, compileTrack, whyLine } from '@rivetrun/sim';
import { DNF_LABEL } from '@/game/palette';
import { useBuildStore } from '@/state/build';
import { usePersonalBestsStore } from '@/state/personalBests';
import { AppHeader } from '@/ui/AppHeader';
import { newBestLine, type BestVerdict } from '@/ui/bests/bests';
import { buildName, buildStats } from '@/ui/buildStats';
import { formatSeconds } from '@/ui/format';
import { LOCKED_PARTS, isUnlocked, useProgressStore } from '@/state/progress';
import { useRunStore, type RunResult } from '@/state/run';
import { Icon, type IconName } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { Stars } from '@/ui/Stars';
import { breakdownView } from './breakdown';
import { decisionSummary } from './decisions';
import { DuelTable } from './DuelTable';
import { ReactionDuel } from './ReactionDuel';
import { RunBreakdown } from './RunBreakdown';
import { pairWithGhost, parseReactions, reactionDuel } from './reactions';
import { ScoreBreakdown } from './ScoreBreakdown';
import { downloadEpisode, downloadShareCard, share, type ShareResult } from './share';
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
  const recordBest = usePersonalBestsStore((store) => store.record);
  const [bestVerdict, setBestVerdict] = useState<BestVerdict | null>(null);
  const [shared, setShared] = useState<ShareResult | null>(null);
  // Retry deploys the robot on the bench now, which may have changed since this run.
  const overBudgetEur = buildStats(useBuildStore((store) => store.build)).overBudgetEur;
  // Counts up to the formatted time, so the headline lands on the same figure as the table and the breakdown.
  const tenths = useCountUp(Math.round(Number(formatSeconds(outcome.timeS)) * 10));
  const percent = useCountUp(Math.round(outcome.progressFraction * 100));
  const next = MISSION_IDS[MISSION_IDS.indexOf(mission.id) + 1];
  // What the brain was asked along the way, over the distance the robot covered.
  const decisions = decisionSummary(episode.decisions, outcome.progressFraction * compileTrack(mission.track).lengthM);
  // The sim's reaction metric (Drive mode): the player's thumbs against Jev's latency on the same events, paired by event id
  // through the Jev ghost's decision log; an event the ghost did not answer itself falls back to its median for the run.
  const duel = useMemo(() => {
    const jevGhost = result.ghosts.find((ghost) => ghost.policy === 'jev');
    const events = pairWithGhost(parseReactions(outcome.breakdown?.reactions) ?? [], jevGhost?.log ?? []);
    return reactionDuel(events, jevGhost?.medianLatencyMs ?? null);
  }, [result.ghosts, outcome.breakdown]);
  const breakdown = breakdownView(outcome.breakdown);
  const headline = outcome.finished ? 'Finished' : outcome.dnfReason ? DNF_LABEL[outcome.dnfReason] : 'Did not finish';

  // Pays the points once per episode; the store ignores an episode it has already paid.
  useEffect(() => {
    const paid = award(episode);
    if (paid > 0) setEarned(paid);
  }, [award, episode]);

  // Counts the run towards the personal best for this mission and robot, once. The player's own trace (when the run
  // page hands it over) is kept with a new best so it can be raced as a ghost.
  useEffect(() => {
    const trace = (result as RunResult & { readonly trace?: GhostTrace }).trace;
    const recorded = recordBest(episode, buildName(episode.build), episode.policy === 'human' ? trace : undefined);
    if (!recorded.repeat) setBestVerdict(newBestLine(outcome, recorded));
  }, [recordBest, episode, outcome, result]);

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

      {bestVerdict ? (
        <p
          className={`rr-pop rounded-[14px] border px-3 py-2.5 text-[13px] leading-snug ${bestVerdict.fresh ? 'border-orange bg-orange-deep text-text' : 'border-line bg-panel-2 text-text-2'}`}
          role="status"
        >
          {bestVerdict.fresh ? <span className="mr-1.5 font-mono text-[10px] font-semibold tracking-[1.5px] text-orange">NEW PERSONAL BEST · </span> : null}
          {bestVerdict.text}
        </p>
      ) : null}

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

      {decisions ? (
        <p className="rr-rise rounded-[14px] border border-cyan-line bg-cyan-deep px-3 py-2.5 text-[13px] leading-snug text-cyan-soft" style={{ ['--i' as string]: 1 }}>
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-cyan">BRAIN · </span>
          {decisions}
        </p>
      ) : null}

      {duel ? (
        <div className="rr-rise" style={{ ['--i' as string]: 1 }}>
          <ReactionDuel duel={duel} />
        </div>
      ) : null}

      <div className="rr-rise" style={{ ['--i' as string]: 2 }}>
        <DuelTable episode={episode} ghosts={result.ghosts} briefing={briefing} />
      </div>

      {breakdown ? (
        <div className="rr-rise" style={{ ['--i' as string]: 3 }}>
          <RunBreakdown view={breakdown} />
        </div>
      ) : null}

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
            void share(episode, result.ghosts).then(setShared);
          }}
        >
          <Tile icon="share">SHARE</Tile>
        </button>
        <button type="button" className={TILE} onClick={() => downloadEpisode(episode)}>
          <Tile icon="download">EPISODE</Tile>
        </button>
      </nav>
      {shared && shared.outcome !== 'shared' ? (
        // This browser shared no image: the card can still be saved and sent by hand.
        <button type="button" onClick={() => void downloadShareCard(episode, result.ghosts)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-3 font-mono text-[11px] font-medium tracking-[1px] text-text active:bg-panel-2">
          <Icon name="download" size={16} />
          SAVE THE SHARE CARD (PNG)
        </button>
      ) : null}
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
