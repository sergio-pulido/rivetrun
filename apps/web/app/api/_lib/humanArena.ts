import { DRIVE_VERSION, GAMEPLAY_VERSION, type Build, type Episode, type MissionId } from '@rivetrun/contracts';
import { MISSION_IDS, PRESETS, replayEpisode } from '@rivetrun/sim';
import { peekGhost } from './ghostStore';

// Humans in the Brain Arena (docs/BRAIN_ARENA.md, docs/OVERNIGHT.md OVN-BRAIN-7): a Drive run counts only when the
// server can replay its input log on the same mission, seed and build and gets the same result. In memory, like
// the leaderboard: lost when the server restarts.
export interface HumanArenaRow {
  readonly missionId: MissionId;
  readonly nickname: string;
  readonly finished: boolean;
  readonly score: number;
  readonly timeS: number;
  readonly damagePct: number;
  readonly energyUsedPct: number;
  readonly seed: number;
  readonly build: Build;
  /** The preset this build equals, when it is one ("All-rounder"); otherwise "custom". */
  readonly buildName: string;
  /** True when the build is the one the arena's brains drove on this mission, so the row compares like for like. */
  readonly arenaBuild: boolean;
  /** Changes of input in the log the replay was driven from. */
  readonly inputs: number;
  readonly gameplayVersion: number;
  readonly driveVersion: number;
  readonly createdAt: string;
}

export type HumanCheck =
  /** Replayed and reproduced: the run is real. */
  | { readonly verdict: 'verified' }
  /** Cannot be replayed (no log, another version of the game, not a human run): kept off the arena, nothing more. */
  | { readonly verdict: 'unverifiable'; readonly reason: string }
  /** Replayed and the result differs from the one posted: the posted result is not what this log produces. */
  | { readonly verdict: 'mismatch'; readonly reason: string };

/** One verified Drive run of today's audience, with the Jev ghost it raced when the server had that ghost. */
export interface HumanRunRow {
  readonly nickname: string;
  readonly missionId: MissionId;
  readonly finished: boolean;
  readonly timeS: number;
  readonly score: number;
  /** Jev's time on the same mission, seed and build; null when no Jev ghost was ready for that loadout. */
  readonly jevTimeS: number | null;
  /** True when the human finished faster than Jev did (or Jev did not finish); null without a Jev ghost. */
  readonly beatJev: boolean | null;
  readonly createdAt: string;
}
const MAX_HUMAN_RUNS = 500;
const BOARD_ROWS = 8;

/** A finished lane of an auto room: the vehicle and driver a phone picked, and its race time (RR-PLAN §7). */
export interface PlayResult {
  readonly missionId: MissionId;
  readonly presetId: string;
  /** An arena brain id, or 'human'. */
  readonly agent: string;
  readonly nickname: string;
  readonly timeS: number;
}
export interface BestCombo extends PlayResult {
  /** Finished picked lanes on this mission today. */
  readonly runs: number;
}
const MAX_PLAY_RESULTS = 2000;

interface HumanArenaState {
  /** Best verified human run per mission. */
  readonly best: Map<MissionId, HumanArenaRow>;
  /** Every verified run since the server started, oldest first. */
  runs?: HumanRunRow[];
  /** Finished picked lanes of auto rooms since the server started. */
  play?: PlayResult[];
  verified: number;
  rejected: number;
}
const holder = globalThis as typeof globalThis & { __rivetrunHumanArena?: HumanArenaState };
const state: HumanArenaState = (holder.__rivetrunHumanArena ??= { best: new Map(), verified: 0, rejected: 0 });

const sameParts = (a: Build, b: Build): boolean =>
  JSON.stringify({ ...a, sensors: [...a.sensors].sort(), extras: [...a.extras].sort() }) === JSON.stringify({ ...b, sensors: [...b.sensors].sort(), extras: [...b.extras].sort() });

const presetOf = (build: Build): string => Object.values(PRESETS).find((preset) => sameParts(preset.build, build))?.name ?? 'custom';

/** The arena's brains drive the All-rounder on every mission (packages/brain/scripts/arena.ts). */
const isArenaBuild = (build: Build): boolean => sameParts(PRESETS.all_rounder.build, build);

/** Replays a posted episode. Only a human episode with an input log on this version of the game can be verified. */
export function checkHumanRun(episode: Episode): HumanCheck {
  const replay = replayEpisode(episode);
  if (!replay.ok) return { verdict: 'unverifiable', reason: replay.reason };
  if (!replay.matches) {
    const got = replay.episode.outcome;
    return {
      verdict: 'mismatch',
      reason: `the replay of this input log gives ${got.finished ? `${got.timeS} s and ${got.score} points` : 'a run that does not finish'}, not the ${episode.outcome.timeS} s and ${episode.outcome.score} points posted`,
    };
  }
  return { verdict: 'verified' };
}

