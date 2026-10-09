import type { MissionId } from '@rivetrun/contracts';
import {
  COUNTDOWN_MS,
  MAX_PLAYERS,
  RACE_CODE_LENGTH,
  RACE_TIMEOUT_MS,
  type JoinResponse,
  type RaceAction,
  type RacePlayer,
  type RaceSnapshot,
  type RaceStatus,
} from '../../race/_lib/protocol';

// In-memory rooms (docs/FAST_MODE.md): lost when the Next server restarts.
interface Room {
  readonly code: string;
  missionId: MissionId;
  seed: number;
  status: RaceStatus;
  startAt: number | null;
  raceNo: number;
  /** Bumped on every change; SSE streams send a snapshot when it moves. */
  version: number;
  readonly players: Map<string, RacePlayer>;
  readonly tokens: Map<string, string>;
  /** Server epoch ms of each player's last state post in the current race. */
  readonly lastSeen: Map<string, number>;
  readonly createdAt: number;
}

export type RaceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
/** A phone that stops reporting for this long mid-race (closed tab, lost signal) is scored as a DNF. */
const SILENT_DNF_MS = 8000;
// No I or O: they read as 1 and 0 on a projector.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const holder = globalThis as typeof globalThis & { __rivetrunRooms?: Map<string, Room> };
const rooms: Map<string, Room> = (holder.__rivetrunRooms ??= new Map());

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const newSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

const newCode = (): string => {
  for (;;) {
    const code = Array.from({ length: RACE_CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
};

const freshPlayer = (player: RacePlayer): RacePlayer => ({
  ...player,
  x: 0,
  v: 0,
  damagePct: 0,
  batteryPct: 100,
  lastAction: null,
  lastActionP: null,
  thinking: false,
  done: false,
  finished: false,
  dnfReason: null,
  raceMs: null,
  score: null,
});

/** Time-driven transitions: countdown → racing at startAt, racing → finished when all are done or on timeout. */
function advance(room: Room, now: number): void {
  if (room.status === 'countdown' && room.startAt !== null && now >= room.startAt) {
    room.status = 'racing';
    room.version += 1;
  }
  if (room.status === 'racing' && room.startAt !== null) {
    for (const player of room.players.values()) {
      const seen = room.lastSeen.get(player.id) ?? room.startAt;
      if (!player.done && now - seen > SILENT_DNF_MS) {
        room.players.set(player.id, { ...player, v: 0, thinking: false, done: true, finished: false, dnfReason: 'timeout', raceMs: now - room.startAt });
        room.version += 1;
      }
    }
    const players = [...room.players.values()];
    const allDone = players.length > 0 && players.every((player) => player.done);
    if (allDone || now - room.startAt > RACE_TIMEOUT_MS) {
      room.status = 'finished';
      room.version += 1;
    }
  }
}

export function createRoom(missionId: MissionId): RaceSnapshot {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  const room: Room = {
    code: newCode(),
    missionId,
    seed: newSeed(),
    status: 'lobby',
    startAt: null,
    raceNo: 0,
    version: 0,
    players: new Map(),
    tokens: new Map(),
    lastSeen: new Map(),
    createdAt: now,
  };
  rooms.set(room.code, room);
  return toSnapshot(room, now);
}

const toSnapshot = (room: Room, now: number): RaceSnapshot => ({
  code: room.code,
  missionId: room.missionId,
  seed: room.seed,
  status: room.status,
  startAt: room.startAt,
  serverNow: now,
  raceNo: room.raceNo,
  players: [...room.players.values()],
});

/** Current snapshot plus the version it was built from, or null when the room does not exist. */
export function readRoom(code: string): { snapshot: RaceSnapshot; version: number } | null {
  const room = rooms.get(code);
  if (!room) return null;
  const now = Date.now();
  advance(room, now);
  return { snapshot: toSnapshot(room, now), version: room.version };
}

function join(room: Room, action: Extract<RaceAction, { action: 'join' }>): RaceResult<JoinResponse> {
  if (room.status !== 'lobby') return fail(409, 'The race has already started. Join the next one.');
  if (room.players.size >= MAX_PLAYERS) return fail(409, `The room is full (${MAX_PLAYERS} robots).`);
  const taken = [...room.players.values()].some((p) => p.nickname.toLowerCase() === action.nickname.toLowerCase());
  if (taken) return fail(409, 'That nickname is already in the room.');
  const lanes = new Set([...room.players.values()].map((p) => p.lane));
  let lane = 0;
  while (lanes.has(lane)) lane += 1;
  const playerId = crypto.randomUUID();
  const token = crypto.randomUUID();
  room.players.set(
    playerId,
    freshPlayer({ id: playerId, nickname: action.nickname, build: action.build, briefing: action.briefing || undefined, lane } as RacePlayer),
  );
  room.tokens.set(playerId, token);
  return { ok: true, data: { playerId, token } };
}

function start(room: Room, action: Extract<RaceAction, { action: 'start' }>, now: number): RaceResult<null> {
  if (room.status !== 'lobby') return fail(409, 'The race is already running.');
  if (room.players.size === 0) return fail(409, 'Nobody has joined yet.');
  if (action.missionId) room.missionId = action.missionId;
  room.seed = newSeed();
  room.raceNo += 1;
  room.status = 'countdown';
  room.startAt = now + COUNTDOWN_MS;
  room.lastSeen.clear();
  for (const [id, player] of room.players) room.players.set(id, freshPlayer(player));
  return { ok: true, data: null };
}

function reset(room: Room): RaceResult<null> {
  room.status = 'lobby';
  room.startAt = null;
  for (const [id, player] of room.players) room.players.set(id, freshPlayer(player));
  return { ok: true, data: null };
}

function report(room: Room, action: Extract<RaceAction, { action: 'state' }>, now: number): RaceResult<null> {
  const player = room.players.get(action.playerId);
  if (!player || room.tokens.get(action.playerId) !== action.token) return fail(403, 'Unknown player.');
  // Late posts from a previous race, or after this robot's run ended, are dropped.
  if (action.raceNo !== room.raceNo || room.status !== 'racing' || player.done || room.startAt === null) {
    return { ok: true, data: null };
  }
  room.lastSeen.set(player.id, now);
  room.players.set(player.id, {
    ...player,
    x: action.x,
    v: action.v,
    damagePct: action.damagePct,
    batteryPct: action.batteryPct,
    lastAction: action.lastAction,
    lastActionP: action.lastActionP,
    thinking: action.thinking && !action.done,
    done: action.done,
    finished: action.done && action.finished,
    dnfReason: action.done && !action.finished ? action.dnfReason : null,
    raceMs: action.done ? now - room.startAt : null,
    score: action.done ? action.score : null,
  });
  return { ok: true, data: null };
}

export function applyAction(code: string, action: RaceAction): RaceResult<JoinResponse | null> {
  const room = rooms.get(code);
  if (!room) return fail(404, 'No such room.');
  const now = Date.now();
  advance(room, now);
  const result =
    action.action === 'join'
      ? join(room, action)
      : action.action === 'start'
        ? start(room, action, now)
        : action.action === 'reset'
          ? reset(room)
          : report(room, action, now);
  if (result.ok) {
    room.version += 1;
    advance(room, now);
  }
  return result;
}
