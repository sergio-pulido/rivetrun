import type { Episode } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_CLOSE_AFTER_RESULTS_MS, AUTO_LOBBY_MS, AUTO_MIN_LANES, AUTO_ROOM_CAP, COUNTDOWN_MS, RACE_TIMEOUT_MS, type MatchResponse } from '../../race/_lib/protocol';
import { applyAction, autoRooms, createRoom, matchRoom, pickInRoom, readRoom } from './raceStore';
import { episodeCount } from './store';

// Auto rooms (RR-PLAN §5): /play phones are matched into rooms that fill up and start on their own.
const seat = (options: { test?: boolean } = {}): MatchResponse => {
  const result = matchRoom(options);
  if (!result.ok) throw new Error(`no room: ${result.error}`);
  return result.data;
};
/** Lets every open room run to its end and be removed, so tests do not see each other's rooms. */
const drain = (): void => {
  for (let round = 0; round < 3; round += 1) {
    vi.advanceTimersByTime(AUTO_LOBBY_MS + COUNTDOWN_MS + RACE_TIMEOUT_MS + AUTO_CLOSE_AFTER_RESULTS_MS + 5_000);
    autoRooms();
    autoRooms({ test: true });
  }
};

let clock = 2_000_000;

describe('auto rooms', () => {
  beforeEach(() => {
    clock += 10_000_000;
    vi.useFakeTimers({ now: clock });
    delete process.env.MAX_AUTO_ROOMS;
    delete process.env.PLAY_MISSION;
  });
  afterEach(() => {
    drain();
    vi.useRealTimers();
  });

  it('fill order: phones join the oldest lobby with a free slot and more than 8 s left; a room caps at 8', () => {
    const first = seat();
    expect(first.endsAt).toBe(clock + AUTO_LOBBY_MS);
    const others = Array.from({ length: AUTO_ROOM_CAP - 1 }, () => seat());
    expect(new Set(others.map((s) => s.code))).toEqual(new Set([first.code]));
    expect(new Set([first, ...others].map((s) => s.playerId)).size).toBe(AUTO_ROOM_CAP);
    // The ninth phone opens a second room.
    const ninth = seat();
    expect(ninth.code).not.toBe(first.code);
    // With 8 s or less on a lobby's clock a new phone is not put into it.
    vi.advanceTimersByTime(AUTO_LOBBY_MS - 7_000);
    const late = seat();
    expect(late.code).not.toBe(ninth.code);
    expect(late.code).not.toBe(first.code);
    expect(readRoom(first.code)!.snapshot.players.filter((p) => p.kind === 'human')).toHaveLength(AUTO_ROOM_CAP);
  });

  it('countdown start: 30 s from the first phone, defaults for whoever did not pick, bots fill to four lanes, same mission and seed for every room', () => {
    const alone = seat();
    const other = seat();
    expect(other.code).toBe(alone.code);
    expect(pickInRoom(alone.code, alone.playerId, alone.token, { presetId: 'mud_crawler', agent: 'human', strategy: 'careful' }).ok).toBe(true);
    vi.advanceTimersByTime(AUTO_LOBBY_MS - 100);
    expect(readRoom(alone.code)!.snapshot.status).toBe('lobby');
    vi.advanceTimersByTime(200);
    const started = readRoom(alone.code)!.snapshot;
    expect(started.status).toBe('countdown');
    expect(started.raceNo).toBe(1);
    expect(started.players).toHaveLength(AUTO_MIN_LANES);
    const picked = started.players.find((p) => p.id === alone.playerId)!;
    expect(picked).toMatchObject({ kind: 'human', build: PRESETS.mud_crawler.build, pick: { presetId: 'mud_crawler', agent: 'human', strategy: 'careful' } });
    // The phone that tapped nothing: All-rounder, Jev, the plan.
    const defaulted = started.players.find((p) => p.id === other.playerId)!;
    expect(defaulted).toMatchObject({ kind: 'jev', model: 'jev-1.13.0', pick: { presetId: 'all_rounder', agent: 'jev-1.13.0', strategy: 'plan' } });
    // A briefing reaches the driver: the committed plan's when the play mission has one, the resolver's fallback otherwise.
    expect(defaulted.briefing!.length).toBeGreaterThan(10);
    const bots = started.players.filter((p) => p.serverDriven);
    expect(bots).toHaveLength(2);
    // A second room runs the same mission on the same seed.
    const elsewhere = readRoom(seat().code)!.snapshot;
    expect([elsewhere.missionId, elsewhere.seed]).toEqual([started.missionId, started.seed]);
    // A pick after the start is refused.
    expect(pickInRoom(alone.code, alone.playerId, alone.token, { presetId: 'speedster', agent: 'human', strategy: 'eco' })).toMatchObject({ ok: false, status: 409 });
  });

  it('starts early only when the room is full and every phone has picked', () => {
    const seats = Array.from({ length: AUTO_ROOM_CAP }, () => seat());
    const code = seats[0]!.code;
    for (const s of seats.slice(0, -1)) pickInRoom(code, s.playerId, s.token, { presetId: 'all_rounder', agent: 'human', strategy: 'plan' });
    expect(readRoom(code)!.snapshot.status).toBe('lobby');
    const last = seats[seats.length - 1]!;
    pickInRoom(code, last.playerId, last.token, { presetId: 'speedster', agent: 'gpt-6-luna', strategy: 'daredevil' });
    const snapshot = readRoom(code)!.snapshot;
    expect(snapshot.status).toBe('countdown');
    expect(snapshot.players).toHaveLength(AUTO_ROOM_CAP);
    expect(snapshot.players.find((p) => p.id === last.playerId)).toMatchObject({ kind: 'jev', model: 'gpt-6-luna', briefing: 'Speed is everything. Take risks.', priority: 0.15 });
    // An agent that is not a brain of the arena is refused.
    const fresh = seat();
    expect(pickInRoom(fresh.code, fresh.playerId, fresh.token, { presetId: 'all_rounder', agent: 'skynet', strategy: 'plan' })).toMatchObject({ ok: false, status: 400 });
    expect(pickInRoom(fresh.code, fresh.playerId, 'wrong-token', { presetId: 'all_rounder', agent: 'human', strategy: 'plan' })).toMatchObject({ ok: false, status: 403 });
  });

  it('the server drives its own bots to a result, and the room is removed 60 s after the results', () => {
    const phone = seat();
    pickInRoom(phone.code, phone.playerId, phone.token, { presetId: 'all_rounder', agent: 'human', strategy: 'plan' });
    vi.advanceTimersByTime(AUTO_LOBBY_MS + 100);
    expect(readRoom(phone.code)!.snapshot.status).toBe('countdown');
    vi.advanceTimersByTime(COUNTDOWN_MS + 200);
    expect(readRoom(phone.code)!.snapshot.status).toBe('racing');
    // Nobody posts for the bots; ten seconds in they have moved.
    vi.advanceTimersByTime(10_000);
    const moving = readRoom(phone.code)!.snapshot.players.filter((p) => p.serverDriven);
    expect(moving.length).toBe(AUTO_MIN_LANES - 1);
    expect(moving.every((bot) => bot.x > 3)).toBe(true);
    // The phone never drives: it goes silent, the bots finish on their own, and the race closes.
    for (let i = 0; i < 40 && readRoom(phone.code)!.snapshot.status === 'racing'; i += 1) vi.advanceTimersByTime(5_000);
    const result = readRoom(phone.code)!.snapshot;
    expect(result.status).toBe('finished');
    const bots = result.players.filter((p) => p.serverDriven);
    // Each bot's run is over, with a time and a score: a finish on a mission the stock robot can finish, a DNF with its
    // reason where it cannot (the play mission is a setting, and this test must hold for any of them).
    expect(bots.every((bot) => bot.done && bot.raceMs !== null && bot.score !== null && (bot.finished || bot.dnfReason !== null))).toBe(true);
    expect(result.players.find((p) => p.id === phone.playerId)).toMatchObject({ done: true, finished: false });
    expect(result.auto!.removedAt).not.toBeNull();
    vi.advanceTimersByTime(AUTO_CLOSE_AFTER_RESULTS_MS + 1_000);
    expect(readRoom(phone.code)).toBeNull();
  });

  it('MAX_AUTO_ROOMS: beyond it a phone is told when to retry, and a slot frees when a room ends', () => {
    process.env.MAX_AUTO_ROOMS = '2';
    const a = seat();
    vi.advanceTimersByTime(AUTO_LOBBY_MS - 5_000); // too late to join room a
    const b = seat();
    expect(b.code).not.toBe(a.code);
    vi.advanceTimersByTime(AUTO_LOBBY_MS - 5_000); // too late to join room b; a is racing
    const refused = matchRoom();
    expect(refused).toMatchObject({ ok: false, status: 503 });
    expect(!refused.ok && refused.status === 503 && refused.retryInS).toBeGreaterThanOrEqual(1);
    // Both rooms run out; then there is room again.
    vi.advanceTimersByTime(COUNTDOWN_MS + RACE_TIMEOUT_MS + 10_000);
    expect(matchRoom().ok).toBe(true);
  });

  it('test rooms: matched apart from real phones, absent from the grid, and their runs reach no board', () => {
    const real = seat();
    const fake = seat({ test: true });
    expect(fake.code).not.toBe(real.code);
    expect(autoRooms().map((room) => room.code)).toEqual([real.code]);
    expect(autoRooms({ test: true }).map((room) => room.code)).toEqual([fake.code]);
    expect(readRoom(fake.code)!.snapshot.auto!.test).toBe(true);
    pickInRoom(fake.code, fake.playerId, fake.token, { presetId: 'all_rounder', agent: 'human', strategy: 'plan' });
    vi.advanceTimersByTime(AUTO_LOBBY_MS + 100);
    readRoom(fake.code);
    vi.advanceTimersByTime(COUNTDOWN_MS + 500);
    const raceNo = readRoom(fake.code)!.snapshot.raceNo;
    const before = episodeCount();
    const episode = { id: 'load-1', missionId: 'M5', seed: 1, policy: 'human', build: PRESETS.all_rounder.build, environment: { weather: 'rain', frictionJitter: 1, sensorNoiseSeed: 1 }, priority: 0.5, decisions: [], outcome: { finished: true, timeS: 40, damagePct: 0, energyUsedPct: 20, costEur: 205, score: 700, stars: 2 } } as unknown as Episode;
    const posted = applyAction(fake.code, { action: 'state', playerId: fake.playerId, token: fake.token, raceNo, x: 70, v: 0, damagePct: 0, batteryPct: 80, lastAction: null, lastActionP: null, thinking: false, done: true, finished: true, dnfReason: null, score: 700, episode });
    expect(posted.ok).toBe(true);
    expect(readRoom(fake.code)!.snapshot.players.find((p) => p.id === fake.playerId)).toMatchObject({ done: true, finished: true });
    expect(episodeCount()).toBe(before);
  });

  it('rooms with a code keep working unchanged, and a pick is refused there', () => {
    const { code } = createRoom('M1');
    const joined = applyAction(code, { action: 'join', nickname: 'Ada', build: PRESETS.all_rounder.build });
    expect(joined.ok).toBe(true);
    expect(readRoom(code)!.snapshot.auto).toBeUndefined();
    expect(autoRooms().some((room) => room.code === code)).toBe(false);
    vi.advanceTimersByTime(AUTO_LOBBY_MS * 3);
    expect(readRoom(code)!.snapshot.status).toBe('lobby'); // nothing starts by itself
    expect(pickInRoom(code, 'x', 'y', { presetId: 'all_rounder', agent: 'human', strategy: 'plan' })).toMatchObject({ ok: false, status: 409 });
    // A planned bot and a plain one of the same brain can share the grid; a second plain one cannot.
    const bot = (plan: boolean) => applyAction(code, { action: 'addBot', build: PRESETS.all_rounder.build, model: 'jev-1.13.0', ...(plan ? { plan: true, briefing: 'Climb mode on the mud.', priority: 0.4 } : {}) });
    expect(bot(false).ok).toBe(true);
    expect(bot(true).ok).toBe(true);
    expect(bot(false).ok).toBe(false);
    const planned = readRoom(code)!.snapshot.players.find((p) => p.plan)!;
    expect(planned).toMatchObject({ nickname: 'Jev + plan', briefing: 'Climb mode on the mud.', priority: 0.4, model: 'jev-1.13.0' });
  });
});

