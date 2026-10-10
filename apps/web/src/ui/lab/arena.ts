// Brain Arena results (docs/BRAIN_ARENA.md): same robot, same seed, same sensors, same question, different brains.
// Pure parsing and formatting of the brain session's results JSON. Nothing here invents a figure: a number the file
// does not carry shows as "—".
import { z } from 'zod';

const KINDS = ['jev', 'heuristic', 'random', 'llm', 'human'] as const;
export type ContestantKind = (typeof KINDS)[number];

const ContestantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(KINDS),
  /** "not_configured": the provider has no key, so it did not run. */
  status: z.enum(['ok', 'not_configured']),
  /** The exact model id sent to the provider. */
  modelId: z.string().nullish(),
  runs: z.number().int().min(0).nullish(),
  finishPct: z.number().min(0).max(100).nullish(),
  meanScore: z.number().nullish(),
  decisionsPerRun: z.number().min(0).nullish(),
  latencyP50Ms: z.number().min(0).nullish(),
  latencyP95Ms: z.number().min(0).nullish(),
  /** Crashes after a late decision: the hazard was reached before the answer arrived. */
  lateCrashes: z.number().int().min(0).nullish(),
  /** Only when a price is configured: providers report tokens, not money. */
  costPerRunUsd: z.number().min(0).nullish(),
  /** Tokens per run, as the provider reported them. */
  inputTokens: z.number().min(0).nullish(),
  outputTokens: z.number().min(0).nullish(),
});
export type Contestant = z.infer<typeof ContestantSchema>;

const FileSchema = z.object({
  date: z.string().min(1),
  runs: z.number().int().min(0),
  promptHash: z.string().nullish(),
  contestants: z.array(z.unknown()),
  /** Brains that are set up but were not run, with the reason. */
  notRun: z.array(z.unknown()).nullish(),
});

const NotRunSchema = z.object({ id: z.string().min(1), label: z.string().min(1), reason: z.string().min(1) });
export type NotRun = z.infer<typeof NotRunSchema>;

export interface Arena {
  readonly date: string;
  readonly runs: number;
  readonly promptHash: string | null;
  readonly contestants: readonly Contestant[];
  readonly notRun: readonly NotRun[];
}

