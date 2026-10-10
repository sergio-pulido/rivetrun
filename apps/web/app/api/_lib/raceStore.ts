import type { Build, GhostTrace, MissionId, PlayerPick } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, SCAN_RULES, driveSeed, runHeuristicSync, score, TUNING } from '@rivetrun/sim';
import {
  ARENA_BRAINS,
  ARENA_MAX_BOTS,
  ArenaBrainIdSchema,
  AUTO_CLOSE_AFTER_RESULTS_MS,
  AUTO_LOBBY_MS,
  AUTO_MIN_LANES,
  AUTO_MIN_LEFT_MS,
  AUTO_ROOM_CAP,
  DEFAULT_MAX_AUTO_ROOMS,
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
  type MatchResponse,
  type RaceAction,
  type RaceDnf,
  type RacePlayer,
  type RaceSnapshot,
  type RaceStatus,
} from '../../race/_lib/protocol';
import { peekGhost, requestGhost } from './ghostStore';
import { recordHumanRun, recordPlayResults } from './humanArena';
import { PLAY_MISSION, PLAY_MISSIONS } from '@/play/playMission';
import { resolveStrategy } from './playStrategy';
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
  /** Set on rooms the matchmaker opened (/play). */
  auto?: AutoRoom;
}

interface AutoRoom {
  /** Server epoch ms when the lobby countdown ends. */
  readonly endsAt: number;
  /** A load-test room: its runs reach no board and no episode log. */
  readonly test: boolean;
  /** Phones seated by the matchmaker, whatever agent they then pick. */
  readonly phones: Set<string>;
  /** Phones that sent a pick with `ready: false`: still choosing. */
  readonly choosing: Set<string>;
  /** Recorded runs the server replays for its own bots, by player id. */
  readonly replays: Map<string, GhostTrace>;
  /** Set when the results are in: the room is removed AUTO_CLOSE_AFTER_RESULTS_MS later. */
  finishedAt: number | null;
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
  medianLatencyMs: null,
  lateDecisions: null,
  missedDecisions: null,
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
  // "Best combo today": the lanes of an auto room that a phone picked and that finished. Test rooms stay off the board.
  if (room.auto && !room.auto.test) {
    recordPlayResults(
      [...room.players.values()].flatMap((player) =>
        player.pick && player.finished && player.raceMs !== null
          ? [{ missionId: room.missionId, presetId: player.pick.presetId, agent: player.pick.agent, nickname: player.nickname, timeS: Math.round(player.raceMs / 100) / 10 }]
          : [],
      ),
    );
  }
}

/** Time-driven transitions. Called on every read and write, so results never depend on who is watching. */
function advance(room: Room, now: number): void {
  if (room.auto) advanceAuto(room, room.auto, now);
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
    if (room.auto) replayServerBots(room, room.auto, now);
    for (const player of room.players.values()) {
      if (player.done || player.serverDriven) continue;
      const silent = now - (room.lastSeen.get(player.id) ?? room.startAt) > SILENT_MS;
      if (silent !== player.silent) update(room, player, { silent, thinking: silent ? false : player.thinking });
    }
    const players = [...room.players.values()];
    // The room waits for every device that is still reporting; one that has been gone for GONE_MS no longer holds it open.
    const waitingFor = players.filter((player) => !player.done && (player.serverDriven === true || now - (room.lastSeen.get(player.id) ?? room.startAt!) <= GONE_MS));
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
  ...(room.auto ? { auto: { endsAt: room.auto.endsAt, removedAt: room.auto.finishedAt === null ? null : room.auto.finishedAt + AUTO_CLOSE_AFTER_RESULTS_MS, test: room.auto.test } } : {}),
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
  if (expired(room, now)) {
    rooms.delete(code);
    return null;
  }
  return { snapshot: toSnapshot(room, now), version: room.version };
}

const freeLane = (room: Room): number => {
  const lanes = new Set([...room.players.values()].map((player) => player.lane));
  let lane = 0;
  while (lanes.has(lane)) lane += 1;
  return lane;
};

