// Humans in the arena: the best verified Drive run per mission, from GET /api/arena/humans (live server memory).
// "Verified" is the server's word: it replayed the run's input log and got the same time and score.
import { z } from 'zod';
import { formatSeconds } from '@/ui/format';

const HumanSchema = z.object({
  missionId: z.string().min(1),
  nickname: z.string().min(1),
  finished: z.boolean(),
  score: z.number(),
  timeS: z.number().min(0),
  /** The preset's name, or "custom". */
  buildName: z.string().min(1),
  /** True when it is the same robot the brains drove. */
  arenaBuild: z.boolean(),
});

const HumansSchema = z.object({
  verified: z.number().int().min(0).default(0),
  rejected: z.number().int().min(0).default(0),
  humans: z.array(z.unknown()),
});

export interface HumanRow {
  readonly missionId: string;
  readonly nickname: string;
  /** "30.6 s" or "DNF". */
  readonly result: string;
  readonly score: string;
  readonly build: string;
  readonly sameBuild: boolean;
}

export interface ArenaHumans {
  readonly verified: number;
  readonly rejected: number;
  readonly rows: readonly HumanRow[];
}

/** The endpoint's answer as rows, or null when it is not that answer. An entry that cannot be read is skipped. */
export function parseHumans(body: unknown): ArenaHumans | null {
  const parsed = HumansSchema.safeParse(body);
  if (!parsed.success) return null;
  const rows = parsed.data.humans
    .flatMap((raw): HumanRow[] => {
      const human = HumanSchema.safeParse(raw);
      if (!human.success) return [];
      const { missionId, nickname, finished, score, timeS, buildName, arenaBuild } = human.data;
      return [{ missionId, nickname, result: finished ? `${formatSeconds(timeS)} s` : 'DNF', score: `${Math.round(score)} pts`, build: buildName, sameBuild: arenaBuild }];
    })
    .sort((a, b) => a.missionId.localeCompare(b.missionId, 'en', { numeric: true }));
  return { verified: parsed.data.verified, rejected: parsed.data.rejected, rows };
}
