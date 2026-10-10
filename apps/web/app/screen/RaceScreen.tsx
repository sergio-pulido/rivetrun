'use client';

import type { MissionId } from '@rivetrun/contracts';
import { compileTrack, MISSION_IDS, MISSIONS, PRESETS } from '@rivetrun/sim';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AttractCanvas, DecisionChips, type DecisionChip } from '@/game';
import { AppHeader } from '@/ui/AppHeader';
import { duelVerdict, MAX_BOTS, rankPlayers, resultText, SEAT_OPTIONS, seatsTaken, type RaceSnapshot } from '../race/_lib/protocol';
import { postRaceAction, useRaceRoom, useServerNow } from '../race/_lib/useRaceRoom';
import { RaceTrack } from './RaceTrack';
import { Side, useEpisodeCount } from './Side';
import { ThreadPanel } from './ThreadPanel';
import { useJevBots, type JevBots } from './useJevBots';
import styles from './screen.module.css';

interface RaceScreenProps {
  readonly code: string;
  /** Origin phones can reach (LAN address on localhost). */
  readonly siteUrl: string;
}

const STATUS_TITLE = { lobby: 'LOBBY', build: 'BUILD', countdown: 'GET READY', racing: 'LIVE', finished: 'FINISH' } as const;
/** Lane height budget (design px) when the decision chips share the column. */
const LANES_WITH_CHIPS = 380;
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

/** The room's order, in the same words as on every phone (resultText). */
function Order({ snapshot }: { readonly snapshot: RaceSnapshot }) {
  const ranked = rankPlayers(snapshot.players);
  const trackLengthM = compileTrack(MISSIONS[snapshot.missionId].track).lengthM;
  const before = snapshot.status === 'lobby' || snapshot.status === 'build' || snapshot.status === 'countdown';
  const shown = ranked.slice(0, ORDER_ROWS_MAX);
  const row = Math.max(ORDER_ROW_MIN, Math.min(ORDER_ROW_MAX, Math.floor(ORDER_HEIGHT / Math.max(1, shown.length)) - 6));
  return (
    <div className={styles.orderPanel}>
      <span className={styles.label}>
        {snapshot.status === 'finished' ? 'Finish order · race time' : before ? 'On the grid' : 'Live order'}
      </span>
      {ranked.length === 0 ? <span className={styles.orderEmpty}>Nobody yet.</span> : null}
      {shown.map((player, index) => {
        const out = player.done && !player.finished;
        return (
          <div key={player.id} className={styles.orderRow} style={{ ['--row' as string]: row }}>
            <span className={`${styles.pos} ${out ? styles.posOut : index < 3 ? styles.posTop : ''}`}>{out ? '—' : index + 1}</span>
            <span className={styles.orderNick} style={player.kind === 'jev' ? { color: '#3FD0E0' } : undefined}>
              {player.nickname}
            </span>
            <span className={styles.gap}>
              {before ? (player.kind === 'jev' ? 'AI' : snapshot.status === 'build' ? (player.ready ? 'ready ✓' : 'building') : 'ready') : resultText(player, trackLengthM)}
            </span>
          </div>
        );
      })}
      {ranked.length > shown.length ? <span className={styles.orderEmpty}>+ {ranked.length - shown.length} more behind</span> : null}
    </div>
  );
}

function HostBar({ snapshot, bots, onError }: { readonly snapshot: RaceSnapshot; readonly bots: JevBots; readonly onError: (message: string | null) => void }) {
  // The pick lives in the room, so the header, the lanes and every phone show the chosen track at once.
  const missionId = snapshot.missionId;
  const setMissionId = (id: MissionId): void => {
    onError(null);
    postRaceAction(snapshot.code, { action: 'mission', missionId: id }).catch((cause: unknown) =>
      onError(cause instanceof Error ? cause.message : 'Could not change the track.'),
    );
  };
  const taken = seatsTaken(snapshot);
  const setSeats = (seats: number): void => {
    onError(null);
    postRaceAction(snapshot.code, { action: 'seats', seats }).catch((cause: unknown) =>
      onError(cause instanceof Error ? cause.message : 'Could not change the seats.'),
    );
  };
  const [starting, setStarting] = useState(false);
  const start = async (): Promise<void> => {
    setStarting(true);
    onError(null);
    try {
      await postRaceAction(snapshot.code, { action: 'start' });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not start the race.');
    } finally {
      setStarting(false);
    }
  };
  const botsInRoom = snapshot.players.filter((player) => player.kind === 'jev');
  const addBot = (): void => {
    onError(null);
    bots.add(PRESETS.all_rounder.build).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not add a JEV bot.'));
  };
  const removeBot = (): void => {
    const last = botsInRoom[botsInRoom.length - 1];
    if (last) bots.remove(last.id).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not remove the bot.'));
  };
  return (
    <div className={styles.hostBar}>
      <div className={styles.picks} role="radiogroup" aria-label="Track">
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
      <div className={styles.hostBar} role="radiogroup" aria-label="Human seats">
        <span className={styles.pickLabel}>Seats</span>
        {SEAT_OPTIONS.map((seats) => (
          <button
            key={seats}
            type="button"
            role="radio"
            aria-checked={snapshot.seats === seats}
            disabled={seats < taken}
            onClick={() => setSeats(seats)}
            className={`${styles.pick} ${snapshot.seats === seats ? styles.pickOn : ''}`}
          >
            {seats}
          </button>
        ))}
      </div>
      <button type="button" onClick={addBot} disabled={botsInRoom.length >= MAX_BOTS} className={`${styles.button} ${styles.buttonJev}`}>
        + JEV bot
      </button>
      {botsInRoom.length > 0 ? (
        <button type="button" onClick={removeBot} className={`${styles.button} ${styles.buttonGhost}`} aria-label="Remove the last JEV bot">
          − bot
        </button>
      ) : null}
      <button type="button" onClick={() => void start()} disabled={snapshot.players.length === 0 || starting} className={styles.button}>
        {starting ? 'Opening…' : 'Open build phase'}
      </button>
    </div>
  );
}

