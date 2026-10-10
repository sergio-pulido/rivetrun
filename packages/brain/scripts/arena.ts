// Brain Arena runner (docs/BRAIN_ARENA.md, RR-ARENA): same robot, same seed, same sensors, same question,
// different brains. Offline: M1–M7 × seeds × contestants on the default build, plus Deep Diver on M6.
// Writes docs/ARENA.md and docs/arena-results.json. Measured numbers only.
//   pnpm --filter @rivetrun/brain arena                       every configured contestant except Opus
//   pnpm --filter @rivetrun/brain arena -- --include-opus     also the Opus row (read the cost estimate first)
//   pnpm --filter @rivetrun/brain arena -- --contestants heuristic,random --seeds 1
// Optional prices, to turn reported tokens into dollars (never guessed):
//   ARENA_PRICES_USD_PER_MTOK='{"claude-haiku-5-5":{"in":1,"out":5}}'
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAMEPLAY_VERSION, type Action, type Brain, type Build, type DecisionLog, type Episode, type MissionId } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, MISSION_IDS, MISSIONS, PRESETS, runHeadless } from '@rivetrun/sim';
import { arenaPromptHash, buildArenaPrompt } from '../src/arena/prompt';
import { allContestants, ARENA_TIMEOUT_MS, type Contestant } from '../src/arena/providers';

const SEED_BASE = 1001;
const OUT_MD = fileURLToPath(new URL('../../../docs/ARENA.md', import.meta.url));
const OUT_JSON = fileURLToPath(new URL('../../../docs/arena-results.json', import.meta.url));
const OPUS_ID = 'claude-opus-5-5';
/**
 * Triggers that mean the robot hit or fell into something. Not 'damage' (it fires at every 5 % of total damage,
 * including water and mud ingress while wading) and not 'landing' (a clean landing fires it too).
 */
const CRASH_CAUSES = new Set(['impact', 'blocked', 'fell']);
const LATE_CRASH_RULE = 'impact|blocked|fell';

interface Entry {
  readonly missionId: MissionId;
  readonly buildId: string;
  readonly build: Build;
}

interface RunStats {
  readonly entry: Entry;
  readonly seed: number;
  readonly episode: Episode;
  readonly latenciesMs: number[];
  noDecisions: number;
  /** Why answers were missing, by short reason (HTTP status, timeout, unusable reply). */
  readonly reasons: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  usageReported: boolean;
  /** Estimated prompt tokens (characters / 4) this run's questions add up to, whoever answers them. */
  promptTokensEstimate: number;
}

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const has = (name: string): boolean => process.argv.includes(`--${name}`);

/**
 * Arena rules on top of the sim's own headless run: no fallback for anyone. When a contestant errors or does
 * not answer within 10 s, that is "no decision": the robot keeps the command it already has for those 10 s.
 * (runHeadless would otherwise let the heuristic answer; returning the held command keeps it out.)
 */
function arenaBrain(decide: ReturnType<Contestant['forRun']>, stats: RunStats): Brain {
  let held: Action | null = null;
  return {
    decide: async (question) => {
      const prompt = buildArenaPrompt(question);
      stats.promptTokensEstimate += Math.ceil((prompt.system.length + prompt.user.length) / 4);
      try {
        const answer = await decide(question);
        held = answer.choice;
        stats.latenciesMs.push(answer.latencyMs);
        if (answer.usage) {
          stats.usageReported = true;
          stats.inputTokens += answer.usage.inputTokens;
          stats.outputTokens += answer.usage.outputTokens;
        }
        return { probabilities: answer.probabilities, selected: answer.choice, policy: 'jev', fallback: false, latencyMs: answer.latencyMs };
      } catch (error) {
        stats.noDecisions += 1;
        // Short reason only (status code or kind of failure): never the request, its headers or a key.
        const message = error instanceof Error ? error.message : 'error';
        const reason = /^HTTP \d+/.exec(message)?.[0] ?? (/no answer within/.test(message) ? 'timeout' : /option|JSON/.test(message) ? 'unusable reply' : 'network error');
        stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
        // Before the first answer there is no command to hold: the robot does not drive.
        const hold: Action = held && question.options.includes(held) ? held : question.options.includes('coast') ? 'coast' : question.options[0]!;
        return { probabilities: { [hold]: 0 }, selected: hold, policy: 'jev', fallback: false, latencyMs: ARENA_TIMEOUT_MS };
      }
    },
  };
}

