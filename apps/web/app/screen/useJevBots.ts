'use client';

import { BRIEFING_PRESETS, type Build } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import type { ThreadEntry } from '@/brain/thread';
import { startJevRun } from '../race/_lib/jevRun';
import { JoinResponseSchema, type RaceSnapshot } from '../race/_lib/protocol';
import type { RaceSeat } from '../race/_lib/report';
import { postRaceAction } from '../race/_lib/useRaceRoom';

const SeatsSchema = z.array(z.object({ playerId: z.string(), token: z.string() }));
/** Decisions kept for the thread panel. */
const THREAD_KEEP = 40;
const storageKey = (code: string): string => `rivetrun.race.bots.${code}`;

function loadSeats(code: string): RaceSeat[] {
  try {
    const parsed = SeatsSchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey(code)) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function saveSeats(code: string, seats: readonly RaceSeat[]): void {
  try {
    sessionStorage.setItem(storageKey(code), JSON.stringify(seats));
  } catch {
    // The bots then last until this page reloads.
  }
}

export interface JevBots {
  /** Bots in the room that this screen holds the seat for (and therefore runs). */
  readonly running: number;
  /** The bots' decisions in the current race, newest first. */
  readonly thread: readonly ThreadEntry[];
  readonly add: (build: Build) => Promise<void>;
  readonly remove: (playerId: string) => Promise<void>;
}

/**
 * The big screen is the host: it adds JEV bots to the room and runs them (Jev through /api/decide,
 * heuristic fallback), posting their state like a phone. The first bot gets no briefing, the second Daredevil.
 */
export function useJevBots(snapshot: RaceSnapshot | null, clockOffsetMs: number): JevBots {
  const code = snapshot?.code;
  const [seats, setSeats] = useState<readonly RaceSeat[]>([]);
  const [thread, setThread] = useState<readonly ThreadEntry[]>([]);
  useEffect(() => {
    if (code) setSeats(loadSeats(code));
  }, [code]);

  const raceNo = snapshot?.raceNo ?? 0;
  const startAt = snapshot?.startAt ?? null;
  const missionId = snapshot?.missionId;
  const seed = snapshot?.seed;
  const live = snapshot?.status === 'countdown' || snapshot?.status === 'racing';
  // A stable key for the bots on the grid, so the effect below does not restart on every snapshot.
  const bots = (snapshot?.players ?? []).filter((player) => player.kind === 'jev' && seats.some((seat) => seat.playerId === player.id));
  const botsKey = bots.map((bot) => bot.id).join(',');

  useEffect(() => {
    if (!live || !code || !missionId || seed === undefined || startAt === null || botsKey === '') return undefined;
    const stops: (() => void)[] = [];
    setThread([]);
    const onDecision = (entry: ThreadEntry): void => setThread((previous) => [entry, ...previous].slice(0, THREAD_KEEP));
    const timer = setTimeout(
      () => {
        for (const bot of bots) {
          const seat = seats.find((candidate) => candidate.playerId === bot.id);
          if (seat) stops.push(startJevRun({ code, raceNo, seat, mission: MISSIONS[missionId], seed, build: bot.build, briefing: bot.briefing, who: bot.nickname, onDecision }));
        }
      },
      Math.max(0, startAt - (Date.now() + clockOffsetMs)),
    );
    return () => {
      clearTimeout(timer);
      stops.forEach((stop) => stop());
    };
    // Builds and briefings are locked from the countdown on; the clock offset is read once per race on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, raceNo, startAt, code, missionId, seed, botsKey]);

  const add = useCallback(
    async (build: Build): Promise<void> => {
      if (!code) return;
      const briefing = bots.length === 0 ? undefined : BRIEFING_PRESETS[0].text;
      const seat = JoinResponseSchema.parse(await postRaceAction(code, { action: 'addBot', build, briefing }));
      setSeats((previous) => {
        const next = [...previous, { playerId: seat.playerId, token: seat.token }];
        saveSeats(code, next);
        return next;
      });
    },
    [code, bots.length],
  );

  const remove = useCallback(
    async (playerId: string): Promise<void> => {
      if (code) await postRaceAction(code, { action: 'remove', playerId });
    },
    [code],
  );

  return { running: bots.length, thread, add, remove };
}