export function RaceScreen({ code, siteUrl }: RaceScreenProps) {
  const router = useRouter();
  const { snapshot, link, clockOffsetMs } = useRaceRoom(code);
  const now = useServerNow(clockOffsetMs);
  const episodes = useEpisodeCount();
  const bots = useJevBots(snapshot, clockOffsetMs);
  const [error, setError] = useState<string | null>(null);
  const joinUrl = `${siteUrl}/race/${code}`;

  if (link === 'missing' || !snapshot) {
    return (
      <div className={styles.stage}>
        <div className={styles.board} style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <AppHeader variant="logo" className={`${styles.logo} min-h-0!`} />
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
  const hasJev = snapshot.players.some((player) => player.kind === 'jev');
  const buildLeftS = Math.max(0, Math.ceil(((snapshot.buildEndsAt ?? now) - now) / 1000));
  const closesInS = snapshot.closesAt === null ? null : Math.max(0, Math.ceil((snapshot.closesAt - now) / 1000));
  const verdict = status === 'finished' ? duelVerdict(snapshot.players) : null;
  // The last three decisions of the JEV bots as chips (docs/BRAIN_V3_SENSING.md); the side panel has the full thread.
  const showChips = racing && hasJev && bots.thread.length > 0;
  const chips: DecisionChip[] = bots.thread
    .slice(0, 3)
    .reverse()
    .map((entry) => ({ id: entry.id, t: entry.t, text: `${entry.who} · ${entry.chip}`, tone: entry.fallback || entry.policy !== 'jev' ? 'fallback' : 'decision' }));
  const skipBuild = (): void => {
    postRaceAction(code, { action: 'start' }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not start the race.'));
  };
  // RACE TIME: wall-clock from the start signal. The clock stops on the last result once the race is over.
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
        <AppHeader variant="logo" className={`${styles.logo} min-h-0!`} />
        <div className={styles.main}>
          <div className={styles.header}>
            <div className={styles.titleRow}>
              <span className={`${styles.dot} ${status === 'racing' ? '' : styles.dotIdle}`} />
              <span className={styles.title}>
                {hasJev ? 'HUMANS vs JEV' : 'ROOM RACE'} · {link === 'reconnecting' ? 'RECONNECTING' : STATUS_TITLE[status]}
              </span>
              <span className={styles.chip}>
                {mission.id} · {mission.name}
                {status === 'lobby' ? ` · ${mission.weather}` : ''}
              </span>
            </div>
            <div className={styles.controls}>
              {status === 'lobby' ? (
                <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={() => router.push('/screen')}>
                  Leaderboard
                </button>
              ) : null}
              {status === 'build' ? (
                <>
                  <button type="button" className={`${styles.button} ${styles.buttonCompact}`} onClick={skipBuild}>
                    Start now
                  </button>
                  <span className={styles.clock}>{buildLeftS} s</span>
                </>
              ) : null}
              {closesInS !== null ? <span className={styles.closing}>RACE CLOSES IN {closesInS} s</span> : null}
              {status === 'build' || status === 'countdown' || status === 'racing' ? (
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

          {verdict ? (
            <p className={`${styles.verdict} ${verdict.winner === 'jev' ? styles.verdictJev : ''}`}>
              <strong>{verdict.headline}</strong> · {verdict.detail}
            </p>
          ) : null}
          {status === 'build' ? <p className={styles.alertInfo}>BUILD PHASE · phones are rebuilding for {mission.name}. The race starts when everyone is ready or the timer runs out.</p> : null}

          <div className={styles.trackArea}>
            {status === 'lobby' && snapshot.players.length === 0 ? (
              // Nobody on the grid yet: the presets replay the track on a loop until the first robot joins.
              <div className={styles.attract}>
                <AttractCanvas mission={mission} />
                <span className={styles.attractNote}>Demo replay · scan the code to put your own robot on the grid</span>
              </div>
            ) : (
              <div className={styles.main}>
                <RaceTrack mission={mission} players={snapshot.players} status={status} heightBudget={showChips ? LANES_WITH_CHIPS : undefined} />
              </div>
            )}
            {status === 'countdown' ? (
              <div className={styles.countdown}>
                <span key={countdown} className={styles.count}>
                  {countdown}
                </span>
              </div>
            ) : null}
          </div>

          {showChips ? (
            <div className={styles.chipsRow}>
              <DecisionChips chips={chips} size="screen" align="start" />
            </div>
          ) : null}

          {status === 'lobby' ? <HostBar snapshot={snapshot} bots={bots} onError={setError} /> : null}
        </div>

        <Side
          joinLabel={status === 'lobby' || status === 'build' ? 'SCAN TO JOIN' : 'JOIN THE NEXT RACE'}
          joinCode={code}
          joinUrl={joinUrl}
          episodes={episodes}
          seats={`${seatsTaken(snapshot)}/${snapshot.seats}`}
          // During and after a race with JEV bots, their live decision thread takes the QR block's place.
          extra={racing && hasJev && bots.running > 0 ? <ThreadPanel thread={bots.thread} /> : undefined}
          stat={`${snapshot.players.length} in the room`}
        >
          <Order snapshot={snapshot} />
        </Side>
      </div>
    </div>
  );
}
