// Brain Arena runner (docs/BRAIN_ARENA.md, RR-ARENA): same robot, same seed, same sensors, same question,
// different brains. Offline: M1–M7 × seeds × contestants on the default build, plus Deep Diver on M6.
// Writes docs/ARENA.md and docs/arena-results.json. Measured numbers only.
//   pnpm --filter @rivetrun/brain arena                                  fast and mid tiers plus the baselines, all seeds
//   pnpm --filter @rivetrun/brain arena -- --contestants claude-opus-5-5 --seeds 1 --default-build-only --cap-usd 10 --keep
//   pnpm --filter @rivetrun/brain arena -- --contestants heuristic,random --seeds 1
// The reasoning tier only runs when named with --contestants, and always under a spending cap (--cap-usd, default 10):
// cost is computed from the tokens the provider reports and its official prices, and the row stops before the cap.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAMEPLAY_VERSION, type Action, type Brain, type Build, type DecisionLog, type Episode, type MissionId } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, MISSION_IDS, MISSIONS, PRESETS, runHeadless } from '@rivetrun/sim';
import { arenaPromptHash, buildArenaPrompt } from '../src/arena/prompt';
import { publicReason, VERDICT_NOTE, ARENA_TIMEOUT_MS, PRICE_SOURCES, resolveContestants, type Contestant, type Tier } from '../src/arena/providers';

const SEED_BASE = 1001;
const OUT_MD = fileURLToPath(new URL('../../../docs/ARENA.md', import.meta.url));
const OUT_JSON = fileURLToPath(new URL('../../../docs/arena-results.json', import.meta.url));
const DEFAULT_CAP_USD = 10;
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
/** Spending of one contestant's row, in USD, from reported tokens and official prices. */
interface Budget {
  spentUsd: number;
  readonly capUsd: number | null;
  /** Worst case for one more call, so the row stops before the cap rather than after it. */
  readonly worstCallUsd: number;
  stopped: boolean;
}

class CapReached extends Error {}

/** First error text seen per reason in this invocation, printed with each row. */
const firstErrors: Record<string, string> = {};

