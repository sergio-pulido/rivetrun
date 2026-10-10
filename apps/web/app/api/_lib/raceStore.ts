import type { MissionId } from '@rivetrun/contracts';
import { SCAN_RULES } from '@rivetrun/sim';
import {
  ARENA_BRAINS,
  ARENA_MAX_BOTS,
  BUILD_MS,
  CLOSE_AFTER_LEADER_MS,
  COUNTDOWN_MS,
  GONE_MS,
  MAX_BOTS,
  DEFAULT_SEATS,
  ROOM_FULL_MESSAGE,
  RACE_CODE_LENGTH,
  RACE_TIMEOUT_MS,
  SILENT_MS,
  type JoinResponse,
  type RaceAction,
  type RaceDnf,
  type RacePlayer,
  type RaceSnapshot,
  type RaceStatus,
} from '../../race/_lib/protocol';
import { recordHumanRun } from './humanArena';
import { addRun } from './store';

const SCAN_MISS_PENALTY_MS = SCAN_RULES.missPenaltyS * 1000;

// In-memory rooms (docs/FAST_MODE.md): lost when the Next server restarts.
// This module decides every result: finish times are stamped here, and a race closes here.
interface Room {
  readonly code: string;
  missionId: MissionId;
  seed: number;
  status: RaceStatus;
  buildEndsAt: number | null;
  startAt: number | null;
  closesAt: number | null;
  raceNo: number;
  /** Human seats the host opened. Bots do not take one. */
  seats: number;
  /** Bumped on every change; SSE streams send a snapshot when it moves. */
  version: number;
  readonly players: Map<string, RacePlayer>;
  readonly tokens: Map<string, string>;
  /** Server epoch ms of each player's last state post in the current race. */
  readonly lastSeen: Map<string, number>;
  /** Players whose Episode of the current race is already logged. */
  readonly logged: Set<string>;
  readonly createdAt: number;
}

type Act<K extends RaceAction['action']> = Extract<RaceAction, { action: K }>;
export type RaceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
// No I or O: they read as 1 and 0 on a projector.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const holder = globalThis as typeof globalThis & { __rivetrunRoomsV2?: Map<string, Room> };
const rooms: Map<string, Room> = (holder.__rivetrunRoomsV2 ??= new Map());

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const done = <T>(data: T): RaceResult<T> => ({ ok: true, data });
const newSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

