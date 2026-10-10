'use client';

import { useEffect, useState } from 'react';
import { MISSIONS, PRESETS } from '@rivetrun/sim';
import type { HumanArenaBody } from '../api/_lib/humanArena';
import type { PublicGuardStatus } from '../api/_lib/publicGuard';
import { QrCode } from '../leaderboard/_lib/QrCode';
import { AutoRoomsGrid } from './AutoRoomsGrid';
import play from './play.module.css';
import styles from './screen.module.css';
import { useAmbience } from '@/game/audio/samples';

const REFRESH_MS = 3000;
/** Driver names as the phones show them. */
const AGENT_NAME: Readonly<Record<string, string>> = { 'jev-1.13.0': 'Jev', 'gpt-6-luna': 'GPT-6 Luna', 'deepseek-flash': 'DeepSeek Flash', 'gpt-6.1-sol': 'GPT-6.1 Sol', heuristic: 'Fixed rules', human: 'You drive' };

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

/** RR-GUARD spend and caps. The route answers only on the presenter's machine; anywhere else this stays null. */
function useGuardStatus(): PublicGuardStatus | null {
  const [status, setStatus] = useState<PublicGuardStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetch('/api/admin/public-ai', { cache: 'no-store' })
        .then(async (response) => (response.ok ? ((await response.json()) as PublicGuardStatus) : null))
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return status;
}

/**
 * /screen?mode=play — the hands-on part of the demo: one big QR to the Home page, three words, and the room's own
 * runs as they come in. Sized for the back of the room at 1920×1080 (everything scales with the screen).
 */
export function PlayScreen({ siteUrl }: { readonly siteUrl: string }) {
  useAmbience('amb_arena', 'screen'); // RR-SOUND: arena ambience; silent when the pack has no file
  const audience = useAudience();
  const guard = useGuardStatus();
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
          {/* Best combo today, per mission: the fastest picked lane that finished in an auto room. */}
          {Object.keys(audience?.bestCombo ?? {}).length > 0 ? (
            <div className={play.combos} data-testid="best-combos">
              <span className={play.combosLabel}>Best combo today</span>
              {Object.values(audience?.bestCombo ?? {})
                .sort((a, b) => a.missionId.localeCompare(b.missionId))
                .map((combo) => (
                  <span key={combo.missionId} className={play.combo}>
                    <strong>{MISSIONS[combo.missionId].name}</strong> {PRESETS[combo.presetId as keyof typeof PRESETS]?.name ?? combo.presetId} · {AGENT_NAME[combo.agent] ?? combo.agent} · {combo.timeS.toFixed(1)} s
                  </span>
                ))}
            </div>
          ) : null}
          {/* Presenter only: this request answers on localhost and nowhere else. */}
          {guard ? (
            <span className={play.foot} data-testid="public-ai-status">
              Visitor AI {guard.on ? 'ON' : 'OFF'} · models US${guard.ai.spentUsd.toFixed(2)} of {guard.ai.capUsd} · Jev {guard.jev.calls} of {guard.jev.cap} calls · {guard.runsPerClient} live runs per phone per {guard.windowMinutes} min · turned away {Object.values(guard.refused).reduce((sum, n) => sum + n, 0)}
            </span>
          ) : null}
          <span className={play.foot}>
            {audience ? `${audience.verified} ${audience.verified === 1 ? 'run' : 'runs'} replayed and checked by the server today` : 'Connecting…'} · Jev = the AI driving the same robot on the same track
          </span>
        </div>
      </div>
    </div>
  );
}
