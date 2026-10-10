import { heuristicBrain, MISSIONS, PRESETS, runHeadless } from '@rivetrun/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTDOWN_MS, rankPlayers, resultText, type JoinResponse } from '../../race/_lib/protocol';
import { applyAction, createRoom, readRoom } from './raceStore';

const build = PRESETS.all_rounder.build;
const TRACK_M = 20;

describe('room race results', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('adds the missed-scan penalty to the race time, so skipping a scan zone does not beat stopping for it', async () => {
    const { episode } = await runHeadless(MISSIONS.M1, 1001, build, heuristicBrain, { priority: 0.5 });
    const { code } = createRoom('M1');
    const join = (nickname: string): JoinResponse => {
      const joined = applyAction(code, { action: 'join', nickname, build });
      if (!joined.ok || !joined.data) throw new Error('join failed');
      return joined.data;
    };
    const skipper = join('Skipper');
    const scanner = join('Scanner');
    expect(applyAction(code, { action: 'start' }).ok).toBe(true); // opens the BUILD phase
    expect(applyAction(code, { action: 'start' }).ok).toBe(true); // the host skips the rest of it
    vi.advanceTimersByTime(COUNTDOWN_MS + 100);
    expect(readRoom(code)!.snapshot.status).toBe('racing');
    const raceNo = readRoom(code)!.snapshot.raceNo;
    const finish = (seat: JoinResponse, scansMissed: number) =>
      applyAction(code, {
        action: 'state', playerId: seat.playerId, token: seat.token, raceNo, x: TRACK_M, v: 0, damagePct: 0, batteryPct: 90,
        lastAction: null, lastActionP: null, thinking: false, done: true, finished: true, dnfReason: null, score: 800,
        episode: { ...episode, outcome: { ...episode.outcome, breakdown: { ...episode.outcome.breakdown!, scansMissed } } },
      });

    // Both phones post their progress while they drive, as real ones do (a silent phone is dropped after 20 s).
    const drive = (seats: readonly JoinResponse[], ms: number): void => {
      for (let t = 0; t < ms; t += 2_000) {
        vi.advanceTimersByTime(2_000);
        for (const seat of seats) applyAction(code, { action: 'state', playerId: seat.playerId, token: seat.token, raceNo, x: 5, v: 1, damagePct: 0, batteryPct: 95, lastAction: null, lastActionP: null, thinking: false, done: false, finished: false, dnfReason: null, score: null });
      }
    };
    drive([skipper, scanner], 18_000);
    vi.advanceTimersByTime(2_000);
    expect(finish(skipper, 1).ok).toBe(true);
    drive([scanner], 2_000);
    vi.advanceTimersByTime(2_000);
    expect(finish(scanner, 0).ok).toBe(true);

    const { snapshot } = readRoom(code)!;
    const ranked = rankPlayers(snapshot.players);
    expect(ranked.map((player) => player.nickname)).toEqual(['Scanner', 'Skipper']);
    const [first, second] = ranked;
    expect(first!.penaltyMs).toBe(0);
    expect(second!.penaltyMs).toBe(10_000);
    expect(second!.raceMs! - first!.raceMs!).toBe(6_000);
    expect(resultText(second!, TRACK_M)).toContain('incl. +10 s missed scan');
    expect(resultText(first!, TRACK_M)).not.toContain('missed scan');
  });
});
