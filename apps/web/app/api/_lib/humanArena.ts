import { DRIVE_VERSION, GAMEPLAY_VERSION, type Build, type Episode, type MissionId } from '@rivetrun/contracts';
import { MISSION_IDS, PRESETS, replayEpisode } from '@rivetrun/sim';

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

interface HumanArenaState {
  /** Best verified human run per mission. */
  readonly best: Map<MissionId, HumanArenaRow>;
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
}

export const humanArena = (): HumanArenaBody => ({
  gameplayVersion: GAMEPLAY_VERSION,
  driveVersion: DRIVE_VERSION,
  verified: state.verified,
  rejected: state.rejected,
  humans: MISSION_IDS.flatMap((id) => {
    const row = state.best.get(id);
    return row ? [row] : [];
  }),
});