function seatPlayer(room: Room, fields: Pick<RacePlayer, 'nickname' | 'kind' | 'build' | 'briefing' | 'model'> & Partial<Pick<RacePlayer, 'priority' | 'plan' | 'pick' | 'serverDriven'>>): JoinResponse {
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
    // One bot per brain, and one more with a plan: "Jev" and "Jev + plan" race side by side.
    const planned = action.plan === true;
    if (bots.some((bot) => bot.model === action.model && (bot.plan === true) === planned)) return fail(409, 'That brain is already on the grid.');
    const label = ARENA_BRAINS.find((brain) => brain.id === action.model)?.label ?? action.model;
    return done(seatPlayer(room, {
      nickname: planned ? `${label} + plan` : label, kind: 'jev', build: action.build, model: action.model,
      briefing: action.briefing || undefined, ...(action.priority !== undefined ? { priority: action.priority } : {}), ...(planned ? { plan: true } : {}),
    }));
  }
  if (bots.length >= MAX_BOTS) return fail(409, `At most ${MAX_BOTS} JEV bots per room.`);
  const names = new Set(bots.map((bot) => bot.nickname));
  const nickname = ['JEV-1', 'JEV-2', 'JEV-3'].find((name) => !names.has(name)) ?? 'JEV';
  return done(seatPlayer(room, {
    nickname, kind: 'jev', build: action.build, briefing: action.briefing || undefined,
    ...(action.priority !== undefined ? { priority: action.priority } : {}), ...(action.plan ? { plan: true } : {}),
  }));
}