const newCode = (): string => {
  for (;;) {
    const code = Array.from({ length: RACE_CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
};

const onGrid = (player: RacePlayer): RacePlayer => ({
  ...player,
  x: 0,
  v: 0,
  damagePct: 0,
  batteryPct: 100,
  lastAction: null,
  lastActionP: null,
  latencyMs: null,
  thinking: false,
  silent: false,
  done: false,
  finished: false,
  dnfReason: null,
  raceMs: null,
  penaltyMs: 0,
  score: null,
});

const update = (room: Room, player: RacePlayer, patch: Partial<RacePlayer>): void => {
  room.players.set(player.id, { ...player, ...patch });
  room.version += 1;
};

function beginCountdown(room: Room, now: number): void {
  room.status = 'countdown';
  room.buildEndsAt = null;
  room.startAt = now + COUNTDOWN_MS;
  room.closesAt = null;
  room.lastSeen.clear();
  room.logged.clear();
  for (const player of room.players.values()) room.players.set(player.id, onGrid(player));
  room.version += 1;
}

/** Ends the race: everyone still driving gets a DNF with the reason only the room knows. */
function closeRace(room: Room, now: number): void {
  for (const player of room.players.values()) {
    if (player.done) continue;
    const reason: RaceDnf = player.silent ? 'disconnected' : 'race_closed';
    room.players.set(player.id, { ...player, v: 0, thinking: false, done: true, finished: false, dnfReason: reason, raceMs: now - (room.startAt ?? now) });
  }
  room.status = 'finished';
  room.version += 1;
}

/** Time-driven transitions. Called on every read and write, so results never depend on who is watching. */
function advance(room: Room, now: number): void {
  if (room.status === 'build' && room.buildEndsAt !== null) {
    const humans = [...room.players.values()].filter((player) => player.kind === 'human');
    const allReady = humans.length > 0 && humans.every((player) => player.ready);
    if (now >= room.buildEndsAt || allReady) beginCountdown(room, now);
  }
  if (room.status === 'countdown' && room.startAt !== null && now >= room.startAt) {
    room.status = 'racing';
    room.version += 1;
  }
  if (room.status === 'racing' && room.startAt !== null) {
    for (const player of room.players.values()) {
      if (player.done) continue;
      const silent = now - (room.lastSeen.get(player.id) ?? room.startAt) > SILENT_MS;
      if (silent !== player.silent) update(room, player, { silent, thinking: silent ? false : player.thinking });
    }
    const players = [...room.players.values()];
    // The room waits for every device that is still reporting; one that has been gone for GONE_MS no longer holds it open.
    const waitingFor = players.filter((player) => !player.done && now - (room.lastSeen.get(player.id) ?? room.startAt!) <= GONE_MS);
    const closeAt = Math.min(room.closesAt ?? Infinity, room.startAt + RACE_TIMEOUT_MS);
    if (players.length === 0 || waitingFor.length === 0 || now >= closeAt) closeRace(room, now);
  }
}

const toSnapshot = (room: Room, now: number): RaceSnapshot => ({
  code: room.code,
  missionId: room.missionId,
  seed: room.seed,
  status: room.status,
  buildEndsAt: room.buildEndsAt,
  startAt: room.startAt,
  closesAt: room.status === 'racing' ? room.closesAt : null,
  serverNow: now,
  raceNo: room.raceNo,
  seats: room.seats,
  players: [...room.players.values()],
});

export function createRoom(missionId: MissionId): RaceSnapshot {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  const room: Room = {
    code: newCode(),
    missionId,
    seed: newSeed(),
    status: 'lobby',
    buildEndsAt: null,
    startAt: null,
    closesAt: null,
    raceNo: 0,
    seats: DEFAULT_SEATS,
    version: 0,
    players: new Map(),
    tokens: new Map(),
    lastSeen: new Map(),
    logged: new Set(),
    createdAt: now,
  };
  rooms.set(room.code, room);
  return toSnapshot(room, now);
}

/** Current snapshot plus the version it was built from, or null when the room does not exist. */
export function readRoom(code: string): { snapshot: RaceSnapshot; version: number } | null {
  const room = rooms.get(code);
  if (!room) return null;
  const now = Date.now();
  advance(room, now);
  return { snapshot: toSnapshot(room, now), version: room.version };
}

const freeLane = (room: Room): number => {
  const lanes = new Set([...room.players.values()].map((player) => player.lane));
  let lane = 0;
  while (lanes.has(lane)) lane += 1;
  return lane;
};

function seatPlayer(room: Room, fields: Pick<RacePlayer, 'nickname' | 'kind' | 'build' | 'briefing' | 'model'>): JoinResponse {
  const playerId = crypto.randomUUID();
  const token = crypto.randomUUID();
  room.players.set(playerId, onGrid({ ...fields, id: playerId, ready: fields.kind === 'jev', lane: freeLane(room) } as RacePlayer));
  room.tokens.set(playerId, token);
  return { playerId, token, nickname: fields.nickname };
}

const humans = (room: Room): number => [...room.players.values()].filter((player) => player.kind === 'human').length;

const canSeat = (room: Room): RaceResult<null> =>
  room.status === 'lobby' || room.status === 'build' ? done(null) : fail(409, 'The race has already started. Join the next one.');

function join(room: Room, action: Act<'join'>): RaceResult<JoinResponse> {
  const open = canSeat(room);
  if (!open.ok) return open;
  if (humans(room) >= room.seats) return fail(409, ROOM_FULL_MESSAGE);
  const taken = [...room.players.values()].some((player) => player.nickname.toLowerCase() === action.nickname.toLowerCase());
  if (taken) return fail(409, 'That nickname is already in the room.');
  return done(seatPlayer(room, { nickname: action.nickname, kind: 'human', build: action.build, briefing: undefined }));
}

function addBot(room: Room, action: Act<'addBot'>): RaceResult<JoinResponse> {
  const open = canSeat(room);
  if (!open.ok) return open;
  const bots = [...room.players.values()].filter((player) => player.kind === 'jev');
  if (action.model) {
    // Live Arena: one bot per brain, named after it.
    if (bots.length >= ARENA_MAX_BOTS) return fail(409, `At most ${ARENA_MAX_BOTS} brains per race.`);
    if (bots.some((bot) => bot.model === action.model)) return fail(409, 'That brain is already on the grid.');
    const label = ARENA_BRAINS.find((brain) => brain.id === action.model)?.label ?? action.model;
    return done(seatPlayer(room, { nickname: label, kind: 'jev', build: action.build, model: action.model }));
  }
  if (bots.length >= MAX_BOTS) return fail(409, `At most ${MAX_BOTS} JEV bots per room.`);
  const names = new Set(bots.map((bot) => bot.nickname));
  const nickname = ['JEV-1', 'JEV-2', 'JEV-3'].find((name) => !names.has(name)) ?? 'JEV';
  return done(seatPlayer(room, { nickname, kind: 'jev', build: action.build, briefing: action.briefing || undefined }));
}

function remove(room: Room, action: Act<'remove'>): RaceResult<null> {
  if (room.status !== 'lobby' && room.status !== 'build') return fail(409, 'Players can only be removed before the race.');
  room.players.delete(action.playerId);
  room.tokens.delete(action.playerId);
  return done(null);
}

function start(room: Room, action: Act<'start'>, now: number): RaceResult<null> {
  if (room.status === 'build') {
    beginCountdown(room, now); // The host skips the rest of the BUILD phase.
    return done(null);
  }
  if (room.status !== 'lobby') return fail(409, 'The race is already running.');
  if (room.players.size === 0) return fail(409, 'Nobody has joined yet.');
  if (action.missionId) room.missionId = action.missionId;
  room.seed = newSeed();
  room.raceNo += 1;
  room.status = 'build';
  room.buildEndsAt = now + BUILD_MS;
  room.startAt = null;
  room.closesAt = null;
  for (const player of room.players.values()) room.players.set(player.id, onGrid({ ...player, ready: player.kind === 'jev' }));
  return done(null);
}

function setMission(room: Room, action: Act<'mission'>): RaceResult<null> {
  if (room.status !== 'lobby') return fail(409, 'The track can only be changed in the lobby.');
  room.missionId = action.missionId;
  return done(null);
}

function setSeats(room: Room, action: Act<'seats'>): RaceResult<null> {
  if (room.status !== 'lobby') return fail(409, 'Seats can only be changed in the lobby.');
  if (action.seats < humans(room)) return fail(409, `${humans(room)} players are already seated.`);
  room.seats = action.seats;
  return done(null);
}

function setBuild(room: Room, action: Act<'build'>): RaceResult<null> {
  const player = room.players.get(action.playerId);
  if (!player || room.tokens.get(action.playerId) !== action.token) return fail(403, 'Unknown player.');
  if (room.status !== 'lobby' && room.status !== 'build') return fail(409, 'The build is locked: the race has started.');
  room.players.set(player.id, { ...player, build: action.build, ready: room.status === 'build' && action.ready });
  return done(null);
}

function reset(room: Room): RaceResult<null> {
  room.status = 'lobby';
  room.buildEndsAt = null;
  room.startAt = null;
  room.closesAt = null;
  for (const player of room.players.values()) room.players.set(player.id, onGrid({ ...player, ready: player.kind === 'jev' }));
  return done(null);
}

function report(room: Room, action: Act<'state'>, now: number): RaceResult<null> {
  const player = room.players.get(action.playerId);
  if (!player || room.tokens.get(action.playerId) !== action.token) return fail(403, 'Unknown player.');
  // Posts from a previous race, after the race closed, or after this robot's result is final are dropped:
  // the result the room already published stands.
  if (action.raceNo !== room.raceNo || room.status !== 'racing' || player.done || room.startAt === null) return done(null);

  room.lastSeen.set(player.id, now);
  // A scan zone driven past costs the sim's penalty in race time too, for humans and bots alike: without it,
  // skipping the objective would beat a robot that stops for it.
  const penaltyMs = action.done && action.finished ? (action.episode?.outcome.breakdown?.scansMissed ?? 0) * SCAN_MISS_PENALTY_MS : 0;
  const raceMs = now - room.startAt + penaltyMs;
  room.players.set(player.id, {
    ...player,
    x: action.x,
    v: action.v,
    damagePct: action.damagePct,
    batteryPct: action.batteryPct,
    lastAction: action.lastAction,
    lastActionP: action.lastActionP,
    latencyMs: action.latencyMs ?? player.latencyMs,
    thinking: action.thinking && !action.done,
    silent: false,
    done: action.done,
    finished: action.done && action.finished,
    dnfReason: action.done && !action.finished ? (action.dnfReason ?? 'stuck') : null,
    raceMs: action.done ? raceMs : null,
    penaltyMs,
    score: action.done ? action.score : null,
  });
  if (action.done && action.finished && room.closesAt === null) room.closesAt = now + CLOSE_AFTER_LEADER_MS;
  if (action.done && action.episode && !room.logged.has(player.id)) {
    // Room Race runs count as episodes, like a run submitted from the Result screen.
    room.logged.add(player.id);
    // A race run that replays from its input log also counts for the arena's human row. The race result itself is
    // the server's own clock and stands either way, but an episode whose replay gives a different result is not
    // logged: its score would otherwise reach the leaderboard unchecked.
    const check = player.kind === 'human' ? recordHumanRun(player.nickname, action.episode) : null;
    if (check?.verdict !== 'mismatch') addRun(player.nickname, action.episode);
  }
  return done(null);
}

export function applyAction(code: string, action: RaceAction): RaceResult<JoinResponse | null> {
  const room = rooms.get(code);
  if (!room) return fail(404, 'No such room.');
  const now = Date.now();
  advance(room, now);
  const result: RaceResult<JoinResponse | null> =
    action.action === 'join'
      ? join(room, action)
      : action.action === 'addBot'
        ? addBot(room, action)
        : action.action === 'remove'
          ? remove(room, action)
          : action.action === 'mission'
            ? setMission(room, action)
            : action.action === 'seats'
              ? setSeats(room, action)
            : action.action === 'start'
              ? start(room, action, now)
            : action.action === 'build'
              ? setBuild(room, action)
              : action.action === 'reset'
                ? reset(room)
                : report(room, action, now);
  if (result.ok) {
    room.version += 1;
    advance(room, now);
  }
  return result;
}
