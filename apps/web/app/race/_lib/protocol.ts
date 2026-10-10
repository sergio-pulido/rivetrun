// Room Race wire format, shared by the route handlers, the phones and /screen.
// The server snapshot is the only source of results: every view renders order, times and DNF reasons from it
// through rankPlayers() and resultText() below, never from a device's own sim.
import {
  ActionSchema,
  BriefingSchema,
  BuildSchema,
  EpisodeSchema,
  MissionIdSchema,
  NicknameSchema,
  PlayerPickSchema,
  PrioritySchema,
  SeedSchema,
} from '@rivetrun/contracts';
import { z } from 'zod';

export const RACE_CODE_LENGTH = 4;
/** Human seats a host can open. JEV bots never take a seat. */
export const SEAT_OPTIONS = [4, 6, 8] as const;
export const DEFAULT_SEATS = 6;
export const MAX_SEATS = 8;
export const ROOM_FULL_MESSAGE = 'Room full — watch the big screen';
/** JEV bots the host may add; the big screen runs them. */
export const MAX_BOTS = 2;
/** BUILD phase: phones show the compact workshop. Ends early when every human is ready. */
export const BUILD_MS = 45_000;
export const COUNTDOWN_MS = 5000;
/** Devices post their sim state at 5 Hz. */
export const STATE_POST_MS = 200;
/** Once the first robot finishes, the race stays open this long for the others. */
export const CLOSE_AFTER_LEADER_MS = 45_000;
/** Hard cap from the start signal, when nobody has finished. */
export const RACE_TIMEOUT_MS = 180_000;
/** No state post for this long: the device is shown as "signal lost" (it can still resume). */
export const SILENT_MS = 5000;
/** Silent for this long: the room no longer waits for that device to close the race. */
export const GONE_MS = 20_000;

// ---- Auto rooms (RR-PLAN, docs/PLAY_AND_PLAN.md §5): rooms the matchmaker opens for /play. No host, no code to type.
/** Phones in one auto room. */
export const AUTO_ROOM_CAP = 8;
/** From the room's first phone to the start, unless the room fills and everyone has picked. */
export const AUTO_LOBBY_MS = 30_000;
/** A phone is not matched into a room with less than this left on its countdown. */
export const AUTO_MIN_LEFT_MS = 8_000;
/** Bots fill an auto room up to this many lanes at the start. */
export const AUTO_MIN_LANES = 4;
/** An auto room is removed this long after its results. */
export const AUTO_CLOSE_AFTER_RESULTS_MS = 60_000;
/** Auto rooms in the lobby or racing at once, unless MAX_AUTO_ROOMS says otherwise. */
export const DEFAULT_MAX_AUTO_ROOMS = 8;

export const RaceCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/, 'room codes are 4 letters');

export const RaceStatusSchema = z.enum(['lobby', 'build', 'countdown', 'racing', 'finished']);
export type RaceStatus = z.infer<typeof RaceStatusSchema>;

/** Why a robot did not finish: the sim's own reasons plus the two only the room can decide. */
export const RaceDnfSchema = z.enum(['damage', 'battery', 'stuck', 'timeout', 'race_closed', 'disconnected']);
export type RaceDnf = z.infer<typeof RaceDnfSchema>;

export const RACE_DNF_LABEL: Readonly<Record<RaceDnf, string>> = {
  damage: 'wrecked',
  battery: 'battery flat',
  stuck: 'stuck',
  timeout: 'out of time',
  race_closed: 'race closed',
  disconnected: 'lost connection',
};

/**
 * The live Arena race (/screen?arena=1): brains that can each drive one bot on the same seed and build.
 * The fast tier of docs/BRAIN_ARENA.md plus the game's fixed rules; answered by POST /api/arena/decide.
 */
