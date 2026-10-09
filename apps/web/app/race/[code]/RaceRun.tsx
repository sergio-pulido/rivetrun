'use client';

import type { GhostTrace } from '@rivetrun/contracts';
import { compileTrack, MISSIONS } from '@rivetrun/sim';
import RunCanvas from '@/game/RunCanvas';
import { useRunView } from '@/game/runFeed';
import { rankPlayers, type RacePlayer, type RaceSnapshot } from '../_lib/protocol';
import { Ranking } from '../_lib/Ranking';
import { useRaceRun, type RaceIdentity } from './useRaceRun';

const NO_GHOSTS: readonly GhostTrace[] = [];

interface RaceRunProps {
  readonly snapshot: RaceSnapshot;
  readonly identity: RaceIdentity;
  readonly me: RacePlayer;
  readonly priority: number;
  readonly clockOffsetMs: number;
}

/**
 * The heavy half of the phone's race page: this phone's sim loop and the 3D run view.
 * Loaded on demand by RaceClient (next/dynamic), so three.js is never part of the join page.
 */
export default function RaceRun({ snapshot, identity, me, priority, clockOffsetMs }: RaceRunProps) {
  const feed = useRaceRun(snapshot, identity, priority, clockOffsetMs);
  const view = useRunView(feed);
  const mission = MISSIONS[snapshot.missionId];
  const trackLengthM = compileTrack(mission.track).lengthM;
  const racing = snapshot.status === 'racing' || snapshot.status === 'finished';
  const place = rankPlayers(snapshot.players).findIndex((player) => player.id === me.id) + 1;
  const over = snapshot.status === 'finished';
  // Once this robot's run has ended, the HUD makes room for the result card.
  const showResult = over || (view.done && me.done);
  const outcome = view.outcome;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-ink">
      {racing ? <RunCanvas mission={mission} build={me.build} feed={feed} ghosts={NO_GHOSTS} hud={!showResult} /> : null}

      {showResult ? (
        <div className="absolute inset-x-3 top-1/2 z-20 mx-auto max-w-md -translate-y-1/2">
          <div className="rr-panel p-4">
            <p className="rr-label text-blueprint">{over ? 'Final order' : 'You are done. Others are still racing.'}</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="font-mono text-5xl font-black leading-none text-safety">
                P{place}
                <span className="ml-2 text-base font-bold text-dim">of {snapshot.players.length}</span>
              </p>
              <p className={`text-right font-mono text-sm font-bold ${me.finished ? 'text-ok' : 'text-bad'}`}>
                {me.finished ? 'FINISHED' : 'DID NOT FINISH'}
                {outcome ? (
                  <span className="block text-xs font-normal text-dim">
                    {Math.round(outcome.score)} pts · dmg {Math.round(outcome.damagePct)} %
                  </span>
                ) : null}
              </p>
            </div>
            {outcome?.why ? <p className="mt-2 text-sm text-slate-200">{outcome.why}</p> : null}
            <div className="mt-3 max-h-[38vh] overflow-y-auto">
              <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} />
            </div>
            <p className="mt-3 text-center font-mono text-xs text-dim">
              {over ? 'Stay here: the host can start the next race.' : 'Times are wall-clock: Jev’s thinking counts.'}
            </p>
          </div>
        </div>
      ) : racing ? (
        /* Mini live ranking, under the top bar. */
        <div className="pointer-events-none absolute right-2.5 z-20 w-44" style={{ top: 'calc(max(10px, env(safe-area-inset-top)) + 126px)' }}>
          <div className="rounded-lg border border-slate-line bg-slate-ink/85 p-1.5 backdrop-blur">
            <p className="rr-label mb-1 px-1">
              P{place} of {snapshot.players.length}
            </p>
            <Ranking players={snapshot.players} trackLengthM={trackLengthM} meId={me.id} limit={3} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
