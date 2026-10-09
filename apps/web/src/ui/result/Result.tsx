'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MISSION_IDS, MISSIONS, whyLine } from '@rivetrun/sim';
import { DNF_LABEL } from '@/game/palette';
import { useBuildStore } from '@/state/build';
import { useProgressStore } from '@/state/progress';
import { useRunStore, type RunResult } from '@/state/run';
import { buildName } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { Stars } from '@/ui/Stars';
import { DuelTable } from './DuelTable';
import { ScoreBreakdown } from './ScoreBreakdown';
import { downloadEpisode, share } from './share';
import { SubmitRun } from './SubmitRun';
import { useCountUp } from './useCountUp';

const SHARE_NOTE = { shared: null, copied: 'Copied to the clipboard.', failed: 'Sharing is blocked in this browser.' } as const;

function NoRun() {
  const missionId = useBuildStore((store) => store.missionId);
  return (
    <Shell back="/" kicker="Result" title="No run yet">
      <section className="rr-panel mt-6 flex flex-col items-center gap-4 p-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full border border-slate-line text-safety">
          <Icon name="flag" size={26} />
        </span>
        <p className="text-[15px] leading-snug text-slate-300">Results live here after a run. They are kept in memory, so a page reload clears them.</p>
        <Link href={`/run/${missionId}`} className="rr-btn rr-btn-primary w-full">
          <Icon name="play" size={18} />
          Run {missionId}
        </Link>
      </section>
    </Shell>
  );
}

function Summary({ result }: { readonly result: RunResult }) {
  const { episode } = result;
  const { outcome } = episode;
  const mission = MISSIONS[result.missionId];
  const award = useProgressStore((store) => store.award);
  const [earned, setEarned] = useState(0);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const score = useCountUp(outcome.score);
  const next = MISSION_IDS[MISSION_IDS.indexOf(mission.id) + 1];
  const headline = outcome.finished ? 'Finished' : outcome.dnfReason ? DNF_LABEL[outcome.dnfReason] : 'Did not finish';

  // Pays the points once per episode; the store ignores an episode it has already paid.
  useEffect(() => {
    const paid = award(episode);
    if (paid > 0) setEarned(paid);
  }, [award, episode]);

  return (
    <Shell
      back="/"
      kicker={`${mission.id} · result`}
      title={mission.name}
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/workshop" className={`rr-btn ${outcome.finished ? 'rr-btn-secondary' : 'rr-btn-primary'}`}>
            <Icon name="wrench" size={18} />
            Upgrade
          </Link>
          <Link href={`/run/${mission.id}`} className={`rr-btn ${outcome.finished ? 'rr-btn-primary' : 'rr-btn-secondary'}`}>
            <Icon name="retry" size={18} />
            Retry
          </Link>
        </div>
      }
    >
      <section className="rr-panel rr-rise relative overflow-hidden p-4 text-center">
        <div className={`absolute inset-x-0 top-0 h-1.5 ${outcome.finished ? 'bg-ok' : 'rr-hazard'}`} />
        <div className={`rr-label mt-2 !text-xs ${outcome.finished ? '!text-ok' : '!text-bad'}`}>{headline}</div>
        <div className="mt-3 flex items-end justify-center gap-2 leading-none">
          <span className="font-mono text-[64px] font-bold tabular-nums tracking-tight text-safety drop-shadow-[0_0_24px_rgb(255_106_19/0.45)]">{score}</span>
          <span className="pb-2.5 font-mono text-sm text-dim">pts</span>
        </div>
        <div className="mt-3 flex justify-center">
          <Stars count={outcome.stars} size={34} animate />
        </div>
        <p className="mt-2 font-mono text-[10px] text-dim">
          1★ finish · 2★ at {mission.starThreshold} pts · 3★ with zero damage
        </p>
        <p className="mt-3.5 rounded-xl border border-slate-line bg-slate-deep/70 px-3 py-2.5 text-[15px] font-medium leading-snug">{whyLine(episode)}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="rr-chip">{buildName(episode.build)}</span>
          <span className="rr-chip">€{outcome.costEur}</span>
          {earned > 0 ? (
            <span className="rr-chip !border-safety/50 !text-safety-hi">
              <Icon name="bolt" size={12} />+{earned} pts banked
            </span>
          ) : null}
        </div>
      </section>

      <div className="rr-rise" style={{ ['--i' as string]: 1 }}>
        <DuelTable episode={episode} ghosts={result.ghosts} />
      </div>

      <div className="rr-rise" style={{ ['--i' as string]: 2 }}>
        <ScoreBreakdown outcome={outcome} />
      </div>

      <div className="rr-rise" style={{ ['--i' as string]: 3 }}>
        <SubmitRun episode={episode} leaderboard={mission.leaderboard} />
      </div>

      <div className="rr-rise grid grid-cols-2 gap-2.5" style={{ ['--i' as string]: 4 }}>
        <button
          type="button"
          className="rr-btn rr-btn-secondary text-sm"
          onClick={() => {
            void share(episode).then((kind) => setShareNote(SHARE_NOTE[kind]));
          }}
        >
          <Icon name="share" size={18} />
          Share
        </button>
        <button type="button" className="rr-btn rr-btn-secondary text-sm" onClick={() => downloadEpisode(episode)}>
          <Icon name="download" size={18} />
          Episode JSON
        </button>
      </div>
      {shareNote ? (
        <p role="status" className="-mt-1 text-center font-mono text-[11px] text-dim">
          {shareNote}
        </p>
      ) : null}

      {next && outcome.finished ? (
        <Link href={`/brief/${next}`} className="rr-panel flex items-center justify-between gap-3 p-3 active:translate-y-0.5">
          <span>
            <span className="rr-label">Next mission</span>
            <span className="mt-1.5 block text-base font-semibold">
              {next} · {MISSIONS[next].name}
            </span>
          </span>
          <span className="text-safety">
            <Icon name="next" size={22} />
          </span>
        </Link>
      ) : null}
    </Shell>
  );
}

export function Result() {
  const result = useRunStore((store) => store.result);
  return result ? <Summary result={result} /> : <NoRun />;
}
