'use client';

import type { Mission, MissionId } from '@rivetrun/contracts';
import { compileTrack, MISSION_IDS, MISSIONS, PRESETS } from '@rivetrun/sim';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AttractCanvas, DecisionChips, type DecisionChip } from '@/game';
import { AppHeader } from '@/ui/AppHeader';
import { ARENA_BRAINS, ARENA_MAX_BOTS, duelVerdict, isReasoning, penaltyNote, resultShort, shortName, MAX_BOTS, rankPlayers, SEAT_OPTIONS, seatsTaken, type ArenaBrainId, type RaceSnapshot } from '../race/_lib/protocol';
import { postRaceAction, useRaceRoom, useServerNow } from '../race/_lib/useRaceRoom';
import { RaceTrack } from './RaceTrack';
import { Side, useEpisodeCount } from './Side';
import { ArenaResults } from './ArenaResults';
import { ThreadPanel } from './ThreadPanel';
import { useJevBots, type JevBots } from './useJevBots';
import styles from './screen.module.css';

interface RaceScreenProps {
  readonly code: string;
  /** Origin phones can reach (LAN address on localhost). */
  readonly siteUrl: string;
  /** /screen?arena=1: the live Arena race, one bot per brain. */
  readonly arena?: boolean;
}

const STATUS_TITLE = { lobby: 'LOBBY', build: 'BUILD', countdown: 'GET READY', racing: 'LIVE', finished: 'FINISH' } as const;
/** Design px the caption row above the lanes takes. */
const CAPTIONS_HEIGHT = 34;

/**
 * The height the lanes really have, in design px. The lane area is whatever the column has left after the
 * header, the weather line, the verdict, the decision chips and the host bar, so it is measured, not assumed:
 * with eight phones and two bots every lane must still fit above whatever sits below it.
 */
function useLaneBudget(): { ref: React.RefObject<HTMLDivElement | null>; budget: number | undefined } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [budget, setBudget] = useState<number | undefined>(undefined);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = (): void => {
      const unit = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
      setBudget(Math.max(0, Math.floor(element.clientHeight / unit) - CAPTIONS_HEIGHT));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  });
  return { ref, budget };
}
const ORDER_ROW_MAX = 30;
const ORDER_ROW_MIN = 20;
/** A full room does not fit the panel: it lists the front of the field and counts the rest. */
const ORDER_ROWS_MAX = 12;
/** Height the order rows may share on the 720-high board. */
const ORDER_HEIGHT = 330;

/** The mission's weather as the big screen words it, or null on a calm, clear mission. */
function weatherText(mission: Mission): string | null {
  const c = mission.conditions;
  const parts = [
    c?.precipitation && c.precipitation !== 'none' ? c.precipitation.replace('_', ' ') : mission.weather !== 'clear' && !c ? mission.weather : null,
    c?.visibility && c.visibility !== 'clear' ? c.visibility : null,
    c?.windMps ? `${c.windMps > 0 ? 'headwind' : 'tailwind'} ${Math.abs(c.windMps)} m/s` : null,
    c?.gustMps ? `gusts +${c.gustMps} m/s` : null,
    c?.temperatureC !== undefined ? `${c.temperatureC} °C` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

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
              {shortName(player)}
              {isReasoning(player) ? <small className={styles.orderTag}> reasoning</small> : null}
            </span>
            <span className={styles.gap}>
              {before ? (player.kind === 'jev' ? 'AI' : snapshot.status === 'build' ? (player.ready ? 'ready ✓' : 'building') : 'ready') : `${resultShort(player, trackLengthM)}${penaltyNote(player) ? ` · +${Math.round(player.penaltyMs / 1000)} s scan` : ''}`}
            </span>
          </div>
        );
      })}
      {ranked.length > shown.length ? <span className={styles.orderEmpty}>+ {ranked.length - shown.length} more behind</span> : null}
    </div>
  );
}

