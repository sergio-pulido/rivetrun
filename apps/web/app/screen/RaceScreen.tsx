'use client';

import type { MissionId } from '@rivetrun/contracts';
import { MISSION_IDS, MISSIONS } from '@rivetrun/sim';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DNF_LABEL } from '@/game/palette';
import { rankPlayers, type RacePlayer, type RaceSnapshot } from '../race/_lib/protocol';
import { postRaceAction, useRaceRoom, useServerNow } from '../race/_lib/useRaceRoom';
import { RaceTrack } from './RaceTrack';
import { Side, useEpisodeCount } from './Side';
import styles from './screen.module.css';

interface RaceScreenProps {
  readonly code: string;
  /** Origin phones can reach (LAN address on localhost). */
  readonly siteUrl: string;
}

const STATUS_TITLE = { lobby: 'LOBBY', countdown: 'GET READY', racing: 'LIVE', finished: 'FINISH' } as const;
const ORDER_ROW_MAX = 30;
const ORDER_ROW_MIN = 20;
/** A full room does not fit the panel: it lists the front of the field and counts the rest. */
const ORDER_ROWS_MAX = 12;
/** Height the order rows may share on the 720-high board. */
const ORDER_HEIGHT = 330;

/** 00:41.2 */
function clock(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** Measured gaps only: metres behind the leader while racing, seconds behind the winner once finished. */
function gapText(player: RacePlayer, leader: RacePlayer, racing: boolean): string {
  if (player.done && !player.finished) return 'DNF';
  if (player.finished && player.raceMs !== null) {
    if (player.id === leader.id || leader.raceMs === null) return `${(player.raceMs / 1000).toFixed(1)} s`;
    return `+${((player.raceMs - leader.raceMs) / 1000).toFixed(1)} s`;
  }
  if (!racing) return 'ready';
  if (player.id === leader.id) return 'leader';
  if (leader.finished) return 'racing';
  return `+${Math.max(0, leader.x - player.x).toFixed(1)} m`;
}

function Order({ snapshot }: { readonly snapshot: RaceSnapshot }) {
  const ranked = rankPlayers(snapshot.players);
  const leader = ranked[0];
  const racing = snapshot.status === 'racing' || snapshot.status === 'finished';
  const shown = ranked.slice(0, ORDER_ROWS_MAX);
  const row = Math.max(ORDER_ROW_MIN, Math.min(ORDER_ROW_MAX, Math.floor(ORDER_HEIGHT / Math.max(1, shown.length)) - 6));
  return (
    <div className={styles.orderPanel}>
      <span className={styles.label}>
        {snapshot.status === 'finished' ? 'Finish order' : snapshot.status === 'lobby' ? 'On the grid' : 'Live order'}
      </span>
      {!leader ? <span className={styles.orderEmpty}>Nobody yet.</span> : null}
      {leader
        ? shown.map((player, index) => {
            const out = player.done && !player.finished;
            return (
              <div key={player.id} className={styles.orderRow} style={{ ['--row' as string]: row }}>
                <span className={`${styles.pos} ${out ? styles.posOut : index < 3 ? styles.posTop : ''}`}>{out ? '—' : index + 1}</span>
                <span className={styles.orderNick}>{player.nickname}</span>
                <span className={styles.gap} title={out && player.dnfReason ? DNF_LABEL[player.dnfReason] : undefined}>
                  {gapText(player, leader, racing)}
                </span>
              </div>
            );
          })
        : null}
      {ranked.length > shown.length ? <span className={styles.orderEmpty}>+ {ranked.length - shown.length} more behind</span> : null}
    </div>
  );
}

function HostBar({ snapshot, onError }: { readonly snapshot: RaceSnapshot; readonly onError: (message: string | null) => void }) {
  const [missionId, setMissionId] = useState<MissionId>(snapshot.missionId);
  const [starting, setStarting] = useState(false);
  const start = async (): Promise<void> => {
    setStarting(true);
    onError(null);
    try {
      await postRaceAction(snapshot.code, { action: 'start', missionId });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not start the race.');
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className={styles.hostBar}>
      <div className={styles.hostBar} role="radiogroup" aria-label="Track">
        {MISSION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={missionId === id}
            onClick={() => setMissionId(id)}
            className={`${styles.pick} ${missionId === id ? styles.pickOn : ''}`}
          >
            {id} {MISSIONS[id].name}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void start()}
        disabled={snapshot.players.length === 0 || starting}
        className={`${styles.button} ${styles.spacer}`}
      >
        {starting ? 'Starting…' : 'Start the race'}
      </button>
    </div>
  );
}

export function RaceScreen({ code, siteUrl }: RaceScreenProps) {
  const router = useRouter();
  const { snapshot, link, clockOffsetMs } = useRaceRoom(code);
  const now = useServerNow(clockOffsetMs);
  const episodes = useEpisodeCount();
  const [error, setError] = useState<string | null>(null);
  const joinUrl = `${siteUrl}/race/${code}`;

  if (link === 'missing' || !snapshot) {
    return (
      <div className={styles.stage}>
        <div className={styles.board} style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div className={styles.notice}>
            {link === 'missing' ? 'This room is closed.' : 'Opening the room…'}
            {link === 'missing' ? (
              <button type="button" className={styles.button} onClick={() => router.push('/screen')}>
                Back to the leaderboard
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const mission = MISSIONS[snapshot.missionId];
  const status = snapshot.status;
  const racing = status === 'racing' || status === 'finished';
  // The clock stops on the last result once the race is over.
  const lastEndMs = Math.max(0, ...snapshot.players.map((player) => player.raceMs ?? 0));
  const elapsedMs = status === 'racing' && snapshot.startAt !== null ? now - snapshot.startAt : status === 'finished' ? lastEndMs : 0;
  const countdown = Math.max(1, Math.ceil(((snapshot.startAt ?? now) - now) / 1000));
  const reset = (): void => {
    setError(null);
    postRaceAction(code, { action: 'reset' }).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'Could not reset the room.'),
    );
  };

  return (
    <div className={styles.stage}>
      <div className={styles.board}>
        <div className={styles.main}>
          <div className={styles.header}>
            <div className={styles.titleRow}>
              <span className={`${styles.dot} ${status === 'racing' ? '' : styles.dotIdle}`} />
              <span className={styles.title}>ROOM RACE · {link === 'reconnecting' ? 'RECONNECTING' : STATUS_TITLE[status]}</span>
              <span className={styles.chip}>
                {status === 'finished' ? mission.name : `${mission.id} · ${mission.name} · ${mission.weather}`}
              </span>
            </div>
            <div className={styles.controls}>
              {status === 'lobby' ? (
                <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={() => router.push('/screen')}>
                  Leaderboard
                </button>
              ) : null}
              {status === 'countdown' || status === 'racing' ? (
                <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={reset}>
                  Abort
                </button>
              ) : null}
              {status === 'finished' ? (
                <button type="button" className={`${styles.button} ${styles.buttonCompact}`} onClick={reset}>
                  New race
                </button>
              ) : null}
              {racing ? <span className={styles.clock}>{clock(elapsedMs)}</span> : null}
            </div>
          </div>

          {error ? (
            <p role="alert" className={styles.alert}>
              {error}
            </p>
          ) : null}

          <div className={styles.trackArea}>
            <div className={styles.main}>
              <RaceTrack mission={mission} players={snapshot.players} racing={racing} />
            </div>
            {status === 'countdown' ? (
              <div className={styles.countdown}>
                <span key={countdown} className={styles.count}>
                  {countdown}
                </span>
              </div>
            ) : null}
          </div>

          {status === 'lobby' ? <HostBar snapshot={snapshot} onError={setError} /> : null}
        </div>

        <Side
          joinLabel={status === 'lobby' ? 'SCAN TO JOIN' : 'JOIN THE NEXT RACE'}
          joinCode={code}
          joinUrl={joinUrl}
          episodes={episodes}
          stat={`${snapshot.players.length} in the room`}
        >
          <Order snapshot={snapshot} />
        </Side>
      </div>
    </div>
  );
}