function remove(room: Room, action: Act<'remove'>): RaceResult<null> {
  if (room.status !== 'lobby' && room.status !== 'build') return fail(409, 'Players can only be removed before the race.');
  room.players.delete(action.playerId);
  room.tokens.delete(action.playerId);
  room.auto?.phones.delete(action.playerId);
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
    medianLatencyMs: action.medianLatencyMs ?? player.medianLatencyMs,
    lateDecisions: action.lateDecisions ?? player.lateDecisions,
    missedDecisions: action.missedDecisions ?? player.missedDecisions,
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
    // A load-test room's runs reach no board and no episode log.
    if (room.auto?.test) return done(null);
    // A race run that replays from its input log also counts for the arena's human row. The race result itself is
    // the server's own clock and stands either way, but an episode whose replay gives a different result is not
    // logged: its score would otherwise reach the leaderboard unchecked.
    const check = player.kind === 'human' ? recordHumanRun(player.nickname, action.episode) : null;
    // A bot's label can hold characters a leaderboard nickname may not ("GPT-6.1 Sol (reasoning)"): logged without them.
    const boardName = player.kind === 'jev' ? player.nickname.replace(/[^\w .-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim() || 'AI' : player.nickname;
    if (check?.verdict !== 'mismatch') addRun(boardName, action.episode);
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

// ---- Auto rooms (RR-PLAN §5): /play phones are matched into rooms that fill up and start on their own.

const JEV_AGENT = ARENA_BRAINS[0].id;
const maxAutoRooms = (): number => {
  const value = Number(process.env.MAX_AUTO_ROOMS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_AUTO_ROOMS;
};
/** The mission every auto room runs (env PLAY_MISSION, from the rehearsal), on its fixed seed so the board compares like with like. */
const playMission = (): MissionId => PLAY_MISSION;

const expired = (room: Room, now: number): boolean =>
  room.auto !== undefined && ((room.auto.finishedAt !== null && now >= room.auto.finishedAt + AUTO_CLOSE_AFTER_RESULTS_MS) || (room.status === 'lobby' && room.auto.phones.size === 0 && now >= room.auto.endsAt));

const busy = (room: Room): boolean => room.status === 'lobby' || room.status === 'build' || room.status === 'countdown' || room.status === 'racing';

/** Gives a phone that has not picked the defaults: All-rounder, Jev, the plan. */
function applyPick(room: Room, player: RacePlayer, pick: PlayerPick): void {
  const strategy = resolveStrategy(room.missionId, pick.presetId, pick.strategy);
  const human = pick.agent === 'human';
  const { briefing: _briefing, priority: _priority, plan: _plan, model: _model, ...rest } = player;
  room.players.set(player.id, {
    ...rest,
    kind: human ? 'human' : 'jev',
    // The plan carries its own build, which may add a part to the preset's.
    build: strategy.build,
    pick,
    ready: true,
    // A human drives by hand: the strategy is shown on their lane but there is no brain to brief.
    ...(human ? {} : { model: pick.agent, priority: strategy.priority, briefing: strategy.briefing }),
    ...(strategy.plan ? { plan: true } : {}),
  });
}

/** The fixed rules' own run of this room's track, as a trace the server can replay for a bot. */
function heuristicTrace(room: Room, build: Build): GhostTrace {
  const mission = MISSIONS[room.missionId];
  const frames: GhostTrace['frames'] = [];
  const every = Math.max(1, Math.round(1000 / TUNING.ghostHz / TUNING.dtMs));
  const run = runHeuristicSync({ mission, seed: room.seed, build, priority: 0.5 }, (_prev, next) => {
    if (next.stepCount % every === 0 || next.done) frames.push(next.sim);
  });
  return { policy: 'heuristic', frames, outcome: score(run.state) };
}

/** Fills the room to AUTO_MIN_LANES with bots the server moves itself: Jev with the plan when its recorded run is ready, the fixed rules otherwise. */
function fillWithBots(room: Room, auto: AutoRoom): void {
  // RR-GUARD, cache first: a phone that picked an AI agent gets the recorded run of exactly that pick when the server
  // has it (the prewarm drives all 48). The server then moves the lane and no provider is called; only a pick with
  // no recorded run is driven live from the phone, under the visitor limits.
  for (const player of [...room.players.values()]) {
    if (player.kind !== 'jev' || !player.pick || player.serverDriven) continue;
    const recorded = peekGhost({
      missionId: room.missionId, seed: room.seed, build: player.build, priority: player.priority ?? 0.5,
      ...(player.briefing ? { briefing: player.briefing } : {}), ...(player.model && player.model !== JEV_AGENT ? { agent: player.model } : {}),
    });
    if (!recorded) continue;
    room.players.set(player.id, { ...player, serverDriven: true });
    auto.replays.set(player.id, recorded.ghost);
  }
  const strategy = resolveStrategy(room.missionId, 'all_rounder', 'plan');
  const build = strategy.build;
  const ready = peekGhost({ missionId: room.missionId, seed: room.seed, build, priority: strategy.priority, briefing: strategy.briefing });
  let n = 0;
  while (room.players.size < AUTO_MIN_LANES) {
    n += 1;
    // The second and later fill lanes are always the fixed rules: identical Jev runs side by side would show nothing.
    const jev = ready !== null && n === 1;
    const base = jev ? (strategy.plan ? 'Jev + plan' : 'Jev') : 'Fixed rules';
    const taken = new Set([...room.players.values()].map((player) => player.nickname));
    let nickname = base;
    for (let suffix = 2; taken.has(nickname); suffix += 1) nickname = `${base} ${suffix}`;
    const seat = seatPlayer(room, {
      nickname, kind: 'jev', build, model: jev ? JEV_AGENT : 'heuristic', serverDriven: true,
      ...(jev ? { priority: strategy.priority, briefing: strategy.briefing, ...(strategy.plan ? { plan: true } : {}) } : {}),
    });
    auto.replays.set(seat.playerId, // The fixed rules drive the build their lane shows (the plan's, when there is one): on a mission the plain
    // preset cannot finish, a fill lane that never finishes would only say the room is broken.
    jev ? ready.ghost : heuristicTrace(room, build));
  }
}

/** Lobby countdown, start, and removal of an auto room. */
function advanceAuto(room: Room, auto: AutoRoom, now: number): void {
  if (room.status === 'lobby' && auto.phones.size > 0) {
    const phones = [...auto.phones].map((id) => room.players.get(id)).filter((player): player is RacePlayer => player !== undefined);
    // The countdown is only for phones that are still choosing: once every phone in the room has picked, a solo
    // player included, the race starts at once (the usual start lights, then go). A started room takes no new phones.
    const allPicked = phones.length > 0 && phones.every((player) => player.pick !== undefined && !auto.choosing.has(player.id));
    if (now >= auto.endsAt || allPicked) {
      for (const player of phones) if (!player.pick) applyPick(room, player, { presetId: 'all_rounder', agent: JEV_AGENT, strategy: 'plan' });
      fillWithBots(room, auto);
      room.raceNo += 1;
      beginCountdown(room, now);
    }
  }
  if (room.status === 'finished' && auto.finishedAt === null) {
    auto.finishedAt = now;
    room.version += 1;
  }
}

/** Moves the server's own bots along their recorded runs. Race time is the run's own time, as for a device that posts. */
function replayServerBots(room: Room, auto: AutoRoom, now: number): void {
  if (room.startAt === null) return;
  const elapsedS = (now - room.startAt) / 1000;
  for (const [playerId, trace] of auto.replays) {
    const player = room.players.get(playerId);
    if (!player || player.done || trace.frames.length === 0) continue;
    const outcome = trace.outcome;
    const lastT = trace.frames[trace.frames.length - 1]!.t;
    if (elapsedS >= lastT) {
      const penaltyMs = outcome.finished ? (outcome.breakdown?.scansMissed ?? 0) * SCAN_MISS_PENALTY_MS : 0;
      const last = trace.frames[trace.frames.length - 1]!;
      room.players.set(playerId, {
        ...player, x: last.x, v: 0, damagePct: Math.min(100, last.damage), batteryPct: Math.max(0, last.battery), thinking: false, done: true,
        finished: outcome.finished, dnfReason: outcome.finished ? null : (outcome.dnfReason ?? 'stuck'), raceMs: Math.round(lastT * 1000) + penaltyMs, penaltyMs, score: outcome.score,
      });
      if (outcome.finished && room.closesAt === null) room.closesAt = now + CLOSE_AFTER_LEADER_MS;
      room.version += 1;
      continue;
    }
    // Frames are 10 Hz of sim time; the clock can jump (a fall), so find the last frame at or before now.
    let index = Math.max(0, Math.min(trace.frames.length - 1, Math.floor(elapsedS * TUNING.ghostHz)));
    while (index > 0 && trace.frames[index]!.t > elapsedS) index -= 1;
    const frame = trace.frames[index]!;
    if (frame.x !== player.x || frame.v !== player.v) {
      room.players.set(playerId, { ...player, x: frame.x, v: frame.v, damagePct: Math.min(100, frame.damage), batteryPct: Math.max(0, frame.battery) });
      room.version += 1;
    }
  }
}

export type MatchResult =
  | { ok: true; data: MatchResponse }
  | { ok: false; status: 503; error: string; retryInS: number }
  | { ok: false; status: 400; error: string };

/**
 * /play: seats the phone in the oldest auto room that is still in its lobby with a free slot and more than
 * AUTO_MIN_LEFT_MS on the clock, or opens a new one. With MAX_AUTO_ROOMS busy it answers "next race in N s".
 */
export function matchRoom(options: { nickname?: string; test?: boolean; missionId?: MissionId; leave?: { code: string; playerId: string; token: string } } = {}): MatchResult {
  const now = Date.now();
  const test = options.test === true;
  // One queue of rooms per mission, each on that mission's fixed seed, so every board compares like with like.
  const missionId = options.missionId ?? playMission();
  if (!PLAY_MISSIONS.includes(missionId)) return { ok: false, status: 400, error: `Mission ${missionId} is not open for /play. Open: ${PLAY_MISSIONS.join(', ')}.` };
  for (const [code, room] of rooms) {
    advance(room, now);
    if (expired(room, now) || now - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
  // A phone that tapped another mission gives up the seat it was holding, if that room has not started.
  const left = options.leave ? rooms.get(options.leave.code) : undefined;
  if (left?.auto && options.leave && left.status === 'lobby' && left.tokens.get(options.leave.playerId) === options.leave.token) {
    if (left.missionId === missionId) {
      // Same mission: it keeps its seat.
      const player = left.players.get(options.leave.playerId)!;
      return { ok: true, data: { code: left.code, endsAt: left.auto.endsAt, playerId: player.id, token: options.leave.token, nickname: player.nickname, serverNow: now } };
    }
    left.players.delete(options.leave.playerId);
    left.tokens.delete(options.leave.playerId);
    left.auto.phones.delete(options.leave.playerId);
    left.version += 1;
    if (left.auto.phones.size === 0) rooms.delete(left.code); // nobody is waiting in it any more
  }
  const autos = [...rooms.values()].filter((room) => room.auto !== undefined && room.auto.test === test);
  let room = autos
    .filter((candidate) => candidate.missionId === missionId && candidate.status === 'lobby' && candidate.auto!.phones.size < AUTO_ROOM_CAP && candidate.auto!.endsAt - now > AUTO_MIN_LEFT_MS)
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!room) {
    // MAX_AUTO_ROOMS is for all missions together.
    const active = autos.filter(busy);
    if (active.length >= maxAutoRooms()) {
      // The next slot opens when the first of the busy rooms ends: its lobby, then the race at its longest.
      const soonest = Math.min(...active.map((candidate) => (candidate.closesAt ?? (candidate.startAt ?? candidate.auto!.endsAt + COUNTDOWN_MS) + RACE_TIMEOUT_MS) - now));
      return { ok: false, status: 503, error: 'Every room is racing. The next race opens shortly.', retryInS: Math.max(1, Math.min(60, Math.ceil(soonest / 1000))) };
    }
    room = {
      code: newCode(), missionId, seed: driveSeed(MISSIONS[missionId]), status: 'lobby', buildEndsAt: null, startAt: null, closesAt: null, raceNo: 0,
      seats: AUTO_ROOM_CAP, version: 0, players: new Map(), tokens: new Map(), lastSeen: new Map(), logged: new Set(), createdAt: now,
      auto: { endsAt: now + AUTO_LOBBY_MS, test, phones: new Set(), choosing: new Set(), replays: new Map(), finishedAt: null },
    };
    rooms.set(room.code, room);
    // The lobby's 30 s are used to drive the fill bot's run once, so it is ready at the start. Not for load tests.
    if (!test) {
      const strategy = resolveStrategy(missionId, 'all_rounder', 'plan');
      requestGhost({ missionId, seed: room.seed, build: strategy.build, priority: strategy.priority, briefing: strategy.briefing });
    }
  }
  const taken = new Set([...room.players.values()].map((player) => player.nickname.toLowerCase()));
  let nickname = options.nickname && !taken.has(options.nickname.toLowerCase()) ? options.nickname : '';
  for (let n = room.players.size + 1; nickname === ''; n += 1) if (!taken.has(`player ${n}`)) nickname = `Player ${n}`;
  const seat = seatPlayer(room, { nickname, kind: 'human', build: PRESETS.all_rounder.build, briefing: undefined });
  room.auto!.phones.add(seat.playerId);
  room.version += 1;
  return { ok: true, data: { code: room.code, endsAt: room.auto!.endsAt, playerId: seat.playerId, token: seat.token, nickname, serverNow: now } };
}

/** /play: the phone's three taps. Allowed until the room starts; the last pick sent stands. */
export function pickInRoom(code: string, playerId: string, token: string, pick: PlayerPick, ready = true): RaceResult<null> {
  const room = rooms.get(code);
  if (!room) return fail(404, 'No such room.');
  const now = Date.now();
  advance(room, now);
  if (!room.auto) return fail(409, 'Picks are for /play rooms. This room has a host.');
  const player = room.players.get(playerId);
  if (!player || room.tokens.get(playerId) !== token || !room.auto.phones.has(playerId)) return fail(403, 'Unknown player.');
  if (room.status !== 'lobby') return fail(409, 'The race has started: the pick is locked.');
  if (pick.agent !== 'human' && !ArenaBrainIdSchema.safeParse(pick.agent).success) return fail(400, `Unknown agent "${pick.agent}".`);
  applyPick(room, player, pick);
  if (ready) room.auto.choosing.delete(playerId);
  else room.auto.choosing.add(playerId);
  room.version += 1;
  advance(room, now);
  return done(null);
}

/** Live auto rooms for the /screen?mode=play grid, oldest first. Load-test rooms only when asked for. */
export function autoRooms(options: { test?: boolean } = {}): RaceSnapshot[] {
  const now = Date.now();
  const test = options.test === true;
  const list: RaceSnapshot[] = [];
  for (const [code, room] of rooms) {
    if (!room.auto || room.auto.test !== test) continue;
    advance(room, now);
    if (expired(room, now)) rooms.delete(code);
    else list.push(toSnapshot(room, now));
  }
  return list.sort((a, b) => (a.auto!.endsAt - b.auto!.endsAt));
}