function arenaBrain(decide: ReturnType<Contestant['forRun']>, stats: RunStats, budget: Budget, price: Contestant['price']): Brain {
  let held: Action | null = null;
  return {
    decide: async (question) => {
      if (budget.capUsd !== null && budget.spentUsd + budget.worstCallUsd > budget.capUsd) {
        budget.stopped = true;
        throw new CapReached();
      }
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
          if (price) budget.spentUsd += (answer.usage.inputTokens * price.in + answer.usage.outputTokens * price.out) / 1e6;
        }
        return { probabilities: answer.probabilities, selected: answer.choice, policy: 'jev', fallback: false, latencyMs: answer.latencyMs };
      } catch (error) {
        if (error instanceof CapReached) throw error;
        stats.noDecisions += 1;
        // Short reason only (status code or kind of failure): never the request, its headers or a key.
        const message = error instanceof Error ? error.message : 'error';
        const reason = /^HTTP \d+/.exec(message)?.[0] ?? (/no answer within/.test(message) ? 'timeout' : /option|JSON/.test(message) ? 'unusable reply' : 'network error');
        stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
        // The provider's own first message per reason, for the log (it never contains the request or a key).
        firstErrors[reason] ??= message.slice(0, 220);
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

function summarise(contestant: Contestant, runs: readonly RunStats[], budget: Budget, seeds: readonly number[]) {
  const outcomes = runs.map((run) => run.episode.outcome);
  const finished = outcomes.filter((outcome) => outcome.finished);
  const latencies = runs.flatMap((run) => run.latenciesMs);
  const usage = runs.some((run) => run.usageReported);
  const inTok = mean(runs.map((run) => run.inputTokens));
  const outTok = mean(runs.map((run) => run.outputTokens));
  const local = contestant.kind === 'heuristic' || contestant.kind === 'random';
  const priced = usage && contestant.price !== undefined;
  return {
    id: contestant.id,
    modelId: contestant.id,
    label: contestant.label,
    kind: contestant.kind,
    tier: contestant.tier,
    status: 'ok' as const,
    /** The exact mode parameters sent with every call. */
    params: contestant.params,
    seeds,
    runs: runs.length,
    finishPct: Math.round((finished.length / runs.length) * 100),
    meanScore: Math.round(mean(outcomes.map((outcome) => outcome.score)) ?? 0),
    meanTimeS: round(mean(finished.map((outcome) => outcome.timeS))),
    meanDamagePct: round(mean(outcomes.map((outcome) => outcome.damagePct))),
    scansDone: runs.reduce((sum, run) => sum + (run.episode.outcome.breakdown?.scansDone ?? 0), 0),
    decisionsPerRun: round(mean(runs.map((run) => run.episode.decisions.length))),
    noDecisions: runs.reduce((sum, run) => sum + run.noDecisions, 0),
    latencyP50Ms: local ? 0 : round(percentile(latencies, 50), 0),
    latencyP95Ms: local ? 0 : round(percentile(latencies, 95), 0),
    lateCrashes: runs.reduce((sum, run) => sum + lateCrashes(run.episode), 0) as number | undefined,
    lateCrashRule: LATE_CRASH_RULE,
    /** The commit of the sim these runs were driven on: rows from different commits are not strictly comparable. */
    simCommit: SIM_COMMIT,
    gameplayVersion: GAMEPLAY_VERSION,
    /** Hash of the prompt template this row was asked with. */
    promptHash: arenaPromptHash(),
    ...(usage ? { inputTokens: round(inTok, 0), outputTokens: round(outTok, 0) } : {}),
    // Dollars only from reported tokens and the provider's official price page.
    ...(priced ? { costPerRunUsd: Number((budget.spentUsd / runs.length).toFixed(5)), totalCostUsd: Number(budget.spentUsd.toFixed(4)), priceUsdPerMTok: contestant.price, priceSource: contestant.priceSource } : {}),
    ...(budget.capUsd !== null ? { capUsd: budget.capUsd, stoppedAtCap: budget.stopped } : {}),
  };
}
type Row = ReturnType<typeof summarise>;

async function main(): Promise<void> {
  const seedCount = Number(flag('seeds') ?? 3);
  const seeds = Array.from({ length: seedCount }, (_, i) => SEED_BASE + i);
  const missions = (flag('missions')?.split(',') as MissionId[] | undefined) ?? [...MISSION_IDS];
  const named = flag('contestants')?.split(',');
  const concurrency = Number(flag('concurrency') ?? 6);
  const capFlag = flag('cap-usd');
  const defaultBuild = PRESETS[DEFAULT_PRESET_ID];
  const entries: Entry[] = [
    ...missions.map((missionId) => ({ missionId, buildId: defaultBuild.id as string, build: defaultBuild.build })),
    ...(missions.includes('M6') && !has('default-build-only') ? [{ missionId: 'M6' as MissionId, buildId: 'deep_diver', build: PRESETS.deep_diver.build }] : []),
  ];
  // Without --contestants: the fast and mid tiers and the baselines. The reasoning tier must be named.
  const wanted = (spec: { id: string; tier: Tier }): boolean => (named ? named.includes(spec.id) : spec.tier !== 'reasoning');
  const contestants = await resolveContestants(wanted);
  for (const c of contestants) console.info(`${c.id.padEnd(20)} ${c.tier.padEnd(9)} ${c.status}${c.reason ? ` (${c.reason})` : ''}${c.params ? ` ${JSON.stringify(c.params)}` : ''}`);

  const rows: Row[] = [];
  const runsPerContestant = entries.length * seedCount;
  const started = performance.now();
  for (const contestant of contestants.filter((c) => c.status === 'ok')) {
    const capUsd = contestant.tier === 'reasoning' ? Number(capFlag ?? DEFAULT_CAP_USD) : capFlag ? Number(capFlag) : null;
    const price = contestant.price;
    // Worst case of one call: a full prompt in, the whole answer budget out.
    const maxOut = Number(contestant.params?.max_tokens ?? contestant.params?.max_completion_tokens ?? 0);
    const budget: Budget = { spentUsd: 0, capUsd, worstCallUsd: price ? (4000 * price.in + maxOut * price.out) / 1e6 : 0, stopped: false };
    const rowStarted = performance.now();
    const tasks = entries.flatMap((entry) =>
      seeds.map((seed) => async (): Promise<RunStats | null> => {
        if (budget.stopped) return null;
        const stats: RunStats = { entry, seed, episode: undefined as unknown as Episode, latenciesMs: [], noDecisions: 0, reasons: {}, inputTokens: 0, outputTokens: 0, usageReported: false, promptTokensEstimate: 0 };
        try {
          const { episode } = await runHeadless(MISSIONS[entry.missionId], seed, entry.build, arenaBrain(contestant.forRun(seed), stats, budget, price), { priority: 0.5, policy: 'jev' });
          const o = episode.outcome;
          console.info(`${contestant.id.padEnd(18)} ${entry.missionId} ${entry.buildId.padEnd(11)} seed ${seed}: ${o.finished ? 'finished' : `DNF ${o.dnfReason ?? ''}`} score ${o.score.toFixed(0)} · ${episode.decisions.length} decisions · ${stats.noDecisions} unanswered${price ? ` · $${budget.spentUsd.toFixed(3)} so far` : ''}`);
          return { ...stats, episode };
        } catch (error) {
          // The cap stops the row: a run cut short by it is dropped, not scored.
          if (error instanceof CapReached || budget.stopped) return null;
          throw error;
        }
      }),
    );
    const local = contestant.kind === 'heuristic' || contestant.kind === 'random';
    // A capped row runs two at a time so the spend is checked between calls.
    const done = (await pool(tasks, local ? 1 : capUsd !== null ? 2 : concurrency)).filter((run): run is RunStats => run !== null);
    if (done.length === 0) {
      console.info(`→ ${contestant.id}: no run completed${budget.stopped ? ' before the cap' : ''}`);
      continue;
    }
    const row = summarise(contestant, done, budget, seeds);
    rows.push(row);
    const reasons: Record<string, number> = {};
    for (const run of done) for (const [reason, count] of Object.entries(run.reasons)) reasons[reason] = (reasons[reason] ?? 0) + count;
    console.info(
      `→ ${contestant.id}: ${done.length}/${runsPerContestant} runs in ${((performance.now() - rowStarted) / 1000).toFixed(0)} s` +
        (row.totalCostUsd !== undefined ? ` · $${row.totalCostUsd} total ($${row.costPerRunUsd} per run)` : '') +
        (budget.stopped ? ` · STOPPED at the $${capUsd} cap` : '') +
        (row.noDecisions > 0 ? ` · ${row.noDecisions} unanswered (${Object.entries(reasons).map(([reason, count]) => `${reason} × ${count}`).join(', ')})` : ''),
    );
    for (const reason of Object.keys(reasons)) if (firstErrors[reason]) console.info(`   first "${reason}": ${firstErrors[reason]}`);
    for (const key of Object.keys(firstErrors)) delete firstErrors[key];
  }
  const wallS = (performance.now() - started) / 1000;

  // --keep: rows of contestants not run this time are carried over from the last results file. A carried row
  // keeps its own simCommit, and loses its late-crash count when that was counted under an older rule.
  const previous = has('keep') && existsSync(OUT_JSON) ? (JSON.parse(readFileSync(OUT_JSON, 'utf8')) as { contestants?: Row[] }) : {};
  const ran = new Set(rows.map((row) => row.id));
  for (const row of previous.contestants ?? []) {
    if (row.status !== 'ok' || ran.has(row.id)) continue;
    rows.push({ ...row, lateCrashes: row.lateCrashRule === LATE_CRASH_RULE ? row.lateCrashes : undefined, simCommit: row.simCommit ?? 'unknown' });
  }
  const order = ['fast', 'mid', 'reasoning', 'baseline'];
  rows.sort((a, b) => order.indexOf(a.tier ?? 'fast') - order.indexOf(b.tier ?? 'fast'));
  const commits = [...new Set(rows.map((row) => row.simCommit))];
  const have = new Set(rows.map((row) => row.id));
  const notOk = contestants.filter((c) => c.status !== 'ok' && !have.has(c.id));

  const date = new Date().toISOString().slice(0, 10);
  const totalRuns = rows.reduce((sum, row) => sum + row.runs, 0);
  const promptHash = arenaPromptHash();
  const previousFile = existsSync(OUT_JSON) ? (JSON.parse(readFileSync(OUT_JSON, 'utf8')) as { lab?: unknown }) : {};
  const older = rows.filter((row) => row.gameplayVersion !== undefined && row.gameplayVersion !== GAMEPLAY_VERSION);
  const notes = [
    VERDICT_NOTE,
    'No fallback for anyone: an answer that is late or missing leaves the robot on its last command.',
    ...(older.length > 0 ? [`${older.map((row) => `${row.label} (gameplay ${row.gameplayVersion}, ${row.runs} runs)`).join(', ')}: carried over from an earlier version of the game because the provider could not be called again; not comparable with the rows run on gameplay ${GAMEPLAY_VERSION}.`] : []),
  ];
  const results = {
    date,
    runs: totalRuns,
    promptHash,
    gameplayVersion: GAMEPLAY_VERSION,
    missions,
    seeds,
    builds: [...new Set(entries.map((entry) => entry.buildId))],
    timeoutMs: ARENA_TIMEOUT_MS,
    priceSources: PRICE_SOURCES,
    contestants: [
      ...rows,
      ...notOk.filter((c) => c.status === 'not_configured').map((c) => ({ id: c.id, modelId: c.id, label: c.label, kind: c.kind, tier: c.tier, status: 'not_configured' as const })),
    ],
    // In the lineup but without a row: the account cannot use the model, or no mode was accepted.
    notRun: notOk.filter((c) => c.status === 'unavailable').map((c) => ({ id: c.id, label: c.label, reason: publicReason(c.reason) })),
    notes,
    // The Lab track (arena-lab.ts) owns this key.
    ...(previousFile.lab !== undefined ? { lab: previousFile.lab } : {}),
  };
  writeFileSync(OUT_JSON, `${JSON.stringify(results, null, 2)}\n`);

  const cost = (row: Row): string => (row.costPerRunUsd !== undefined ? `$${row.costPerRunUsd.toFixed(4)} ($${row.totalCostUsd} row)` : '—');
  const lines = [
    '# RivetRun — Brain Arena',
    '',
    `Our sim, our prompts, ${totalRuns} runs, ${date}. Not a general model ranking.`,
    '',
    `Generated by \`packages/brain/scripts/arena.ts\` · gameplay version ${GAMEPLAY_VERSION} · prompt hash \`${promptHash}\` · this invocation ${fmt(wallS)} s. Every number is measured from headless runs.`,
    '',
    '## Rules',
    `- Same robot, seed, sensors and question for everyone: ${missions.join(', ')} on the ${defaultBuild.name}, plus Deep Diver on M6, priority 0.5, no briefing. Fast and mid tiers and the baselines: seeds ${SEED_BASE}–${SEED_BASE + 2} (${(missions.length + (missions.includes('M6') ? 1 : 0)) * 3} runs). Reasoning tier: 1 seed on the ${defaultBuild.name} first (${missions.length} runs), under a spending cap.`,
    '- One call per trigger. Latency is applied in sim time: the robot holds its last command until the answer arrives.',
    `- No fallback for anyone, Jev included. No answer within ${ARENA_TIMEOUT_MS / 1000} s, or an error, is "unanswered": the robot keeps its command for those ${ARENA_TIMEOUT_MS / 1000} s.`,
    '- LLMs get the question as plain text and answer `{ "choice", "confidence" }`, no tools. Fast and mid tiers run with reasoning off or at the lowest effort the model accepts; entries labelled "(reasoning)" use the model\'s default reasoning. Temperature 0 where the model accepts it. The exact parameters per contestant are in the table below and in `docs/arena-results.json`.',
    '- Each model id is checked against its provider\'s models endpoint before its row starts.',
    '',
    '## Results',
    '| Tier | Contestant | Runs | Finish | Score | Time s (finished) | Damage % | Decisions / run | Unanswered | Latency p50 / p95 ms | Late crashes | Tokens / run (in / out) | Cost / run |',
    '| - | - | - | - | - | - | - | - | - | - | - | - | - |',
    ...rows.map(
      (row) =>
        `| ${row.tier ?? ''} | ${row.label} (\`${row.id}\`) | ${row.runs}${row.stoppedAtCap ? ' (stopped at cap)' : ''} | ${row.finishPct} % | ${row.meanScore} | ${fmt(row.meanTimeS, 1)} | ${fmt(row.meanDamagePct, 1)} | ${fmt(row.decisionsPerRun, 1)} | ${row.noDecisions} | ${fmt(row.latencyP50Ms)} / ${fmt(row.latencyP95Ms)} | ${row.lateCrashes ?? '—'} | ${row.inputTokens !== undefined ? `${row.inputTokens} / ${row.outputTokens}` : '—'} | ${cost(row)} |`,
    ),
    ...notOk.map((c) => `| ${c.tier} | ${c.label} (\`${c.id}\`) | ${c.status === 'not_configured' ? 'not configured' : 'not run'}: ${publicReason(c.reason)} | | | | | | | | | | |`),
    '',
    '- Late crashes: the robot hit something, got blocked or fell while its previous answer had not arrived yet. "—" = that row was run before this rule and has not been re-counted.',
    ...notes.slice(1).map((note) => `- ${note}`),
    commits.length > 1
      ? `- Rows were driven on different commits of the sim (${rows.map((row) => `${row.label}: ${row.simCommit}${row.gameplayVersion !== undefined ? `, gameplay ${row.gameplayVersion}` : ''}`).join(' · ')}), so they are not strictly comparable until all are re-run together.`
      : `- Every row was driven on sim commit ${commits[0] ?? SIM_COMMIT}.`,
    `- Cost = tokens the provider reported × its official price per million tokens on ${date}: Anthropic ${PRICE_SOURCES.anthropic} · OpenAI ${PRICE_SOURCES.openai} (each model's page) · DeepSeek ${PRICE_SOURCES.deepseek} (peak-hour, cache-miss rate, so an upper bound).`,
    '',
    new Set(rows.map((row) => row.promptHash)).size === 1
      ? `- Every row was asked with the same prompt template (hash \`${promptHash}\`).`
      : `- Rows were asked with different prompt templates (${rows.map((row) => `${row.label}: ${row.promptHash ?? 'unknown'}`).join(', ')}): re-run them together before comparing.`,
    '',
    '## Mode parameters sent, per contestant',
    ...rows.filter((row) => row.params).map((row) => `- \`${row.id}\`: \`${JSON.stringify(row.params)}\`${row.priceUsdPerMTok ? ` · $${row.priceUsdPerMTok.in} in / $${row.priceUsdPerMTok.out} out per million tokens` : ''}`),
    '',
  ];
  writeFileSync(OUT_MD, lines.join('\n'));
  console.info(`\nWrote ${OUT_MD} and ${OUT_JSON}\n`);
  console.info(lines.join('\n'));
}

await main();