export const ARENA_BRAINS = [
  { id: 'jev-1.13.0', label: 'Jev' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
  { id: 'deepseek-flash', label: 'DeepSeek Flash' },
  // A model that thinks before it answers: its default reasoning, as in the arena table's reasoning tier.
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (reasoning)' },
  { id: 'heuristic', label: 'Fixed rules' },
] as const;
export type ArenaBrainId = (typeof ARENA_BRAINS)[number]['id'];
export const ArenaBrainIdSchema = z.enum(ARENA_BRAINS.map((brain) => brain.id) as [ArenaBrainId, ...ArenaBrainId[]]);
/** Bots in a live Arena race: one lane per brain. */
export const ARENA_MAX_BOTS = 4;
/** How long a live Arena bot waits for its brain before the fixed rules decide that one decision. */
export const ARENA_DECIDE_TIMEOUT_MS = 4000;

export const RacePlayerSchema = z.object({
  id: z.string(),
  /** A human's nickname (NicknameSchema, checked on join) or a bot's label, which may be longer: "GPT-6.1 Sol (reasoning)". */
  nickname: z.string().min(1).max(40),
  /** human = a phone, driven by its owner. jev = a bot the big screen runs with the Jev brain. */
  kind: z.enum(['human', 'jev']).default('human'),
  build: BuildSchema,
  /** Jev bots only: the briefing the bot drives by. */
  briefing: BriefingSchema.optional(),
  /** Live Arena bots only (/screen?arena=1): the brain that drives this bot, one of ARENA_BRAINS. */
  model: z.string().optional(),
  /** 0 = speed, 1 = safety, handed to the brain with the briefing. Absent = 0.5. */
  priority: PrioritySchema.optional(),
  /** True when the briefing and priority come from a plan ("<brain> + plan"). */
  plan: z.boolean().optional(),
  /** /play: what this phone picked (or the defaults it was given at the start). */
  pick: PlayerPickSchema.optional(),
  /** A bot the server moves itself from a recorded run: no device posts for it. */
  serverDriven: z.boolean().optional(),
  /** Bots: how long the brain took over its last decision, ms. */
  latencyMs: z.number().min(0).nullable().default(null),
  /** Bots, this race so far: the median response time of the brain's own answers, ms. */
  medianLatencyMs: z.number().min(0).nullable().default(null),
  /** Bots, this race so far: hazards reached (hit, blocked, fell) while the previous answer had not arrived yet. */
  lateDecisions: z.number().int().min(0).nullable().default(null),
  /** Bots, this race so far: decisions the fixed rules took because the brain did not answer in time. */
  missedDecisions: z.number().int().min(0).nullable().default(null),
  /** BUILD phase: the player has locked the build in. */
  ready: z.boolean().default(false),
  /** Join order: picks the lane and the colour. */
  lane: z.number().int().min(0),
  /** Distance along the track, metres. */
  x: z.number(),
  v: z.number(),
  damagePct: z.number().min(0).max(100),
  batteryPct: z.number().min(0).max(100),
  lastAction: ActionSchema.nullable(),
  /** Probability the brain gave the last action, 0–1 (Jev bots). */
  lastActionP: z.number().min(0).max(1).nullable().default(null),
  /** True while Jev is deciding (the bot's sim is in slow motion). */
  thinking: z.boolean(),
  /** No state post for SILENT_MS during the race: backgrounded tab or lost signal. */
  silent: z.boolean().default(false),
  /** The run ended: finished or DNF. Final once set. */
  done: z.boolean(),
  finished: z.boolean(),
  dnfReason: RaceDnfSchema.nullable(),
  /** RACE TIME: wall-clock ms from the start signal to the end of the run, stamped by the server. */
  raceMs: z.number().min(0).nullable(),
  /** Already inside raceMs: the sim's time penalty for scan zones driven past (10 s each). */
  penaltyMs: z.number().min(0).default(0),
  score: z.number().nullable(),
});
export type RacePlayer = z.infer<typeof RacePlayerSchema>;

export const RaceSnapshotSchema = z.object({
  code: RaceCodeSchema,
  missionId: MissionIdSchema,
  seed: SeedSchema,
  status: RaceStatusSchema,
  /** Server epoch ms when the BUILD phase ends (build status only). */
  buildEndsAt: z.number().nullable().default(null),
  /** Server epoch ms of the start signal (set from the countdown on). */
  startAt: z.number().nullable(),
  /** Server epoch ms when the race closes for everyone still driving. Set once the first robot finishes. */
  closesAt: z.number().nullable().default(null),
  /** Server epoch ms when this snapshot was built: clients derive their clock offset from it. */
  serverNow: z.number(),
  /** Counts races run in this room; a new number means a new race. */
  raceNo: z.number().int().min(0),
  /** Human seats the host opened (4, 6 or 8). */
  seats: z.number().int().min(1).max(MAX_SEATS).default(DEFAULT_SEATS),
  players: z.array(RacePlayerSchema),
  /** Auto rooms only: when the lobby countdown ends, and when the room is removed after its results. */
  auto: z.object({ endsAt: z.number(), removedAt: z.number().nullable(), test: z.boolean() }).optional(),
});
export type RaceSnapshot = z.infer<typeof RaceSnapshotSchema>;

const seat = { playerId: z.string(), token: z.string() };

export const RaceActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join'), nickname: NicknameSchema, build: BuildSchema }),
  /** Host: add a JEV bot. The caller (the big screen) gets its seat and runs it. */
  z.object({
    action: z.literal('addBot'), build: BuildSchema, briefing: BriefingSchema.optional(), model: ArenaBrainIdSchema.optional(),
    /** "+ plan" lanes: the plan's priority, and the flag that names the lane. One bot per (model, plan). */
    priority: PrioritySchema.optional(),
    plan: z.boolean().optional(),
  }),
  /** Host: remove a player or a bot before the race. */
  z.object({ action: z.literal('remove'), playerId: z.string() }),
  /** Host: pick the track in the lobby, so every screen shows it before the BUILD phase. */
  z.object({ action: z.literal('mission'), missionId: MissionIdSchema }),
  /** Host: how many human seats the room has, in the lobby. */
  z.object({ action: z.literal('seats'), seats: z.union([z.literal(4), z.literal(6), z.literal(8)]) }),
  /** Host: open the BUILD phase (lobby), or skip the rest of it (build). */
  z.object({ action: z.literal('start'), missionId: MissionIdSchema.optional() }),
  /** Player: change the build and/or lock it in, in the lobby or the BUILD phase. */
  z.object({ action: z.literal('build'), ...seat, build: BuildSchema, ready: z.boolean().default(false) }),
  z.object({ action: z.literal('reset') }),
  z.object({
    action: z.literal('state'),
    ...seat,
    raceNo: z.number().int().min(0),
    x: z.number(),
    v: z.number(),
    damagePct: z.number().min(0).max(100),
    batteryPct: z.number().min(0).max(100),
    lastAction: ActionSchema.nullable(),
    lastActionP: z.number().min(0).max(1).nullable().default(null),
    /** Bots: how long the brain took over its last decision, ms. */
    latencyMs: z.number().min(0).nullable().optional(),
    medianLatencyMs: z.number().min(0).nullable().optional(),
    lateDecisions: z.number().int().min(0).nullable().optional(),
    missedDecisions: z.number().int().min(0).nullable().optional(),
    thinking: z.boolean().default(false),
    done: z.boolean().default(false),
    finished: z.boolean().default(false),
    dnfReason: RaceDnfSchema.nullable().default(null),
    score: z.number().nullable().default(null),
    /** With the final post: the run's Episode, logged like any submitted run. */
    episode: EpisodeSchema.optional(),
  }),
]);
export type RaceAction = z.infer<typeof RaceActionSchema>;

