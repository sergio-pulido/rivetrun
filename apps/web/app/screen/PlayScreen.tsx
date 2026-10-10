'use client';

import { useEffect, useState } from 'react';
import { MISSIONS } from '@rivetrun/sim';
import type { HumanArenaBody } from '../api/_lib/humanArena';
import { QrCode } from '../leaderboard/_lib/QrCode';
import { AutoRoomsGrid } from './AutoRoomsGrid';
import play from './play.module.css';
import styles from './screen.module.css';

const REFRESH_MS = 3000;

/** Today's audience runs, as the server verified them (GET /api/arena/humans); null until the first answer. */
function useAudience(): HumanArenaBody | null {
  const [body, setBody] = useState<HumanArenaBody | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetch('/api/arena/humans', { cache: 'no-store' })
        .then(async (response) => (response.ok ? ((await response.json()) as HumanArenaBody) : null))
        .then((next) => {
          if (!cancelled && next) setBody(next);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return body;
}

/**
 * /screen?mode=play — the hands-on part of the demo: one big QR to the Home page, three words, and the room's own
 * runs as they come in. Sized for the back of the room at 1920×1080 (everything scales with the screen).
 */
export function PlayScreen({ siteUrl }: { readonly siteUrl: string }) {
  const audience = useAudience();
  const board = audience?.board ?? [];
  const versus = audience?.vsJev ?? { runs: 0, humanWins: 0 };
  return (
    <div className={styles.stage}>
      <div className={play.board}>
        <div className={play.left}>
          <div className={play.qr}>
            <QrCode value={`${siteUrl}/play`} />
          </div>
          <span className={play.url}>{siteUrl.replace(/^https?:\/\//, '')}/play</span>
        </div>
        <div className={play.right}>
          <h1 className={play.headline}>
            Scan <span>·</span> Play <span>·</span> Beat Jev
          </h1>
          <p className={play.versus}>
            {versus.runs === 0 ? (
              'No run against Jev yet. Be the first.'
            ) : (
              <>
                Humans beat Jev <strong>{versus.humanWins}</strong> of <strong>{versus.runs}</strong> {versus.runs === 1 ? 'run' : 'runs'}
              </>
            )}
          </p>
          {/* The rooms filling up and racing right now (RR-PLAN §7; the sim session's component). */}
          <div className={play.rooms}>
            <AutoRoomsGrid />
          </div>
          <div className={play.table}>
            <div className={`${play.row} ${play.head}`}>
              <span>#</span>
              <span>Driver</span>
              <span>Mission</span>
              <span>Time</span>
              <span>Jev</span>
            </div>
            {board.length === 0 ? <div className={play.empty}>Today&apos;s best times appear here.</div> : null}
            {board.slice(0, 4).map((run, index) => (
              <div key={`${run.nickname}-${run.missionId}`} className={play.row}>
                <span className={play.place}>{index + 1}</span>
                <span className={play.name}>{run.nickname}</span>
                <span className={play.mission}>{MISSIONS[run.missionId].name}</span>
                <span className={play.time}>{run.timeS.toFixed(1)} s</span>
                <span className={run.beatJev ? play.won : play.jev}>{run.jevTimeS === null ? '—' : `${run.jevTimeS.toFixed(1)} s${run.beatJev ? ' ✓' : ''}`}</span>
              </div>
            ))}
          </div>
          <span className={play.foot}>
            {audience ? `${audience.verified} ${audience.verified === 1 ? 'run' : 'runs'} replayed and checked by the server today` : 'Connecting…'} · Jev = the AI driving the same robot on the same track
          </span>
        </div>
      </div>
    </div>
  );
}