/** Counts a run for the arena when it replays; returns the check so the caller can refuse a mismatch. */
export function recordHumanRun(nickname: string, episode: Episode): HumanCheck {
  if (episode.policy !== 'human') return { verdict: 'unverifiable', reason: `not a human run (policy ${episode.policy})` };
  const check = checkHumanRun(episode);
  if (check.verdict === 'mismatch') state.rejected += 1;
  if (check.verdict !== 'verified') return check;
  state.verified += 1;
  const outcome = episode.outcome;
  const row: HumanArenaRow = {
    missionId: episode.missionId,
    nickname,
    finished: outcome.finished,
    score: outcome.score,
    timeS: outcome.timeS,
    damagePct: outcome.damagePct,
    energyUsedPct: outcome.energyUsedPct,
    seed: episode.seed,
    build: episode.build,
    buildName: presetOf(episode.build),
    arenaBuild: isArenaBuild(episode.build),
    inputs: outcome.breakdown?.inputLog?.length ?? 0,
    gameplayVersion: episode.gameplayVersion ?? GAMEPLAY_VERSION,
    driveVersion: episode.driveVersion ?? DRIVE_VERSION,
    createdAt: new Date().toISOString(),
  };
  // Against Jev: the ghost this player raced in Drive mode, if the server has it (default priority, no briefing).
  const jev = peekGhost({ missionId: episode.missionId, seed: episode.seed, build: episode.build, priority: episode.priority })?.ghost.outcome ?? null;
  const beatJev = jev === null ? null : outcome.finished && (!jev.finished || outcome.timeS < jev.timeS);
  const runs = (state.runs ??= []);
  runs.push({ nickname, missionId: episode.missionId, finished: outcome.finished, timeS: outcome.timeS, score: outcome.score, jevTimeS: jev?.finished ? jev.timeS : null, beatJev, createdAt: row.createdAt });
  if (runs.length > MAX_HUMAN_RUNS) runs.splice(0, runs.length - MAX_HUMAN_RUNS);
  const current = state.best.get(row.missionId);
  if (!current || row.score > current.score) state.best.set(row.missionId, row);
  return check;
}

export interface HumanArenaBody {
  readonly gameplayVersion: number;
  readonly driveVersion: number;
  /** Runs replayed and reproduced since the server started, and runs refused because the replay differed. */
  readonly verified: number;
  readonly rejected: number;
  /** The best verified human per mission, in mission order; a mission nobody has driven yet is absent. */
  readonly humans: readonly HumanArenaRow[];
  /** Verified runs that had a Jev ghost to race: how many there were and how many the human won. */
  readonly vsJev: { readonly runs: number; readonly humanWins: number };
  /** Today's board: the best finished run of each nickname, fastest first. */
  readonly board: readonly HumanRunRow[];
  /** "Best combo today" per mission, from the picked lanes of auto rooms that finished (test rooms excluded). */
  readonly bestCombo: Readonly<Record<string, BestCombo>>;
}

/** An auto room finished: its picked lanes that reached the finish count for "Best combo today". */
export function recordPlayResults(results: readonly PlayResult[]): void {
  const play = (state.play ??= []);
  play.push(...results);
  if (play.length > MAX_PLAY_RESULTS) play.splice(0, play.length - MAX_PLAY_RESULTS);
}

/** Per mission: the fastest finished pick of the day, and how many picks finished there. */
function bestCombos(): Record<string, BestCombo> {
  const best: Record<string, BestCombo> = {};
  for (const result of state.play ?? []) {
    const current = best[result.missionId];
    const runs = (current?.runs ?? 0) + 1;
    best[result.missionId] = !current || result.timeS < current.timeS ? { ...result, runs } : { ...current, runs };
  }
  return best;
}

function board(): HumanRunRow[] {
  const best = new Map<string, HumanRunRow>();
  for (const run of state.runs ?? []) {
    if (!run.finished) continue;
    const key = `${run.nickname.trim().toLowerCase()}|${run.missionId}`;
    const current = best.get(key);
    if (!current || run.timeS < current.timeS) best.set(key, run);
  }
  return [...best.values()].sort((a, b) => a.missionId.localeCompare(b.missionId) || a.timeS - b.timeS).slice(0, BOARD_ROWS);
}

export const humanArena = (): HumanArenaBody => ({
  gameplayVersion: GAMEPLAY_VERSION,
  driveVersion: DRIVE_VERSION,
  verified: state.verified,
  rejected: state.rejected,
  vsJev: { runs: (state.runs ?? []).filter((run) => run.beatJev !== null).length, humanWins: (state.runs ?? []).filter((run) => run.beatJev === true).length },
  board: board(),
  bestCombo: bestCombos(),
  humans: MISSION_IDS.flatMap((id) => {
    const row = state.best.get(id);
    return row ? [row] : [];
  }),
});
