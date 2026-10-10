'use client';

import { StatsResponseSchema } from '@rivetrun/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { QrCode } from '../leaderboard/_lib/QrCode';
import styles from './screen.module.css';

const STATS_REFRESH_MS = 5000;

/** Episodes submitted since the server started; null until the first answer or while it is unreachable. */
export function useEpisodeCount(): number | null {
  const [episodes, setEpisodes] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetch('/api/stats', { cache: 'no-store' })
        .then(async (response) => (response.ok ? StatsResponseSchema.parse(await response.json()).episodes : null))
        .then((count) => {
          if (!cancelled && count !== null) setEpisodes(count);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, STATS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return episodes;
}

interface SideProps {
  /** The order / top-score panel. */
  readonly children: ReactNode;
  readonly joinLabel: string;
  /** Big text next to the QR: the room code, or a call to action. */
  readonly joinCode: string;
  readonly joinUrl: string;
  readonly episodes: number | null;
  /** Shown next to the QR, e.g. "5/6" with the caption "seats taken". */
  readonly seats?: string;
  /** Shown between the panel and the QR block; while it is shown the QR block makes room for it. */
  readonly extra?: ReactNode;
  /** Right-hand stat, e.g. "12 IN THE ROOM". */
  readonly stat: string;
}

/** Right column of the board: a panel, the QR block, two stats and the footer line. */
export function Side({ children, joinLabel, joinCode, joinUrl, episodes, seats, extra, stat }: SideProps) {
  return (
    <div className={styles.side}>
      {children}
      {extra ?? (
        <div className={styles.join}>
          <div className={styles.qr}>
            <QrCode value={joinUrl} />
          </div>
          <div className={styles.joinText}>
            <span className={styles.joinLabel}>{joinLabel}</span>
            <span className={styles.code}>{joinCode}</span>
            <span className={styles.url}>{joinUrl.replace(/^https?:\/\//, '')}</span>
            {seats ? (
              <span className={styles.seats}>
                <strong>{seats}</strong> seats taken
              </span>
            ) : null}
          </div>
        </div>
      )}
      <div className={styles.stats}>
        <span>{episodes === null ? '—' : episodes} {episodes === 1 ? 'episode' : 'episodes'} logged</span>
        <span>{stat}</span>
      </div>
      <span className={styles.tagline}>Today a game. Tomorrow a benchmark.</span>
    </div>
  );
}
