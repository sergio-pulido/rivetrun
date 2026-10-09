// Benchmark: every mission × every preset × N seeds × policies, headless, with real Jev calls.
// Writes docs/BENCHMARK.md. Measured numbers only.
//   pnpm --filter @rivetrun/brain benchmark -- --seeds 3 --policies jev,heuristic,random
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Brain, Episode, MissionId, Policy, PresetId } from '@rivetrun/contracts';
import { heuristicBrain, MISSION_IDS, MISSIONS, PRESETS, randomBrain, runHeadless } from '@rivetrun/sim';
import { createJevBrain, JEV_MODEL_ID, JEV_TIMEOUT_MS } from '../src/index';

const ALL_POLICIES: readonly Policy[] = ['jev', 'heuristic', 'random'];
const PRIORITY = 0.5;
const SEED_BASE = 1001;
const DEFAULT_OUT = fileURLToPath(new URL('../../../docs/BENCHMARK.md', import.meta.url));

interface Args {
  readonly seeds: number;
  readonly policies: readonly Policy[];
  readonly missions: readonly MissionId[];
  readonly concurrency: number;
  readonly out: string;
}

interface RunResult {
  readonly missionId: MissionId;
  readonly presetId: PresetId;
  readonly seed: number;
  readonly policy: Policy;
  readonly episode: Episode;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const list = <T extends string>(flag: string, all: readonly T[]): readonly T[] => {
    const raw = value(flag);
    if (!raw) return all;
    const picked = raw.split(',').filter((item): item is T => (all as readonly string[]).includes(item));
    if (picked.length === 0) throw new Error(`--${flag}: nothing valid in "${raw}" (allowed: ${all.join(', ')})`);
    return picked;
  };
  const positiveInt = (flag: string, fallback: number): number => {
    const parsed = Number(value(flag) ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${flag} must be a positive integer`);
    return parsed;
  };
  return {
    seeds: positiveInt('seeds', 3),
    policies: list('policies', ALL_POLICIES),
    missions: list('missions', MISSION_IDS),
    concurrency: positiveInt('concurrency', 6),
    out: value('out') ?? DEFAULT_OUT,
  };
}

const brainFor = (policy: Policy, seed: number, jev: Brain): Brain =>
  policy === 'jev' ? jev : policy === 'heuristic' ? heuristicBrain : randomBrain(seed);

/** Runs tasks with a fixed number in flight (Jev runs are network-bound). */
async function pool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const percentile = (values: readonly number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

const fmt = (value: number | null, digits = 1): string => (value === null ? '—' : value.toFixed(digits));

function summaryRow(label: string, runs: readonly RunResult[]): string {
  const outcomes = runs.map((run) => run.episode.outcome);
  const finished = outcomes.filter((o) => o.finished);
  return [
    label,
    String(runs.length),
    `${fmt((finished.length / runs.length) * 100, 0)} %`,
    fmt(mean(finished.map((o) => o.timeS))),
    fmt(mean(outcomes.map((o) => o.damagePct))),
    fmt(mean(outcomes.map((o) => o.energyUsedPct))),
    fmt(mean(outcomes.map((o) => o.score)), 0),
  ].join(' | ');
}

const TABLE_HEAD = [
  '| Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |',
  '| - | - | - | - | - | - | - |',
];

function report(args: Args, policies: readonly Policy[], results: readonly RunResult[], wallS: number): string {
  const byPolicy = (policy: Policy): RunResult[] => results.filter((r) => r.policy === policy);
  const decisions = results.flatMap((r) => r.episode.decisions);
  const jevDecisions = byPolicy('jev').flatMap((r) => r.episode.decisions);
  const jevAnswered = jevDecisions.filter((d) => d.policy === 'jev' && !d.fallback);
  const jevFallbacks = jevDecisions.length - jevAnswered.length;
  const latencies = jevAnswered.map((d) => d.latencyMs);
  const models = [...new Set(jevAnswered.map((d) => d.model).filter((m): m is string => Boolean(m)))];
  const policyName: Record<Policy, string> = { jev: 'Jev', heuristic: 'Heuristic', random: 'Random' };

  const lines: string[] = [
    '# RivetRun — Brain benchmark',
    '',
    `Generated ${new Date().toISOString()} by \`packages/brain/scripts/benchmark.ts\`. Every number below is measured from headless runs of the game sim; nothing is estimated.`,
    '',
    '## Setup',
    `- Missions: ${args.missions.join(', ')} · Presets: ${Object.keys(PRESETS).join(', ')} · Seeds per mission × preset: ${args.seeds} (${Array.from({ length: args.seeds }, (_, i) => SEED_BASE + i).join(', ')})`,
    `- Policies: ${policies.map((p) => policyName[p]).join(', ')} · Player priority: ${PRIORITY} (balanced)`,
    `- Total runs: ${results.length} · Total decisions: ${decisions.length} · Wall time: ${fmt(wallS, 0)} s`,
    '- Mean time counts finished runs only; damage, energy and score count every run (DNF included).',
  ];
  if (args.missions.includes('M5')) {
    lines.push(
      `- M5 always runs on its fixed seed (${MISSIONS.M5.fixedSeed}), so its ${args.seeds} seeds repeat the same world; only the random policy's own draws differ.`,
    );
  }
  lines.push('', '## Jev');
  if (!policies.includes('jev')) {
    lines.push('- Not run: JEV_API_KEY was not set (or jev was excluded with `--policies`).');
  } else {
    lines.push(
      `- Pinned model id: \`${JEV_MODEL_ID}\` · Model id reported by the API: ${models.length > 0 ? models.map((m) => `\`${m}\``).join(', ') : '—'}`,
      `- Decisions asked: ${jevDecisions.length} · answered by Jev: ${jevAnswered.length} · heuristic fallbacks (error or > ${JEV_TIMEOUT_MS} ms): ${jevFallbacks}`,
      `- Jev latency, answered calls: p50 ${fmt(percentile(latencies, 50), 0)} ms · p95 ${fmt(percentile(latencies, 95), 0)} ms · max ${fmt(latencies.length > 0 ? Math.max(...latencies) : null, 0)} ms`,
      `- Calls were made ${args.concurrency} runs at a time, one call per decision, no cache, ${JEV_TIMEOUT_MS} ms timeout as in the game.`,
    );
  }
  lines.push('', '## Overall, per policy', `| Policy ${TABLE_HEAD[0]}`, TABLE_HEAD[1]!);
  for (const policy of policies) lines.push(`| ${summaryRow(policyName[policy], byPolicy(policy))} |`);

  lines.push('', '## Per mission', `| Mission | Policy ${TABLE_HEAD[0]}`, `| - ${TABLE_HEAD[1]}`);
  for (const missionId of args.missions) {
    for (const policy of policies) {
      const runs = byPolicy(policy).filter((r) => r.missionId === missionId);
      lines.push(`| ${missionId} ${MISSIONS[missionId].name} | ${summaryRow(policyName[policy], runs)} |`);
    }
  }

  lines.push('', '## Per preset', `| Preset | Policy ${TABLE_HEAD[0]}`, `| - ${TABLE_HEAD[1]}`);
  for (const presetId of Object.keys(PRESETS) as PresetId[]) {
    for (const policy of policies) {
      const runs = byPolicy(policy).filter((r) => r.presetId === presetId);
      lines.push(`| ${PRESETS[presetId].name} | ${summaryRow(policyName[policy], runs)} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const hasKey = Boolean(process.env.JEV_API_KEY);
  const policies = args.policies.filter((policy) => policy !== 'jev' || hasKey);
  if (args.policies.includes('jev') && !hasKey) console.warn('JEV_API_KEY is not set: skipping the jev policy.');

  const jev = createJevBrain();
  const tasks: (() => Promise<RunResult>)[] = [];
  for (const policy of policies) {
    for (const missionId of args.missions) {
      for (const presetId of Object.keys(PRESETS) as PresetId[]) {
        for (let i = 0; i < args.seeds; i++) {
          const seed = SEED_BASE + i;
          tasks.push(async () => {
            const { episode } = await runHeadless(MISSIONS[missionId], seed, PRESETS[presetId].build, brainFor(policy, seed, jev), {
              priority: PRIORITY,
              policy,
            });
            const o = episode.outcome;
            console.info(
              `${policy.padEnd(9)} ${missionId} ${presetId.padEnd(11)} seed ${seed}: ${o.finished ? 'finished' : `DNF ${o.dnfReason ?? ''}`} score ${o.score.toFixed(0)} (${episode.decisions.length} decisions)`,
            );
            return { missionId, presetId, seed, policy, episode };
          });
        }
      }
    }
  }

  const started = performance.now();
  const results = await pool(tasks, args.concurrency);
  const markdown = report(args, policies, results, (performance.now() - started) / 1000);
  writeFileSync(args.out, markdown);
  console.info(`\nWrote ${args.out}\n`);
  console.info(markdown);
}

await main();