/** Crashes that happened while the previous answer had not arrived yet. */
function lateCrashes(episode: Episode): number {
  const logs = episode.decisions.flatMap((decision): DecisionLog[] => (decision.log ? [decision.log] : []));
  return logs.filter((log, i) => i > 0 && CRASH_CAUSES.has(log.trigger.cause) && logs[i - 1]!.appliedT > logs[i - 1]!.t && log.t <= logs[i - 1]!.appliedT + 0.05).length;
}

async function pool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const index = next++;
        results[index] = await tasks[index]!();
      }
    }),
  );
  return results;
}

const SIM_COMMIT = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length);
const percentile = (values: readonly number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};
const fmt = (value: number | null | undefined, digits = 0): string => (value === null || value === undefined ? '—' : value.toFixed(digits));
const round = (value: number | null, digits = 1): number | undefined => (value === null ? undefined : Number(value.toFixed(digits)));

function prices(): Record<string, { in: number; out: number }> {
  try {
    return JSON.parse(process.env.ARENA_PRICES_USD_PER_MTOK ?? '{}') as Record<string, { in: number; out: number }>;
  } catch {
    console.warn('ARENA_PRICES_USD_PER_MTOK is not valid JSON: costs are reported in tokens only.');
    return {};
  }
}

function summarise(contestant: Contestant, runs: readonly RunStats[]) {
  const outcomes = runs.map((run) => run.episode.outcome);
  const finished = outcomes.filter((outcome) => outcome.finished);
  const latencies = runs.flatMap((run) => run.latenciesMs);
  const usage = runs.some((run) => run.usageReported);
  const inTok = mean(runs.map((run) => run.inputTokens));
  const outTok = mean(runs.map((run) => run.outputTokens));
  const price = prices()[contestant.id];
  return {
    id: contestant.id,
    modelId: contestant.id,
    label: contestant.label,
    kind: contestant.kind,
    status: 'ok' as const,
    runs: runs.length,
    finishPct: Math.round((finished.length / runs.length) * 100),
    meanScore: Math.round(mean(outcomes.map((outcome) => outcome.score)) ?? 0),
    meanTimeS: round(mean(finished.map((outcome) => outcome.timeS))),
    meanDamagePct: round(mean(outcomes.map((outcome) => outcome.damagePct))),
    scansDone: runs.reduce((sum, run) => sum + (run.episode.outcome.breakdown?.scansDone ?? 0), 0),
    decisionsPerRun: round(mean(runs.map((run) => run.episode.decisions.length))),
    noDecisions: runs.reduce((sum, run) => sum + run.noDecisions, 0),
    latencyP50Ms: contestant.kind === 'heuristic' || contestant.kind === 'random' ? 0 : round(percentile(latencies, 50), 0),
    latencyP95Ms: contestant.kind === 'heuristic' || contestant.kind === 'random' ? 0 : round(percentile(latencies, 95), 0),
    lateCrashes: runs.reduce((sum, run) => sum + lateCrashes(run.episode), 0) as number | undefined,
    lateCrashRule: LATE_CRASH_RULE,
    /** The commit of the sim these runs were driven on: rows from different commits are not strictly comparable. */
    simCommit: SIM_COMMIT,
    ...(usage ? { inputTokens: round(inTok, 0), outputTokens: round(outTok, 0) } : {}),
    ...(usage && price && inTok !== null && outTok !== null ? { costPerRunUsd: Number(((inTok * price.in + outTok * price.out) / 1e6).toFixed(5)) } : {}),
  };
}

