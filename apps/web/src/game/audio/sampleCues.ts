'use client';

// RR-SOUND: what the big screen plays during a race, worked out from one room snapshot to the next.
// Kept apart from the player (samples.ts) so the rules can be tested without any audio.
import { useEffect, useRef } from 'react';
import { announce, armSamples, playSample, sampleSeconds, useAmbience, type OneShotName, type VoiceName } from './samples';

/** The part of a race lane the cues read. A RacePlayer fits it. */
export interface CuePlayer {
  readonly id: string;
  readonly kind: 'human' | 'jev';
  readonly x: number;
  readonly finished: boolean;
  readonly raceMs: number | null;
  /** Bots: hazards reached while the previous answer had not arrived yet. Only goes up within a race. */
  readonly lateDecisions?: number | null;
}

/** The part of a race room the cues read. A RaceSnapshot fits it. */
export interface CueRoom {
  readonly status: string;
  readonly raceNo: number;
  readonly startAt: number | null;
  readonly players: readonly CuePlayer[];
}

export type Cue = { readonly voice: VoiceName } | { readonly shot: OneShotName } | { readonly countdown: true };

export interface CueMemory {
  /** -1 before the first snapshot: what is already going on when the screen opens is not announced. */
  readonly raceNo: number;
  readonly status: string;
  readonly racingSinceMs: number;
  /** Who led when the lead was last called (or first noted): a change that came too soon to call is called later if it holds. */
  readonly leaderKind: CuePlayer['kind'] | null;
  readonly leadCalledAtMs: number;
  readonly late: Readonly<Record<string, number>>;
  readonly thinkingCalledAtMs: number;
  readonly winnerCalled: boolean;
  readonly photoCalled: boolean;
}

export const CUE_RULES = {
  /** The grid sorts itself out in the first seconds: no lead calls before this. */
  leadQuietMs: 3000,
  /** A lead has to be this far ahead to count. */
  leadMarginM: 0.3,
  leadEveryMs: 6000,
  thinkingEveryMs: 8000,
  photoFinishMs: 500,
} as const;

export const newCueMemory = (): CueMemory => ({
  raceNo: -1, status: '', racingSinceMs: 0, leaderKind: null, leadCalledAtMs: Number.NEGATIVE_INFINITY, late: {}, thinkingCalledAtMs: Number.NEGATIVE_INFINITY, winnerCalled: false, photoCalled: false,
});

const lateOf = (players: readonly CuePlayer[]): Record<string, number> =>
  Object.fromEntries(players.flatMap((player) => (player.kind === 'jev' && typeof player.lateDecisions === 'number' ? [[player.id, player.lateDecisions]] : [])));

/** The cues one snapshot adds, and what to remember for the next. Pure. */
export function raceCues(memory: CueMemory, room: CueRoom, nowMs: number): { readonly cues: Cue[]; readonly memory: CueMemory } {
  const late = lateOf(room.players);
  const finishers = room.players.filter((player) => player.finished && player.raceMs !== null).sort((a, b) => a.raceMs! - b.raceMs!);
  if (memory.raceNo !== room.raceNo) {
    // The first snapshot, or a new race in the room: start from what is on screen, announce nothing of it.
    const first = memory.raceNo === -1;
    return {
      cues: [],
      memory: { ...newCueMemory(), raceNo: room.raceNo, status: room.status, racingSinceMs: nowMs, late, winnerCalled: first && finishers.length > 0, photoCalled: first && finishers.length > 1 },
    };
  }
  const cues: Cue[] = [];
  let next: CueMemory = { ...memory, status: room.status, late: { ...memory.late, ...late } };

  if (room.status !== memory.status) {
    if (room.status === 'countdown') cues.push({ countdown: true });
    if (room.status === 'racing') {
      cues.push({ shot: 'fx_race_go' });
      next = { ...next, racingSinceMs: nowMs, leaderKind: null };
    }
  }

  if (room.status === 'racing') {
    // "Too slow: still thinking!" when a bot reached a hazard before its answer came.
    const slow = Object.entries(late).some(([id, count]) => count > (memory.late[id] ?? 0));
    if (slow && nowMs - memory.thinkingCalledAtMs >= CUE_RULES.thinkingEveryMs) {
      cues.push({ voice: 'vo_thinking' });
      next = { ...next, thinkingCalledAtMs: nowMs };
    }
    // The lead changing hands between a human and an AI: the story of the race.
    const ranked = [...room.players].sort((a, b) => b.x - a.x);
    const leader = ranked[0];
    const clear = leader !== undefined && (ranked[1] === undefined || leader.x - ranked[1].x >= CUE_RULES.leadMarginM);
    if (leader !== undefined && clear && nowMs - next.racingSinceMs >= CUE_RULES.leadQuietMs && finishers.length === 0) {
      if (next.leaderKind === null) {
        next = { ...next, leaderKind: leader.kind };
      } else if (leader.kind !== next.leaderKind && nowMs - memory.leadCalledAtMs >= CUE_RULES.leadEveryMs) {
        cues.push({ voice: leader.kind === 'jev' ? 'vo_jev_lead' : 'vo_human_lead' });
        next = { ...next, leadCalledAtMs: nowMs, leaderKind: leader.kind };
      }
    }
  }

  const winner = finishers[0];
  if (winner !== undefined && !memory.winnerCalled) {
    cues.push({ shot: 'fx_win_sting' }, { voice: winner.kind === 'jev' ? 'vo_ai_wins' : 'vo_human_wins' });
    next = { ...next, winnerCalled: true };
  }
  const second = finishers[1];
  if (winner !== undefined && second !== undefined && !memory.photoCalled) {
    if (second.raceMs! - winner.raceMs! < CUE_RULES.photoFinishMs) cues.push({ shot: 'fx_photo_finish' }, { voice: 'vo_photo_finish' });
    next = { ...next, photoCalled: true };
  }
  return { cues, memory: next };
}

/** "Three. Two. One. Go!" timed so that it ends just after the start signal. */
async function callCountdown(startAt: number | null, clockOffsetMs: number): Promise<void> {
  const seconds = await sampleSeconds('vo_countdown');
  if (seconds === null) return;
  const untilStartMs = startAt === null ? 0 : startAt - (Date.now() + clockOffsetMs);
  setTimeout(() => announce('vo_countdown'), Math.max(0, untilStartMs - seconds * 1000 + 300));
}

/**
 * Mount for /screen with a race room: the arena ambience, the start horn, the announcer on the countdown, on the
 * lead changing between a human and an AI, on a bot's late decision, on the win and on a photo finish.
 */
export function useRaceSound(room: CueRoom | null | undefined, clockOffsetMs = 0): void {
  useAmbience('amb_arena', 'screen');
  // The announcer needs the first gesture too, also when the pack has no arena ambience.
  useEffect(() => armSamples(), []);
  const memory = useRef<CueMemory>(newCueMemory());
  useEffect(() => {
    if (!room) return;
    const out = raceCues(memory.current, room, Date.now());
    memory.current = out.memory;
    for (const cue of out.cues) {
      if ('voice' in cue) announce(cue.voice);
      else if ('shot' in cue) playSample(cue.shot);
      else void callCountdown(room.startAt, clockOffsetMs);
    }
  }, [room, clockOffsetMs]);
}
