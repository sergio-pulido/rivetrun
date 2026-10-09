// Benchmark: every mission × every build (presets + a Scout drone build) × N seeds × policies, headless, with real Jev calls.
// Writes docs/BENCHMARK.md. Measured numbers only.
//   pnpm --filter @rivetrun/brain benchmark -- --seeds 3 --policies jev,heuristic,random --briefings none,daredevil,careful,eco
// Each briefing is its own Jev variant ("Brief the brain"); the heuristic and random policies ignore briefings.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BRIEFING_PRESETS, type Brain, type Build, type Episode, type MissionId, type Policy } from '@rivetrun/contracts';
import { heuristicBrain, MISSION_IDS, MISSIONS, PRESETS, randomBrain, runHeadless } from '@rivetrun/sim';
import { createJevBrain, JEV_MODEL_ID, JEV_TIMEOUT_MS } from '../src/index';

const ALL_POLICIES: readonly Policy[] = ['jev', 'heuristic', 'random'];
const PRIORITY = 0.5;
const SEED_BASE = 1001;
const DEFAULT_OUT = fileURLToPath(new URL('../../../docs/BENCHMARK.md', import.meta.url));

/** The builds every policy drives: the game's presets plus one build with the Scout drone, which no preset fits. */
interface BenchBuild {
  readonly id: string;
  readonly name: string;
  readonly build: Build;
}
const BUILDS: readonly BenchBuild[] = [
  ...Object.values(PRESETS).map((preset) => ({ id: preset.id as string, name: preset.name, build: preset.build })),
  {
    id: 'scout',
    name: 'Scout (All-rounder with the Scout drone instead of the camera)',
    build: { ...PRESETS.all_rounder.build, sensors: ['scout_drone', 'ultrasonic'] },
  },
];

const BRIEFING_IDS = ['none', ...BRIEFING_PRESETS.map((preset) => preset.id)] as const;
type BriefingId = (typeof BRIEFING_IDS)[number];

/** One row of the tables: a policy, and for Jev the briefing it drives by. */
interface Variant {
  readonly key: string;
  readonly label: string;
  readonly policy: Policy;
  readonly briefing?: string;
}

interface Args {
  readonly seeds: number;
  readonly policies: readonly Policy[];
  readonly briefings: readonly BriefingId[];
  readonly missions: readonly MissionId[];
  readonly concurrency: number;
  readonly out: string;
}

interface RunResult {
  readonly missionId: MissionId;
  readonly buildId: string;
  readonly seed: number;
  readonly variant: Variant;
  readonly episode: Episode;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const list = <T extends string>(flag: string, fallback: readonly T[], all: readonly T[] = fallback): readonly T[] => {
    const raw = value(flag);
    if (!raw) return fallback;
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
    briefings: list('briefings', ['none'] as readonly BriefingId[], BRIEFING_IDS),
    missions: list('missions', MISSION_IDS),
    concurrency: positiveInt('concurrency', 6),
    out: value('out') ?? DEFAULT_OUT,
  };
}

function variantsFor(policies: readonly Policy[], briefings: readonly BriefingId[]): Variant[] {
  return policies.flatMap((policy): Variant[] => {
    if (policy === 'heuristic') return [{ key: 'heuristic', label: 'Heuristic', policy }];
    if (policy === 'random') return [{ key: 'random', label: 'Random', policy }];
    return briefings.map((id) => {
      const preset = BRIEFING_PRESETS.find((candidate) => candidate.id === id);
      return preset
        ? { key: `jev:${id}`, label: `Jev + ${preset.name}`, policy, briefing: preset.text }
        : { key: 'jev', label: 'Jev (no briefing)', policy };
    });
  });
}

function brainFor(variant: Variant, seed: number, jev: Brain): Brain {
  if (variant.policy === 'heuristic') return heuristicBrain;
  if (variant.policy === 'random') return randomBrain(seed);
  const { briefing } = variant;
  return briefing ? { decide: (question) => jev.decide({ ...question, briefing }) } : jev;
}

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