async function main(): Promise<void> {
  const seeds = Number(flag('seeds') ?? 3);
  const missions = (flag('missions')?.split(',') as MissionId[] | undefined) ?? [...MISSION_IDS];
  const wanted = flag('contestants')?.split(',');
  const concurrency = Number(flag('concurrency') ?? 6);
  const defaultBuild = PRESETS[DEFAULT_PRESET_ID];
  const entries: Entry[] = [
    ...missions.map((missionId) => ({ missionId, buildId: defaultBuild.id as string, build: defaultBuild.build })),
    ...(missions.includes('M6') ? [{ missionId: 'M6' as MissionId, buildId: 'deep_diver', build: PRESETS.deep_diver.build }] : []),
  ];
  const everyone = allContestants();
  const selected = everyone.filter((contestant) => {
    if (wanted) return wanted.includes(contestant.id) || wanted.includes(contestant.kind);
    return contestant.id !== OPUS_ID || has('include-opus');
  });
  // Opus only ever runs when asked for by name or with --include-opus.
  const skippedOpus = !selected.some((c) => c.id === OPUS_ID) && everyone.some((c) => c.id === OPUS_ID && c.status === 'ok');
  const runsPerContestant = entries.length * seeds;

  const summaries: ReturnType<typeof summarise>[] = [];
  const notConfigured = selected.filter((contestant) => contestant.status === 'not_configured');
  let promptTokensPerRun: number | null = null;
  const started = performance.now();
  for (const contestant of selected.filter((c) => c.status === 'ok')) {
    const tasks = entries.flatMap((entry) =>
      Array.from({ length: seeds }, (_, i) => async (): Promise<RunStats> => {
        const seed = SEED_BASE + i;
        const stats: RunStats = { entry, seed, episode: undefined as unknown as Episode, latenciesMs: [], noDecisions: 0, reasons: {}, inputTokens: 0, outputTokens: 0, usageReported: false, promptTokensEstimate: 0 };
        const { episode } = await runHeadless(MISSIONS[entry.missionId], seed, entry.build, arenaBrain(contestant.forRun(seed), stats), { priority: 0.5, policy: 'jev' });
        const done: RunStats = { ...stats, episode };
        const o = episode.outcome;
        console.info(`${contestant.id.padEnd(18)} ${entry.missionId} ${entry.buildId.padEnd(11)} seed ${seed}: ${o.finished ? 'finished' : `DNF ${o.dnfReason ?? ''}`} score ${o.score.toFixed(0)} · ${episode.decisions.length} decisions · ${stats.noDecisions} unanswered`);
        return done;
      }),
    );
    const local = contestant.kind === 'heuristic' || contestant.kind === 'random';
    const runs = await pool(tasks, local ? 1 : concurrency);
    const summary = summarise(contestant, runs);
    summaries.push(summary);
    promptTokensPerRun ??= mean(runs.map((run) => run.promptTokensEstimate));
    const reasons: Record<string, number> = {};
    for (const run of runs) for (const [reason, count] of Object.entries(run.reasons)) reasons[reason] = (reasons[reason] ?? 0) + count;
    if (summary.noDecisions > 0) console.info(`→ ${contestant.id}: ${summary.noDecisions} unanswered (${Object.entries(reasons).map(([reason, count]) => `${reason} × ${count}`).join(', ')})`);
    if (summary.inputTokens !== undefined) {
      console.info(`→ ${contestant.id}: ${summary.inputTokens} input + ${summary.outputTokens} output tokens per run, ${runsPerContestant} runs = ${(summary.inputTokens * runsPerContestant).toLocaleString('en-US')} input tokens for a full arena row${summary.costPerRunUsd !== undefined ? ` ($${(summary.costPerRunUsd * runsPerContestant).toFixed(2)})` : ''}`);
    }
  }
  const wallS = (performance.now() - started) / 1000;

  // --keep: rows of contestants not run this time are carried over from the last results file, so a free
  // re-run of Jev and the local policies does not have to re-spend LLM tokens. A carried row keeps its own
  // simCommit, and loses its late-crash count when that was counted under an older rule.
  if (has('keep') && existsSync(OUT_JSON)) {
    const previous = JSON.parse(readFileSync(OUT_JSON, 'utf8')) as { contestants?: ReturnType<typeof summarise>[] };
    const ran = new Set(summaries.map((s) => s.id));
    for (const row of previous.contestants ?? []) {
      if (row.status !== 'ok' || ran.has(row.id)) continue;
      summaries.push({ ...row, lateCrashes: row.lateCrashRule === LATE_CRASH_RULE ? row.lateCrashes : undefined, simCommit: row.simCommit ?? 'unknown' });
    }
  }
  const commits = [...new Set(summaries.map((s) => s.simCommit))];

  const date = new Date().toISOString().slice(0, 10);
  const totalRuns = summaries.reduce((sum, s) => sum + s.runs, 0);
  const promptHash = arenaPromptHash();
  const results = {
    date,
    runs: totalRuns,
    promptHash,
    gameplayVersion: GAMEPLAY_VERSION,
    missions,
    seeds: Array.from({ length: seeds }, (_, i) => SEED_BASE + i),
    builds: [...new Set(entries.map((entry) => entry.buildId))],
    timeoutMs: ARENA_TIMEOUT_MS,
    contestants: [
      ...summaries,
      ...notConfigured.map((c) => ({ id: c.id, modelId: c.id, label: c.label, kind: c.kind, status: 'not_configured' as const })),
    ],
    // Configured but deliberately not run (kept out of `contestants`, whose status is only ok / not_configured).
    notRun: skippedOpus ? [{ id: OPUS_ID, label: 'Claude Opus 5.5 (reasoning)', reason: 'held until the cost of the row is approved' }] : [],
  };
  writeFileSync(OUT_JSON, `${JSON.stringify(results, null, 2)}\n`);

  const lines = [
    '# RivetRun — Brain Arena',
    '',
    `Our sim, our prompts, ${totalRuns} runs, ${date}. Not a general model ranking.`,
    '',
    `Generated by \`packages/brain/scripts/arena.ts\` · gameplay version ${GAMEPLAY_VERSION} · prompt hash \`${promptHash}\` · wall time ${fmt(wallS)} s. Every number is measured from headless runs; nothing is estimated except where it says so.`,
    '',
    '## Rules',
    `- Same robot, seed, sensors and question for everyone: ${missions.join(', ')} × seeds ${results.seeds.join(', ')} on the ${defaultBuild.name}${missions.includes('M6') ? ', plus Deep Diver on M6' : ''} (${runsPerContestant} runs per contestant), priority 0.5, no briefing.`,
    '- One call per trigger. Latency is applied in sim time: the robot holds its last command until the answer arrives.',
    `- No fallback for anyone, Jev included. No answer within ${ARENA_TIMEOUT_MS / 1000} s, or an error, is "unanswered": the robot keeps its command for those ${ARENA_TIMEOUT_MS / 1000} s.`,
    '- LLMs get the question as plain text and answer `{ "choice", "confidence" }`; no tools. Extended reasoning is off for Haiku and Sonnet; Opus 5.5 cannot switch it off, so its row is labelled "(reasoning)" and runs at the lowest effort. Temperature 0 where the model accepts it: the Claude 5.5 models reject the parameter, so they run on their default sampling.',
    '',
    '## Results',
    '| Contestant | Runs | Finish | Score | Time s (finished) | Damage % | Decisions / run | Unanswered | Latency p50 / p95 ms | Late crashes | Tokens / run (in / out) | Cost / run |',
    '| - | - | - | - | - | - | - | - | - | - | - | - |',
    ...summaries.map((s) =>
      `| ${s.label} (\`${s.id}\`) | ${s.runs} | ${s.finishPct} % | ${s.meanScore} | ${fmt(s.meanTimeS, 1)} | ${fmt(s.meanDamagePct, 1)} | ${fmt(s.decisionsPerRun, 1)} | ${s.noDecisions} | ${fmt(s.latencyP50Ms)} / ${fmt(s.latencyP95Ms)} | ${s.lateCrashes ?? '—'} | ${s.inputTokens !== undefined ? `${s.inputTokens} / ${s.outputTokens}` : '—'} | ${s.costPerRunUsd !== undefined ? `$${s.costPerRunUsd}` : '—'} |`,
    ),
    ...notConfigured.map((c) => `| ${c.label} (\`${c.id}\`) | not configured: no API key in apps/web/.env.local | | | | | | | | | | |`),
    ...(skippedOpus ? [`| Claude Opus 5.5 (reasoning) (\`${OPUS_ID}\`) | not run: pass --include-opus after reading the cost estimate | | | | | | | | | | |`] : []),
    '',
    '- Late crashes: the robot hit something, got blocked or fell while its previous answer had not arrived yet. "—" = that row was run before this rule and has not been re-counted.',
    commits.length > 1
      ? `- Rows were driven on different commits of the sim (${summaries.map((s) => `${s.label}: ${s.simCommit}`).join(', ')}), so they are not strictly comparable until all are re-run together.`
      : `- Every row was driven on sim commit ${commits[0] ?? SIM_COMMIT}.`,
    '- Cost is shown only when the provider reports token usage and a price is configured in `ARENA_PRICES_USD_PER_MTOK`; prices are never assumed.',
    '',
    '## Size of one LLM row',
    promptTokensPerRun === null
      ? '- Not measured in this run.'
      : `- Rough size before any call is made: the questions of one run add up to about ${Math.round(promptTokensPerRun).toLocaleString('en-US')} input tokens (characters / 4 of the prompts actually built; the providers' own counts in the table are the real ones and run higher), so one contestant's ${runsPerContestant} runs are about ${Math.round(promptTokensPerRun * runsPerContestant).toLocaleString('en-US')} input tokens by that estimate.`,
    '',
  ];
  writeFileSync(OUT_MD, lines.join('\n'));
  console.info(`\nWrote ${OUT_MD} and ${OUT_JSON}\n`);
  console.info(lines.join('\n'));
}

await main();