/** POST /api/race/match: the phone is seated in an auto room. */
export const MatchResponseSchema = z.object({
  code: RaceCodeSchema,
  /** Server epoch ms when the room's lobby countdown ends. */
  endsAt: z.number(),
  playerId: z.string(),
  token: z.string(),
  nickname: z.string(),
  serverNow: z.number(),
});
export type MatchResponse = z.infer<typeof MatchResponseSchema>;
/** POST /api/race/match when every auto room is busy: HTTP 503 with this body. */
export const MatchBusySchema = z.object({ error: z.string(), retryInS: z.number().int().min(1) });
/** `missionId` must be one of PLAY_MISSIONS; absent = PLAY_MISSION. */
export const MatchRequestSchema = z.object({
  nickname: NicknameSchema.optional(),
  test: z.boolean().optional(),
  missionId: MissionIdSchema.optional(),
  /** The seat this phone already holds in another auto room's lobby: it is given up as part of the match (a mission tap moves the phone). */
  leave: z.object({ code: RaceCodeSchema, playerId: z.string(), token: z.string() }).optional(),
});
/** POST /api/race/[code]/pick. `agent` must be one of ARENA_BRAINS or 'human'. */
export const PickRequestSchema = z.object({ playerId: z.string(), token: z.string(), pick: PlayerPickSchema });

export const JoinResponseSchema = z.object({ playerId: z.string(), token: z.string(), nickname: z.string().optional() });
export type JoinResponse = z.infer<typeof JoinResponseSchema>;

/** Humans seated, and whether a phone can still take a seat. Bots are not counted. */
export const seatsTaken = (snapshot: Pick<RaceSnapshot, 'players'>): number => snapshot.players.filter((player) => player.kind === 'human').length;
export const roomFull = (snapshot: Pick<RaceSnapshot, 'players' | 'seats'>): boolean => seatsTaken(snapshot) >= snapshot.seats;