function report(args: Args, variants: readonly Variant[], results: readonly RunResult[], wallS: number): string {
  const of = (variant: Variant): RunResult[] => results.filter((r) => r.variant.key === variant.key);
  const decisions = results.flatMap((r) => r.episode.decisions);
  const jevDecisions = results.filter((r) => r.variant.policy === 'jev').flatMap((r) => r.episode.decisions);
  const jevAnswered = jevDecisions.filter((d) => d.policy === 'jev' && !d.fallback);
  const jevFallbacks = jevDecisions.length - jevAnswered.length;
  const latencies = jevAnswered.map((d) => d.latencyMs);
  const models = [...new Set(jevAnswered.map((d) => d.model).filter((m): m is string => Boolean(m)))];
  const ranJev = variants.some((variant) => variant.policy === 'jev');
  const briefed = variants.filter((variant) => variant.briefing);

  const lines: string[] = [
    '# RivetRun — Brain benchmark',
    '',
    `Generated ${new Date().toISOString()} by \`packages/brain/scripts/benchmark.ts\`. Every number below is measured from headless runs of the game sim; nothing is estimated.`,
    '',
    '## Setup',
    `- Missions: ${args.missions.join(', ')} · Builds: ${BUILDS.map((b) => b.id).join(', ')} · Seeds per mission × build: ${args.seeds} (${Array.from({ length: args.seeds }, (_, i) => SEED_BASE + i).join(', ')})`,
    `- Rows: ${variants.map((variant) => variant.label).join(', ')} · Player priority: ${PRIORITY} (balanced)`,
    `- Total runs: ${results.length} · Total decisions: ${decisions.length} · Wall time: ${fmt(wallS, 0)} s`,
    '- Mean time counts finished runs only; damage, energy and score count every run (DNF included).',
  ];
  if (args.missions.includes('M5')) {
    lines.push(
      `- M5 always runs on its fixed seed (${MISSIONS.M5.fixedSeed}), so its ${args.seeds} seeds repeat the same world; only the random policy's own draws differ.`,
    );
  }
  if (briefed.length > 0) {
    lines.push(
      `- Briefings ("Brief the brain") are sent to Jev with every question: ${briefed.map((variant) => `${variant.label.replace('Jev + ', '')} = "${variant.briefing}"`).join(' · ')}. The heuristic and random policies never read a briefing.`,
    );
  }
  lines.push('', '## Jev');
  if (!ranJev) {
    lines.push('- Not run: JEV_API_KEY was not set (or jev was excluded with `--policies`).');
  } else {
    lines.push(
      `- Pinned model id: \`${JEV_MODEL_ID}\` · Model id reported by the API: ${models.length > 0 ? models.map((m) => `\`${m}\``).join(', ') : '—'}`,
      `- Decisions asked: ${jevDecisions.length} · answered by Jev: ${jevAnswered.length} · heuristic fallbacks (error or > ${JEV_TIMEOUT_MS} ms): ${jevFallbacks}`,
      `- Jev latency, answered calls: p50 ${fmt(percentile(latencies, 50), 0)} ms · p95 ${fmt(percentile(latencies, 95), 0)} ms · max ${fmt(latencies.length > 0 ? Math.max(...latencies) : null, 0)} ms`,
      `- Calls were made ${args.concurrency} runs at a time, one call per decision, no cache, ${JEV_TIMEOUT_MS} ms timeout as in the game.`,
    );
  }
  lines.push('', '## Overall, per policy and briefing', `| Policy ${TABLE_HEAD[0]}`, TABLE_HEAD[1]!);
  for (const variant of variants) lines.push(`| ${summaryRow(variant.label, of(variant))} |`);

  lines.push('', '## Per mission', `| Mission | Policy ${TABLE_HEAD[0]}`, `| - ${TABLE_HEAD[1]}`);
  for (const missionId of args.missions) {
    for (const variant of variants) {
      const runs = of(variant).filter((r) => r.missionId === missionId);
      lines.push(`| ${missionId} ${MISSIONS[missionId].name} | ${summaryRow(variant.label, runs)} |`);
    }
  }

  lines.push('', '## Per build', `| Build | Policy ${TABLE_HEAD[0]}`, `| - ${TABLE_HEAD[1]}`);
  for (const bench of BUILDS) {
    for (const variant of variants) {
      const runs = of(variant).filter((r) => r.buildId === bench.id);
      lines.push(`| ${bench.name.split(' (')[0]} | ${summaryRow(variant.label, runs)} |`);
    }
  }

  // The two builds made for one mission each: thrusters for Deep Water, the Scout drone for Frozen Pass.
  const spotlight = [
    { missionId: 'M6', buildId: 'deep_diver' },
    { missionId: 'M4', buildId: 'scout' },
    { missionId: 'M4', buildId: 'all_rounder' },
  ].filter((pair) => args.missions.includes(pair.missionId as MissionId));
  if (spotlight.length > 0) {
    lines.push('', '## Specialist builds on their mission', `| Mission · build | Policy ${TABLE_HEAD[0]}`, `| - ${TABLE_HEAD[1]}`);
    for (const pair of spotlight) {
      const bench = BUILDS.find((b) => b.id === pair.buildId)!;
      for (const variant of variants) {
        const runs = of(variant).filter((r) => r.missionId === pair.missionId && r.buildId === pair.buildId);
        lines.push(`| ${pair.missionId} · ${bench.name.split(' (')[0]} | ${summaryRow(variant.label, runs)} |`);
      }
    }
    lines.push('', `Scout = ${BUILDS.find((b) => b.id === 'scout')!.name.split('(')[1]!.replace(')', '')}; the sim then simulates each option further ahead and Jev is told the longer window.`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const hasKey = Boolean(process.env.JEV_API_KEY);
  const variants = variantsFor(
    args.policies.filter((policy) => policy !== 'jev' || hasKey),
    args.briefings,
  );
  if (args.policies.includes('jev') && !hasKey) console.warn('JEV_API_KEY is not set: skipping the jev policy.');

  const jev = createJevBrain();
  const tasks: (() => Promise<RunResult>)[] = [];
  for (const variant of variants) {
    const { policy } = variant;
    for (const missionId of args.missions) {
      for (const bench of BUILDS) {
        for (let i = 0; i < args.seeds; i++) {
          const seed = SEED_BASE + i;
          tasks.push(async () => {
            const { episode } = await runHeadless(MISSIONS[missionId], seed, bench.build, brainFor(variant, seed, jev), {
              priority: PRIORITY,
              policy,
            });
            const o = episode.outcome;
            console.info(
              `${variant.key.padEnd(13)} ${missionId} ${bench.id.padEnd(11)} seed ${seed}: ${o.finished ? 'finished' : `DNF ${o.dnfReason ?? ''}`} score ${o.score.toFixed(0)} (${episode.decisions.length} decisions)`,
            );
            return { missionId, buildId: bench.id, seed, variant, episode };
          });
        }
      }
    }
  }

  const started = performance.now();
  const results = await pool(tasks, args.concurrency);
  const markdown = report(args, variants, results, (performance.now() - started) / 1000);
  writeFileSync(args.out, markdown);
  console.info(`\nWrote ${args.out}\n`);
  console.info(markdown);
}

await main();
