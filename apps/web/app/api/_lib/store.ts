import type { BrainDecision, BrainQuestion, Episode, LeaderboardEntry, MissionId } from '@rivetrun/contracts';
import { CACHE_VERSION } from './version';

// In-memory only (docs/FAST_MODE.md): everything is lost when the Next server restarts.
interface StoredRun {
  readonly id: string;
  readonly nickname: string;
  readonly episode: Episode;
  readonly createdAt: string;
}

interface Store {
  readonly runs: StoredRun[];
  readonly decisions: Map<string, BrainDecision>;
}

const LEADERBOARD_SIZE = 20;
const MAX_RUNS = 5000;
const DECISION_CACHE_MAX = 2000;

// globalThis keeps the store across dev HMR reloads of the route modules.
const holder = globalThis as typeof globalThis & { __rivetrunStore?: Store };
const store: Store = (holder.__rivetrunStore ??= { runs: [], decisions: new Map() });

const nicknameKey = (nickname: string): string => nickname.trim().toLowerCase();

const bestPerNickname = (missionId: MissionId): StoredRun[] => {
  const best = new Map<string, StoredRun>();
  for (const run of store.runs) {
    if (run.episode.missionId !== missionId) continue;
    const key = nicknameKey(run.nickname);
    const current = best.get(key);
    if (!current || run.episode.outcome.score > current.episode.outcome.score) best.set(key, run);
  }
  return [...best.values()].sort(
    (a, b) => b.episode.outcome.score - a.episode.outcome.score || a.createdAt.localeCompare(b.createdAt),
  );
};

export function addRun(nickname: string, episode: Episode): { id: string; rank: number } {
  const run: StoredRun = { id: crypto.randomUUID(), nickname, episode, createdAt: new Date().toISOString() };
  store.runs.push(run);
  // In memory: the oldest runs make room once the log is very long.
  if (store.runs.length > MAX_RUNS) store.runs.splice(0, store.runs.length - MAX_RUNS);
  const rank = bestPerNickname(episode.missionId).findIndex((r) => nicknameKey(r.nickname) === nicknameKey(nickname));
  return { id: run.id, rank: rank + 1 };
}

export function leaderboard(missionId: MissionId): LeaderboardEntry[] {
  return bestPerNickname(missionId)
    .slice(0, LEADERBOARD_SIZE)
    .map((run, index) => ({
      rank: index + 1,
      nickname: run.nickname,
      missionId,
      score: run.episode.outcome.score,
      timeS: run.episode.outcome.timeS,
      damagePct: run.episode.outcome.damagePct,
      policy: run.episode.policy,
      createdAt: run.createdAt,
    }));
}

export const episodeCount = (): number => store.runs.length;

const bucket = (value: unknown, step: number): unknown =>
  typeof value === 'number' ? Math.round(value / step) * step : value;

type Observed = NonNullable<BrainQuestion['observation']>;

/** The rounded Observation: what a v3 question is built from, so what its cached answer depends on. */
function observationKey(o: Observed): unknown[] {
  const seen = <T extends object>(reading: T | null | 'unknown', pick: (value: T) => unknown[]): unknown =>
    reading === 'unknown' || reading === null ? reading : pick(reading);
  return [
    o.sources,
    bucket(o.speedMps, 0.25),
    bucket(o.batteryPct, 10),
    bucket(o.drawW, 5),
    bucket(o.projectedFinishPct, 5),
    bucket(o.remainingM, 5),
    bucket(o.damagePct, 10),
    o.scanZones.filter((zone) => !zone.done && !zone.missed).map((zone) => [zone.id, bucket(zone.distanceM, 1), zone.canScan]),
    bucket(o.tiltDeg, 5),
    bucket(o.slipPct, 10),
    o.slipping,
    o.blind,
    seen(o.hazard, (h) => [h.source, bucket(h.distanceM, 0.5), h.kind ?? null, bucket(h.safeSpeedMps, 0.25)]),
    seen(o.gap, (g) => [g.source, bucket(g.distanceM, 0.5), bucket(g.widthM, 0.25)]),
    seen(o.terrainAhead, (t) => [t.source, t.terrain, bucket(t.distanceM, 1)]),
    bucket(o.waterDepthCm, 5),
    seen(o.lastContact, (c) => [c.source, c.kind ?? null, bucket(c.agoS, 1)]),
    [bucket(o.actuators.jumpReadyInS, 0.5), o.actuators.winch, o.actuators.climbMode],
    // Weather: the plan is the same for a whole mission; a gust in progress changes the answer.
    o.conditions ?? null,
    o.gusting ?? null,
    bucket(o.forwardRangeM, 1),
  ];
}

/** Cache key by rounded state: near-identical questions reuse the same Jev answer. */
export function decisionKey(q: BrainQuestion): string {
  const p = q.perceived;
  const byAction = new Map(q.lookahead.map((l) => [l.action, l]));
  return JSON.stringify([
    CACHE_VERSION,
    // The question names the mission's scan zones and states its length: answers are not shared across missions.
    q.missionId,
    q.gameplayVersion ?? null,
    q.briefing ?? '',
    q.lookaheadS ?? null,
    q.options,
    bucket(q.priority, 0.1),
    q.cause?.cause ?? null,
    // Brain v3 questions are built from the Observation alone; older ones from `perceived` + `status`.
    q.observation
      ? observationKey(q.observation)
      : [
          p.terrainAheadSource ?? null,
          p.terrainAhead,
          bucket(p.terrainAheadDistanceM, 1),
          bucket(p.obstacleAheadM, 0.5),
          bucket(p.gapAheadM, 0.5),
          bucket(p.gapWidthM, 0.25),
          bucket(p.slipPct, 10),
          bucket(p.tiltDeg, 5),
          bucket(p.depthAheadCm, 5),
          bucket(q.status.speedMps, 0.25),
          bucket(q.status.batteryPct, 10),
          bucket(q.status.damagePct, 10),
        ],
    q.options.map((action) => {
      const l = byAction.get(action);
      return l
        ? [bucket(l.progressM, 0.25), bucket(l.damagePct, 1), bucket(l.energyPct, 0.25), bucket(l.projectedFinishPct, 5), l.assumed ?? false]
        : null;
    }),
  ]);
}

export const getCachedDecision = (key: string): BrainDecision | undefined => store.decisions.get(key);

export function cacheDecision(key: string, decision: BrainDecision): void {
  if (store.decisions.size >= DECISION_CACHE_MAX) {
    const oldest = store.decisions.keys().next().value;
    if (oldest !== undefined) store.decisions.delete(oldest);
  }
  store.decisions.set(key, decision);
}
