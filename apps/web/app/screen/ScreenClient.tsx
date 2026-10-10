'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { POLICY_LABEL, formatDamage, formatScore, formatTime } from '../leaderboard/_lib/format';
import { useLeaderboard } from '../leaderboard/_lib/useLeaderboard';
import { RaceSnapshotSchema } from '../race/_lib/protocol';
import { MISSIONS } from '@rivetrun/sim';
import { AttractCanvas } from '@/game';
import { AppHeader } from '@/ui/AppHeader';
import { Side } from './Side';
import styles from './screen.module.css';

const TOP_ROWS = 5;
/** With this many rows or fewer the board leaves room under it: the demo loop plays there (docs/DEMO_PLAN.md: idle → attract loop). */
const ATTRACT_MAX_ROWS = 6;
const ROOM_MISSION = MISSIONS.M5;

/** Opens a Room Race room and switches this screen to it. */
function RoomRaceButton() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');
  const open = async (): Promise<void> => {
    setState('opening');
    try {
      const response = await fetch('/api/race', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error(`create room responded ${response.status}`);
      const room = RaceSnapshotSchema.parse(await response.json());
      router.push(`/screen?room=${room.code}`);
    } catch {
      setState('failed');
    }
  };
  return (
    <button type="button" onClick={() => void open()} disabled={state === 'opening'} className={styles.button}>
      {state === 'opening' ? 'Opening…' : state === 'failed' ? 'Retry: no room opened' : 'Start a Room Race'}
    </button>
  );
}

/** /screen with no room open: the Room Challenge leaderboard on the same board as the race view. */
export function ScreenClient({ siteUrl }: { readonly siteUrl: string }) {
  const feed = useLeaderboard('M5');
  const live = feed.status === 'live';
  const attract = feed.status !== 'loading' && feed.entries.length <= ATTRACT_MAX_ROWS;
  return (
    <div className={styles.stage}>
      <div className={styles.board}>
        <AppHeader variant="logo" className={`${styles.logo} min-h-0!`} />
        <div className={styles.main}>
          <div className={styles.header}>
            <div className={styles.titleRow}>
              <span className={`${styles.dot} ${live ? '' : styles.dotIdle}`} />
              <span className={styles.title}>ROOM CHALLENGE{feed.status === 'offline' ? ' · OFFLINE' : ''}</span>
              <span className={styles.chip}>M5 · rain · top 20</span>
            </div>
            <div className={styles.controls}>
              <RoomRaceButton />
            </div>
          </div>
          <div className={styles.captions} style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <div className={styles.captionTrack}>
              <span>Best score per nickname</span>
              <span>Refreshes every 5 s</span>
            </div>
          </div>
          {feed.entries.length === 0 ? (
            <div className={styles.emptyLane}>
              {feed.status === 'loading' ? 'Reading the board…' : 'No runs yet. The first plate is up for grabs.'}
            </div>
          ) : (
            <div className={`${styles.scores} ${attract ? styles.scoresShort : ''}`} aria-live="polite">
              {feed.entries.map((entry) => (
                <div key={`${entry.rank}-${entry.nickname}`} className={styles.scoreRow}>
                  <span className={`${styles.bigPos} ${entry.rank <= 3 ? styles.posTop : ''}`}>{entry.rank}</span>
                  <span className={styles.scoreNick}>{entry.nickname}</span>
                  <span className={styles.scoreMeta}>
                    {POLICY_LABEL[entry.policy]} · {formatTime(entry.timeS)} · dmg {formatDamage(entry.damagePct)}
                  </span>
                  <span className={styles.scoreValue}>{formatScore(entry.score)}</span>
                </div>
              ))}
            </div>
          )}
          {attract ? (
            // A short board leaves the wall half empty: the four presets replay the Room Challenge track under it.
            <div className={`${styles.attract} ${styles.attractIdle}`}>
              <AttractCanvas mission={ROOM_MISSION} legend={false} />
              <span className={styles.attractNote}>Demo replay · scan the code and beat these robots</span>
            </div>
          ) : null}
        </div>

        <Side
          joinLabel="SCAN TO PLAY"
          joinCode="PLAY"
          joinUrl={siteUrl}
          episodes={feed.episodes}
          stat={`${feed.entries.length} on the board`}
        >
          <div className={styles.orderPanel}>
            <span className={styles.label}>Scores to beat</span>
            {feed.entries.length === 0 ? <span className={styles.orderEmpty}>Nobody yet.</span> : null}
            {feed.entries.slice(0, TOP_ROWS).map((entry) => (
              <div key={`${entry.rank}-${entry.nickname}`} className={styles.orderRow}>
                <span className={`${styles.pos} ${entry.rank <= 3 ? styles.posTop : ''}`}>{entry.rank}</span>
                <span className={styles.orderNick}>{entry.nickname}</span>
                <span className={styles.gap}>{formatScore(entry.score)}</span>
              </div>
            ))}
          </div>
        </Side>
      </div>
    </div>
  );
}
