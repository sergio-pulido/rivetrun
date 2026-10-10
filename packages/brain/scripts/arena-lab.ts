// Brain Arena, Lab track (docs/OVERNIGHT.md OVN-BRAIN-3): the fast tier and the baselines on Lab Missions,
// the grid simulation in packages/lab. Same rules as the rail arena: one call per trigger, no fallback,
// a 10 s deadline, latency applied in sim time (the lab sim does both itself: a throw is a recorded miss).
// Writes the "lab" block of docs/arena-results.json and docs/ARENA_LAB.md. Measured numbers only.
//   pnpm --filter @rivetrun/brain arena:lab                     fast tier + baselines, every scenario, 3 seeds
//   pnpm --filter @rivetrun/brain arena:lab -- --smoke          one small test maze, nothing written
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Build } from '@rivetrun/contracts';
import * as lab from '@rivetrun/lab';
import { labHeuristicBrain, labRandomBrain, LAB_VERSION, runLabEntries, type LabBrain, type LabQuestion, type LabRunResult, type LabScenario } from '@rivetrun/lab';
import { scenarioOf, withSensors } from '../../lab/src/testkit';
import { labDecider } from '../src/arena/lab';
import { ARENA_TIMEOUT_MS, PRICE_SOURCES, resolveContestants, type Contestant, type Tier } from '../src/arena/providers';
import { buildLabTextPrompt, LAB_QUESTION_VERSION, LAB_SYSTEM } from '../src/lab/question';

const OUT_JSON = fileURLToPath(new URL('../../../docs/arena-results.json', import.meta.url));
const OUT_MD = fileURLToPath(new URL('../../../docs/ARENA_LAB.md', import.meta.url));
const SIM_COMMIT = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const DEFAULT_SEEDS = [1001, 1002, 1003];

interface LabEntry {
  readonly scenario: LabScenario;
  readonly build: Build;
  readonly seeds: readonly number[];
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);
const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

/** The scenarios to run: the lab package's registry, or one small maze for --smoke. */
function entries(): LabEntry[] {
  if (has('smoke')) {
    const maze = scenarioOf(['#########', '#S..#...#', '#.#.#.#.#', '#.#...#E#', '#########'], { id: 'smoke-maze', name: 'Smoke maze', description: 'Reach the exit of a small maze.' });
    return [{ scenario: maze, build: withSensors('lidar_rplidar_c1', 'camera'), seeds: [1001] }];
  }
  // The registry lands with OVN-LAB-2. Read defensively so a missing export is a clear message, not a crash.
  const registry = (lab as Record<string, unknown>).LAB_SCENARIOS;
  if (!Array.isArray(registry) || registry.length === 0) {
    console.error('@rivetrun/lab exports no LAB_SCENARIOS yet: nothing to run (use --smoke to test the brains on a small maze).');
    process.exit(1);
  }
  return (registry as { scenario?: LabScenario; build?: Build; defaultBuild?: Build; seeds?: readonly number[] }[]).flatMap((item) => {
    const scenario = item.scenario ?? (item as unknown as LabScenario);
    const build = item.build ?? item.defaultBuild;
    if (!scenario?.id || !build) return [];
    return [{ scenario, build, seeds: item.seeds ?? DEFAULT_SEEDS }];
  });
}

interface RowStats {
  runs: LabRunResult[];
  latenciesMs: number[];
  misses: number;
  inputTokens: number;
  outputTokens: number;
  usageReported: boolean;
  spentUsd: number;
  firstMiss?: string;
}

/** The contestant as a LabBrain. A throw (error, timeout, a choice not on offer) is the sim's "miss". */
function labBrain(contestant: Contestant, seed: number, stats: RowStats): LabBrain {
  if (contestant.kind === 'heuristic') return labHeuristicBrain;
  if (contestant.kind === 'random') return labRandomBrain(seed);
  const decide = labDecider(contestant);
  if (!decide) throw new Error(`${contestant.id} cannot answer Lab questions`);
  return {
    decide: async (question: LabQuestion) => {
      const answer = await decide(question);
      stats.latenciesMs.push(answer.latencyMs);
      if (answer.usage) {
        stats.usageReported = true;
        stats.inputTokens += answer.usage.inputTokens;
        stats.outputTokens += answer.usage.outputTokens;
        if (contestant.price) stats.spentUsd += (answer.usage.inputTokens * contestant.price.in + answer.usage.outputTokens * contestant.price.out) / 1e6;
      }
      return { choice: answer.choice, probabilities: answer.probabilities, latencyMs: answer.latencyMs, policy: 'jev', model: contestant.id };
    },
  };
}

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length);
const percentile = (values: readonly number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};
const round = (value: number | null, digits = 1): number | undefined => (value === null ? undefined : Number(value.toFixed(digits)));
const fmt = (value: number | null | undefined, digits = 0): string => (value === null || value === undefined ? '—' : value.toFixed(digits));

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