function HostBar({ snapshot, bots, onError, arena }: { readonly snapshot: RaceSnapshot; readonly bots: JevBots; readonly onError: (message: string | null) => void; readonly arena: boolean }) {
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
  // Live Arena: which brains this server can call. A brain it cannot call is not offered: its bot would fall
  // back on every decision in front of the room. One line says which are missing and why.
  const [brains, setBrains] = useState<readonly { id: string; available: boolean; reason?: string }[] | null>(null);
  useEffect(() => {
    if (!arena) return undefined;
    let cancelled = false;
    fetch('/api/arena/decide', { cache: 'no-store' })
      .then(async (response) => (response.ok ? ((await response.json()) as { brains?: { id: string; available: boolean; reason?: string }[] }) : null))
      .then((body) => {
        if (!cancelled && body?.brains) setBrains(body.brains);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [arena]);
  const usable = (id: string): boolean => brains?.find((brain) => brain.id === id)?.available === true;
  const missing = ARENA_BRAINS.flatMap((brain) => {
    const state = brains?.find((candidate) => candidate.id === brain.id);
    return state && !state.available ? [`${brain.label}: ${state.reason ?? 'not available'}`] : [];
  });
  const addBrain = (model: ArenaBrainId): void => {
    onError(null);
    bots.add(PRESETS.all_rounder.build, model).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not add that brain.'));
  };
  const removeBot = (): void => {
    const last = botsInRoom[botsInRoom.length - 1];
    if (last) bots.remove(last.id).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not remove the bot.'));
  };
  return (
    <div className={styles.hostBars}>
      {/* Row 1: the track (ids only, nine missions must fit one row) and the human seats. */}
      <div className={styles.hostBar}>
        <div className={styles.hostBar} role="radiogroup" aria-label="Track">
          <span className={styles.pickLabel}>Track</span>
          {MISSION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={missionId === id}
              aria-label={`${id} ${MISSIONS[id].name}`}
              title={MISSIONS[id].name}
              onClick={() => setMissionId(id)}
              className={`${styles.pick} ${missionId === id ? styles.pickOn : ''}`}
            >
              {id}
            </button>
          ))}
        </div>
        <div className={`${styles.hostBar} ${styles.spacer}`} role="radiogroup" aria-label="Human seats">
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
      </div>
      {/* Row 2: bots and the start. */}
      <div className={styles.hostBar}>
        <span className={styles.pickName}>
          {missionId} · {MISSIONS[missionId].name}
        </span>
        {arena ? (
          // Live Arena: one lane per brain, same robot and seed for all of them.
          <span className={`${styles.arenaBrains} ${styles.spacer}`}>
            {brains === null ? <span className={styles.arenaMissing}>Checking which brains this server can call…</span> : null}
            {ARENA_BRAINS.filter((brain) => usable(brain.id) && !botsInRoom.some((bot) => bot.model === brain.id)).map((brain) => (
              <button key={brain.id} type="button" onClick={() => addBrain(brain.id)} disabled={botsInRoom.length >= ARENA_MAX_BOTS} className={`${styles.button} ${styles.buttonJev} ${styles.buttonSmall}`}>
                + {brain.label}
              </button>
            ))}
            {missing.length > 0 ? <span className={styles.arenaMissing}>Not on offer · {missing.join(' · ')}</span> : null}
          </span>
        ) : (
          <button type="button" onClick={addBot} disabled={botsInRoom.length >= MAX_BOTS} className={`${styles.button} ${styles.buttonJev} ${styles.spacer}`}>
            + JEV bot
          </button>
        )}
        {botsInRoom.length > 0 ? (
          <button type="button" onClick={removeBot} className={`${styles.button} ${styles.buttonGhost}`} aria-label="Remove the last JEV bot">
            − bot
          </button>
        ) : null}
        <button type="button" onClick={() => void start()} disabled={snapshot.players.length === 0 || starting} className={styles.button}>
          {starting ? 'Opening…' : 'Open build phase'}
        </button>
      </div>
    </div>
  );
}

export function RaceScreen({ code, siteUrl, arena = false }: RaceScreenProps) {
  const router = useRouter();
  const { snapshot, link, clockOffsetMs } = useRaceRoom(code);
  const now = useServerNow(clockOffsetMs);
  const episodes = useEpisodeCount();
  const bots = useJevBots(snapshot, clockOffsetMs);
  const lanes = useLaneBudget();
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
  // A race with bots named after their brains is the live Arena, whatever URL the screen was opened with.
  const arenaRace = snapshot.players.some((player) => player.model !== undefined);
  const buildLeftS = Math.max(0, Math.ceil(((snapshot.buildEndsAt ?? now) - now) / 1000));
  const closesInS = snapshot.closesAt === null ? null : Math.max(0, Math.ceil((snapshot.closesAt - now) / 1000));
  const verdict = status === 'finished' ? duelVerdict(snapshot.players) : null;
  const weather = weatherText(mission);
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
                {arenaRace ? 'BRAIN ARENA' : hasJev ? 'HUMANS vs JEV' : 'ROOM RACE'} · {link === 'reconnecting' ? 'RECONNECTING' : STATUS_TITLE[status]}
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

          {weather ? (
            <p className={styles.weather}>
              <span>Weather</span> {weather}
            </p>
          ) : null}
          {verdict ? (
            <p className={`${styles.verdict} ${verdict.winner === 'jev' ? styles.verdictJev : ''}`}>
              <strong>{arenaRace ? verdict.headline.replace('JEV WINS', 'AI WINS') : verdict.headline}</strong> · {verdict.detail}
            </p>
          ) : null}
          {status === 'build' ? <p className={styles.alertInfo}>BUILD PHASE · phones are rebuilding for {mission.name}. The race starts when everyone is ready or the timer runs out.</p> : null}

          <div className={styles.trackArea} ref={lanes.ref}>
            {status === 'lobby' && snapshot.players.length === 0 ? (
              // Nobody on the grid yet: the presets replay the track on a loop until the first robot joins.
              <div className={styles.attract}>
                <AttractCanvas mission={mission} />
                <span className={styles.attractNote}>Demo replay · scan the code to put your own robot on the grid</span>
              </div>
            ) : (
              <div className={styles.main}>
                <RaceTrack mission={mission} players={snapshot.players} status={status} heightBudget={lanes.budget} />
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

          {status === 'lobby' ? <HostBar snapshot={snapshot} bots={bots} onError={setError} arena={arena} /> : null}
        </div>

        <Side
          joinLabel={status === 'lobby' || status === 'build' ? 'SCAN TO JOIN' : 'JOIN THE NEXT RACE'}
          joinCode={code}
          joinUrl={joinUrl}
          episodes={episodes}
          seats={`${seatsTaken(snapshot)}/${snapshot.seats}`}
          // During and after a race with JEV bots, their live decision thread takes the QR block's place.
          extra={
            // Live Arena, finished: what each brain's answering speed cost it. Otherwise the bots' live decisions.
            status === 'finished' && arenaRace ? (
              <ArenaResults players={snapshot.players} trackLengthM={compileTrack(mission.track).lengthM} />
            ) : racing && hasJev && bots.running > 0 ? (
              <ThreadPanel thread={bots.thread} arena={arenaRace} />
            ) : undefined
          }
          stat={`${snapshot.players.length} in the room`}
        >
          <Order snapshot={snapshot} />
        </Side>
      </div>
    </div>
  );
}