describe('auto rooms per mission (RR-PLAN amendment)', () => {
  beforeEach(() => {
    clock += 10_000_000;
    vi.useFakeTimers({ now: clock });
    delete process.env.MAX_AUTO_ROOMS;
  });
  afterEach(() => {
    drain();
    vi.useRealTimers();
  });
  const match = (missionId?: 'M5' | 'M6' | 'M7' | 'M8' | 'M1') => matchRoom(missionId ? { missionId } : {});
  const seated = (missionId?: 'M5' | 'M6' | 'M7' | 'M8') => {
    const result = match(missionId);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };

  it('a phone joins the oldest open room of its mission; another mission opens its own room on its own fixed seed', () => {
    const a = seated('M5');
    const b = seated('M8');
    const c = seated('M5');
    const d = seated('M8');
    expect(c.code).toBe(a.code);
    expect(d.code).toBe(b.code);
    expect(b.code).not.toBe(a.code);
    const mA = readRoom(a.code)!.snapshot;
    const mB = readRoom(b.code)!.snapshot;
    expect([mA.missionId, mB.missionId]).toEqual(['M5', 'M8']);
    expect(mA.seed).not.toBe(mB.seed);
    // A later M5 room, after the first one's lobby has too little left, runs the same seed as the first.
    vi.advanceTimersByTime(AUTO_LOBBY_MS - 5_000);
    const later = seated('M5');
    expect(later.code).not.toBe(a.code);
    expect(readRoom(later.code)!.snapshot.seed).toBe(mA.seed);
  });

  it('no mission asked: the play mission; a mission that is not open is rejected', () => {
    const byDefault = readRoom(seated().code)!.snapshot;
    const named = readRoom(seated(byDefault.missionId as 'M7').code)!.snapshot;
    expect(named.code).toBe(byDefault.code);
    expect(match('M1')).toMatchObject({ ok: false, status: 400 });
    expect(autoRooms().every((room) => room.missionId !== 'M1')).toBe(true);
  });

  it('MAX_AUTO_ROOMS counts every mission together', () => {
    process.env.MAX_AUTO_ROOMS = '2';
    seated('M5');
    seated('M6');
    const third = match('M8');
    expect(third).toMatchObject({ ok: false, status: 503 });
    // A phone for a mission that already has an open room still gets in.
    expect(match('M5').ok).toBe(true);
  });

  it('a mission tap moves the phone: it gives up its lobby seat and is seated in the other mission\'s room', () => {
    const first = seated('M7');
    const friend = seated('M7');
    const moved = matchRoom({ missionId: 'M5', leave: { code: first.code, playerId: first.playerId, token: first.token } });
    if (!moved.ok) throw new Error(moved.error);
    expect(moved.data.code).not.toBe(first.code);
    expect(readRoom(moved.data.code)!.snapshot.missionId).toBe('M5');
    const old = readRoom(first.code)!.snapshot;
    expect(old.players.map((p) => p.id)).toEqual([friend.playerId]);
    // Tapping the mission it is already in keeps the seat; a wrong token moves nobody.
    const same = matchRoom({ missionId: 'M5', leave: { code: moved.data.code, playerId: moved.data.playerId, token: moved.data.token } });
    expect(same.ok && same.data.playerId).toBe(moved.data.playerId);
    matchRoom({ missionId: 'M5', leave: { code: first.code, playerId: friend.playerId, token: 'wrong' } });
    expect(readRoom(first.code)!.snapshot.players.map((p) => p.id)).toEqual([friend.playerId]);
    // The last phone leaving an auto room removes it, so it does not hold one of the MAX_AUTO_ROOMS.
    const gone = matchRoom({ missionId: 'M5', leave: { code: first.code, playerId: friend.playerId, token: friend.token } });
    expect(gone.ok).toBe(true);
    expect(readRoom(first.code)).toBeNull();
  });

  it('a pick without a strategy gets the plan', async () => {
    const { PlayerPickSchema } = await import('@rivetrun/contracts');
    expect(PlayerPickSchema.parse({ presetId: 'speedster', agent: 'human' })).toEqual({ presetId: 'speedster', agent: 'human', strategy: 'plan' });
    const phone = seated('M7');
    const pick = PlayerPickSchema.parse({ presetId: 'speedster', agent: 'jev-1.13.0' });
    expect(pickInRoom(phone.code, phone.playerId, phone.token, pick).ok).toBe(true);
    expect(readRoom(phone.code)!.snapshot.players.find((p) => p.id === phone.playerId)!.pick).toEqual({ presetId: 'speedster', agent: 'jev-1.13.0', strategy: 'plan' });
  });
});