/** Hash of the Lab prompt template: wording version, system text and a rendered fixed question. */
function labPromptHash(sample: LabQuestion | undefined): string {
  const hash = createHash('sha256').update(`${LAB_QUESTION_VERSION}\n${LAB_VERSION}\n${LAB_SYSTEM}`);
  if (sample) hash.update(buildLabTextPrompt({ ...sample, knew: [], unknown: [], options: sample.options.slice(0, 1) }).user.replace(/\d+(\.\d+)?/g, '#'));
  return hash.digest('hex').slice(0, 10);
}

async function main(): Promise<void> {
  const todo = entries();
  const named = flag('contestants')?.split(',');
  // The Lab track is the fast tier and the baselines (docs/OVERNIGHT.md); anything else must be named.
  const wanted = (spec: { id: string; tier: Tier }): boolean => (named ? named.includes(spec.id) : spec.tier === 'fast' || spec.tier === 'baseline');
  const contestants = await resolveContestants(wanted);
  for (const c of contestants) console.info(`${c.id.padEnd(20)} ${c.tier.padEnd(9)} ${c.status}${c.reason ? ` (${c.reason})` : ''}`);

  const rows: Record<string, unknown>[] = [];
  let sample: LabQuestion | undefined;
  for (const contestant of contestants.filter((c) => c.status === 'ok')) {
    const stats: RowStats = { runs: [], latenciesMs: [], misses: 0, inputTokens: 0, outputTokens: 0, usageReported: false, spentUsd: 0 };
    const tasks = todo.flatMap((entry) =>
      entry.seeds.map((seed) => async (): Promise<LabRunResult> => {
        const agentId = entry.scenario.agents[0]!.id;
        const brain = labBrain(contestant, seed, stats);
        const spy: LabBrain = { decide: (question) => ((sample ??= question), brain.decide(question)) };
        // Other robots in a two-robot scenario are driven by the lab heuristic.
        const others = entry.scenario.agents.slice(1).map((agent) => ({ agentId: agent.id, build: entry.build, brain: labHeuristicBrain }));
        const result = await runLabEntries(entry.scenario, seed, [{ agentId, build: entry.build, brain: spy, policy: 'jev' }, ...others]);
        const outcome = result.outcomes[agentId]!;
        const mine = result.misses.filter((miss) => miss.agentId === agentId);
        stats.misses += mine.length;
        stats.firstMiss ??= mine[0]?.reason.slice(0, 160);
        console.info(`${contestant.id.padEnd(18)} ${entry.scenario.id.padEnd(12)} seed ${seed}: ${outcome.status} score ${outcome.score.toFixed(0)} · ${result.decisions.filter((d) => d.agentId === agentId).length} decisions · ${mine.length} unanswered`);
        return result;
      }),
    );
    const local = contestant.kind === 'heuristic' || contestant.kind === 'random';
    stats.runs = await pool(tasks, local ? 1 : 4);
    const outcomes = stats.runs.map((run) => run.outcomes[run.final.agents[0]!.id]!);
    const decisions = stats.runs.map((run) => run.decisions.filter((d) => d.agentId === run.final.agents[0]!.id).length);
    rows.push({
      id: contestant.id,
      modelId: contestant.id,
      label: contestant.label,
      kind: contestant.kind,
      tier: contestant.tier,
      status: 'ok',
      params: contestant.params,
      runs: stats.runs.length,
      finishPct: Math.round((outcomes.filter((o) => o.finished).length / outcomes.length) * 100),
      meanScore: Math.round(mean(outcomes.map((o) => o.score)) ?? 0),
      meanTimeS: round(mean(outcomes.filter((o) => o.finished).map((o) => o.timeS))),
      meanDamagePct: round(mean(outcomes.map((o) => o.damagePct))),
      meanCompletionPct: Math.round((mean(outcomes.map((o) => o.completion)) ?? 0) * 100),
      decisionsPerRun: round(mean(decisions)),
      noDecisions: stats.misses,
      latencyP50Ms: local ? 0 : round(percentile(stats.latenciesMs, 50), 0),
      latencyP95Ms: local ? 0 : round(percentile(stats.latenciesMs, 95), 0),
      simCommit: SIM_COMMIT,
      ...(stats.usageReported ? { inputTokens: Math.round(stats.inputTokens / stats.runs.length), outputTokens: Math.round(stats.outputTokens / stats.runs.length) } : {}),
      ...(stats.usageReported && contestant.price ? { costPerRunUsd: Number((stats.spentUsd / stats.runs.length).toFixed(5)), totalCostUsd: Number(stats.spentUsd.toFixed(4)), priceSource: contestant.priceSource } : {}),
    });
    console.info(`→ ${contestant.id}: ${stats.runs.length} runs${stats.usageReported && contestant.price ? ` · $${stats.spentUsd.toFixed(4)}` : ''}${stats.misses > 0 ? ` · ${stats.misses} unanswered (first: ${stats.firstMiss ?? '?'})` : ''}`);
  }

  const promptHash = labPromptHash(sample);
  for (const row of rows) row.promptHash = promptHash;
  const date = new Date().toISOString().slice(0, 10);
  const totalRuns = rows.reduce((sum, row) => sum + (row.runs as number), 0);
  const block = {
    date,
    runs: totalRuns,
    promptHash,
    labVersion: LAB_VERSION,
    scenarios: todo.map((entry) => entry.scenario.id),
    seeds: [...new Set(todo.flatMap((entry) => entry.seeds))],
    timeoutMs: ARENA_TIMEOUT_MS,
    priceSources: PRICE_SOURCES,
    contestants: [...rows, ...contestants.filter((c) => c.status === 'not_configured').map((c) => ({ id: c.id, modelId: c.id, label: c.label, kind: c.kind, tier: c.tier, status: 'not_configured' }))],
    notRun: contestants.filter((c) => c.status === 'unavailable').map((c) => ({ id: c.id, label: c.label, reason: c.reason ?? 'unavailable' })),
  };

  const table = [
    '| Contestant | Runs | Completed | Score | Mission done % | Time s (completed) | Decisions / run | Unanswered | Latency p50 / p95 ms | Cost / run |',
    '| - | - | - | - | - | - | - | - | - | - |',
    ...rows.map((r) => `| ${r.label} (\`${r.id}\`) | ${r.runs} | ${r.finishPct} % | ${r.meanScore} | ${r.meanCompletionPct} % | ${fmt(r.meanTimeS as number | undefined, 1)} | ${fmt(r.decisionsPerRun as number | undefined, 1)} | ${r.noDecisions} | ${fmt(r.latencyP50Ms as number | undefined)} / ${fmt(r.latencyP95Ms as number | undefined)} | ${r.costPerRunUsd !== undefined ? `$${(r.costPerRunUsd as number).toFixed(4)}` : '—'} |`),
  ];
  console.info(`\n${table.join('\n')}\n`);
  if (has('smoke')) {
    console.info('Smoke run: nothing written.');
    return;
  }

  // The rail arena owns the rest of the file; only the "lab" key is replaced here.
  const file = existsSync(OUT_JSON) ? (JSON.parse(readFileSync(OUT_JSON, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(OUT_JSON, `${JSON.stringify({ ...file, lab: block }, null, 2)}\n`);
  writeFileSync(
    OUT_MD,
    [
      '# RivetRun — Brain Arena, Lab Missions',
      '',
      `Our grid sim, our prompts, ${totalRuns} runs, ${date}. Not a general model ranking. Lab Missions use a grid simulation (packages/lab), not the rail physics.`,
      '',
      `Generated by \`packages/brain/scripts/arena-lab.ts\` · lab version ${LAB_VERSION} · prompt hash \`${promptHash}\` · commit ${SIM_COMMIT}.`,
      '',
      `- Scenarios: ${block.scenarios.join(', ')} × seeds ${block.seeds.join(', ')}, each on the scenario's default build. In two-robot scenarios the other robot is driven by the lab heuristic.`,
      `- One call per trigger, no fallback, ${ARENA_TIMEOUT_MS / 1000} s deadline: an error, a late answer or a choice not on offer is "unanswered" and the robot keeps its command. Latency is applied in sim time.`,
      '- Fast tier and baselines only. Cost = reported tokens × the provider\'s official price (see docs/ARENA.md for the sources).',
      '',
      ...table,
      '',
    ].join('\n'),
  );
  console.info(`Wrote the "lab" block of ${OUT_JSON} and ${OUT_MD}`);
}

await main();