/** Order: finishers by race time, then everyone else by distance covered. The same on every screen. */
export function rankPlayers(players: readonly RacePlayer[]): RacePlayer[] {
  const group = (p: RacePlayer): number => (p.finished ? 0 : 1);
  return [...players].sort(
    (a, b) =>
      group(a) - group(b) ||
      (a.finished && b.finished ? (a.raceMs ?? 0) - (b.raceMs ?? 0) : b.x - a.x) ||
      a.lane - b.lane,
  );
}

/** RACE TIME as shown everywhere: seconds with one decimal. */
export const formatRaceTime = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** A player's result or progress, worded identically on the big screen and on every phone. */
export function resultText(player: RacePlayer, trackLengthM: number): string {
  if (player.finished && player.raceMs !== null) return `${formatRaceTime(player.raceMs)}${player.penaltyMs > 0 ? ` · incl. +${Math.round(player.penaltyMs / 1000)} s missed scan` : ''}`;
  if (player.done) return `DNF · ${RACE_DNF_LABEL[player.dnfReason ?? 'race_closed']}`;
  if (player.silent) return 'signal lost';
  return `${Math.round(Math.min(1, Math.max(0, player.x / trackLengthM)) * 100)} %`;
}

/** Best human against best Jev bot, from the server's results. null when one side is missing. */
export function duelVerdict(players: readonly RacePlayer[]): { headline: string; detail: string; winner: 'human' | 'jev' | 'none' } | null {
  const ranked = rankPlayers(players);
  const human = ranked.find((p) => p.kind === 'human');
  const jev = ranked.find((p) => p.kind === 'jev');
  if (!human || !jev) return null;
  if (!human.finished && !jev.finished) {
    return { headline: 'NOBODY FINISHED', detail: `${human.nickname} and ${jev.nickname} both failed to finish`, winner: 'none' };
  }
  const humanWins = human.finished && (!jev.finished || (human.raceMs ?? 0) <= (jev.raceMs ?? 0));
  const [winner, loser] = humanWins ? [human, jev] : [jev, human];
  const margin = loser.finished ? `by ${(((loser.raceMs ?? 0) - (winner.raceMs ?? 0)) / 1000).toFixed(1)} s` : `(${loser.nickname} did not finish)`;
  return {
    headline: humanWins ? 'HUMANS WIN' : 'JEV WINS',
    detail: `${winner.nickname} beat ${loser.nickname} ${margin}`,
    winner: humanWins ? 'human' : 'jev',
  };
}

/** One colour per lane: readable on dark slate, far apart from each other. */
export const LANE_COLORS = [
  '#ff6a13', '#5ef2ff', '#4ade80', '#fbbf24', '#f472b6', '#a78bfa',
  '#f8514a', '#38bdf8', '#a3e635', '#fb923c', '#e879f9', '#94a3b8',
] as const;
export const laneColor = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length]!;

/** On a phone: your own robot is orange and Jev is cyan, as everywhere else in the game; other players get the rest. */
export const OWN_COLOR = '#ff6a13';
export const JEV_COLOR = '#3fd0e0';
const OTHER_COLORS = LANE_COLORS.filter((color) => !['#ff6a13', '#5ef2ff', '#38bdf8', '#fb923c'].includes(color));
export const playerColor = (player: Pick<RacePlayer, 'id' | 'kind' | 'lane'>, meId?: string): string =>
  player.id === meId ? OWN_COLOR : player.kind === 'jev' ? JEV_COLOR : OTHER_COLORS[player.lane % OTHER_COLORS.length]!;

/** A bot's name without its "(reasoning)" tag, for places too narrow for both; the tag is then shown beside it. */
export const shortName = (player: Pick<RacePlayer, 'nickname'>): string => player.nickname.replace(/\s*\(reasoning\)\s*$/i, '');
export const isReasoning = (player: Pick<RacePlayer, 'nickname'>): boolean => /\(reasoning\)\s*$/i.test(player.nickname);

/** A finisher's time without the penalty note, and the note on its own: for rows too narrow for the full sentence. */
export const penaltyNote = (player: Pick<RacePlayer, 'finished' | 'penaltyMs'>): string | null =>
  player.finished && player.penaltyMs > 0 ? `incl. +${Math.round(player.penaltyMs / 1000)} s missed scan` : null;
export const resultShort = (player: RacePlayer, trackLengthM: number): string =>
  player.finished && player.raceMs !== null ? formatRaceTime(player.raceMs) : resultText(player, trackLengthM);