/** The results file as the page uses it, or null when there is none to use. A malformed contestant is skipped. */
export function parseArena(raw: unknown): Arena | null {
  const file = FileSchema.safeParse(raw);
  if (!file.success) return null;
  const contestants = file.data.contestants.flatMap((entry) => {
    const parsed = ContestantSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  const notRun = (file.data.notRun ?? []).flatMap((entry) => {
    const parsed = NotRunSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  return { date: file.data.date, runs: file.data.runs, promptHash: file.data.promptHash ?? null, contestants, notRun };
}

export interface ArenaRow {
  readonly id: string;
  readonly label: string;
  readonly kind: ContestantKind;
  readonly configured: boolean;
  /** Model id and run count, or why there are no figures: "not configured", "not run: …". */
  readonly detail: string;
  readonly finish: string;
  readonly score: string;
  readonly decisions: string;
  readonly p50: string;
  readonly p95: string;
  readonly lateCrashes: string;
  readonly cost: string;
}

const MISSING = '—';
const shown = (value: number | null | undefined, format: (value: number) => string): string => (value === null || value === undefined ? MISSING : format(value));
/** Under a second in milliseconds, from a second up in seconds: both are read at a glance. */
const latency = (ms: number): string => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);
/** Cents per run are fractions of a cent: keep the digits that matter. */
const dollars = (usd: number): string => (usd === 0 ? '$0' : `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`);

/** 35732 → "35.7k". */
const thousands = (count: number): string => (count < 1000 ? `${Math.round(count)}` : `${(count / 1000).toFixed(1)}k`);

const NO_FIGURES = { finish: MISSING, score: MISSING, decisions: MISSING, p50: MISSING, p95: MISSING, lateCrashes: MISSING, cost: MISSING } as const;

/** One table row per contestant, every figure as text; then the brains that were not run, with the reason. */
export function arenaRows(arena: Arena): readonly ArenaRow[] {
  const measured = arena.contestants.map((entry): ArenaRow => {
    if (entry.status !== 'ok') return { id: entry.id, label: entry.label, kind: entry.kind, configured: false, detail: 'not configured', ...NO_FIGURES };
    const runs = entry.runs ?? null;
    // A model id that only repeats the name adds nothing.
    const model = entry.modelId && entry.modelId.toLowerCase() !== entry.label.toLowerCase() ? entry.modelId : null;
    const tokens = typeof entry.inputTokens === 'number' && typeof entry.outputTokens === 'number' ? entry.inputTokens + entry.outputTokens : null;
    return {
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      configured: true,
      detail: [model, runs === null ? null : `${runs} ${runs === 1 ? 'run' : 'runs'}`].filter(Boolean).join(' · '),
      finish: shown(entry.finishPct, (value) => `${Math.round(value)}%`),
      score: shown(entry.meanScore, (value) => `${Math.round(value)}`),
      decisions: shown(entry.decisionsPerRun, (value) => value.toFixed(1)),
      p50: shown(entry.latencyP50Ms, latency),
      p95: shown(entry.latencyP95Ms, latency),
      lateCrashes: shown(entry.lateCrashes, (value) => `${value}`),
      // No price configured: the tokens the provider reported stand in, labelled as tokens, never turned into money.
      cost: typeof entry.costPerRunUsd === 'number' ? dollars(entry.costPerRunUsd) : tokens === null ? MISSING : `${thousands(tokens)} tok`,
    };
  });
  const held = arena.notRun.filter((entry) => !arena.contestants.some((contestant) => contestant.id === entry.id)).map((entry): ArenaRow => ({ id: entry.id, label: entry.label, kind: 'llm', configured: false, detail: `not run: ${entry.reason}`, ...NO_FIGURES }));
  return [...measured, ...held];
}

export interface PlotBox {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

export interface ScatterPoint {
  readonly id: string;
  readonly label: string;
  readonly kind: ContestantKind;
  readonly x: number;
  readonly y: number;
}

export interface Scatter {
  readonly points: readonly ScatterPoint[];
  /** The right end of the latency axis and the top of the score axis, rounded up to a tidy figure. */
  readonly xMaxMs: number;
  readonly yMax: number;
}

/** The next tidy figure at or above a value: 1, 2 or 5 times a power of ten. */
function tidyCeiling(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * power).find((candidate) => candidate >= value) ?? 10 * power;
}

/** Median latency against mean score, one point per brain that has both. Null with fewer than two: one dot compares nothing. */
export function scatter(arena: Arena, box: PlotBox): Scatter | null {
  const measured = arena.contestants.flatMap((entry) =>
    entry.status === 'ok' && typeof entry.latencyP50Ms === 'number' && typeof entry.meanScore === 'number' ? [{ entry, ms: entry.latencyP50Ms, score: entry.meanScore }] : [],
  );
  if (measured.length < 2) return null;
  const xMaxMs = tidyCeiling(Math.max(...measured.map((point) => point.ms)));
  const yMax = tidyCeiling(Math.max(...measured.map((point) => point.score)));
  const [plotW, plotH] = [box.width - 2 * box.padding, box.height - 2 * box.padding];
  return {
    xMaxMs,
    yMax,
    points: measured.map(({ entry, ms, score }) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      x: box.padding + (ms / xMaxMs) * plotW,
      // Scores below zero sit on the axis: the plot is about who is higher, not how far under.
      y: box.padding + (1 - Math.max(0, score) / yMax) * plotH,
    })),
  };
}

/** The caveat that goes with every arena figure. */
export const arenaLine = (arena: Arena): string => `Our sim, our prompts, ${arena.runs} ${arena.runs === 1 ? 'run' : 'runs'}, ${arena.date}. Not a general model ranking.`;
