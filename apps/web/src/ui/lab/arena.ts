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
  /** The gameplay version this row was run on, when it differs from the file's (a row carried over from an earlier run). */
  gameplayVersion: z.number().nullish(),
  /** Lab Missions: results per scenario. */
  byScenario: z.record(z.string(), z.object({ runs: z.number().min(0), completed: z.number().min(0), meanScore: z.number(), meanCompletionPct: z.number().min(0).max(100).nullish() })).nullish(),
  /** The same runs with a question that states the facts but no verdict; present only where that was run. */
  facts: z.object({ meanScore: z.number().nullish(), finishPct: z.number().min(0).max(100).nullish(), runs: z.number().min(0).nullish() }).nullish(),
  /** The seeds this brain ran on. */
  seeds: z.array(z.number()).nullish(),
  /** Tokens per run, as the provider reported them. */
  inputTokens: z.number().min(0).nullish(),
  outputTokens: z.number().min(0).nullish(),
});
export type Contestant = z.infer<typeof ContestantSchema>;

const SectionSchema = z.object({
  date: z.string().min(1),
  runs: z.number().int().min(0),
  promptHash: z.string().nullish(),
  /** Lab Missions: the scenarios that were run. */
  scenarios: z.array(z.string()).nullish(),
  gameplayVersion: z.number().nullish(),
  /** Things the reader must know to read the table, in the runner's words. */
  notes: z.array(z.string()).nullish(),
  /** Where the prices behind costPerRunUsd come from, per provider. Present = the costs are computed from published prices. */
  priceSources: z.record(z.string(), z.string()).nullish(),
  contestants: z.array(z.unknown()),
  /** Brains that are set up but were not run, with the reason. */
  notRun: z.array(z.unknown()).nullish(),
});

const NotRunSchema = z.object({ id: z.string().min(1), label: z.string().min(1), reason: z.string().min(1) });
export type NotRun = z.infer<typeof NotRunSchema>;

/** One set of arena results: the rail missions, or the Lab Missions track. */
export interface ArenaSection {
  readonly date: string;
  readonly runs: number;
  readonly promptHash: string | null;
  readonly scenarios: readonly string[];
  readonly gameplayVersion: number | null;
  readonly notes: readonly string[];
  /** Costs are computed from the providers' published prices and the tokens they reported. */
  readonly priced: boolean;
  readonly contestants: readonly Contestant[];
  readonly notRun: readonly NotRun[];
}

export interface Arena extends ArenaSection {
  /** The same brains on Lab Missions (a grid simulation); null until that track has run. */
  readonly lab: ArenaSection | null;
}

/** One section of the file; null when it is not there or not readable. A malformed contestant is skipped. */
function parseSection(raw: unknown): ArenaSection | null {
  const file = SectionSchema.safeParse(raw);
  if (!file.success) return null;
  const contestants = file.data.contestants.flatMap((entry) => {
    const parsed = ContestantSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  const notRun = (file.data.notRun ?? []).flatMap((entry) => {
    const parsed = NotRunSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    date: file.data.date,
    runs: file.data.runs,
    promptHash: file.data.promptHash ?? null,
    scenarios: file.data.scenarios ?? [],
    gameplayVersion: file.data.gameplayVersion ?? null,
    notes: file.data.notes ?? [],
    priced: Object.keys(file.data.priceSources ?? {}).length > 0,
    contestants,
    notRun,
  };
}

/** The results file as the page uses it, or null when there is none to use. Its `lab` key holds the Lab Missions track. */
export function parseArena(raw: unknown): Arena | null {
  const rail = parseSection(raw);
  if (!rail) return null;
  const lab = parseSection((raw as { readonly lab?: unknown }).lab);
  // The lab track is priced the same way as the rail one unless it says otherwise.
  return { ...rail, lab: lab ? { ...lab, priced: lab.priced || rail.priced } : null };
}

export interface ArenaRow {
  readonly id: string;
  readonly label: string;
  readonly kind: ContestantKind;
  readonly configured: boolean;
  /** Model id and run count, or why there are no figures: "not configured", "not run: …". */
  readonly detail: string;
  /** Set when this brain ran fewer runs than the largest row: its figures rest on less, e.g. "7 runs · 1 seed". */
  readonly fewer: string | null;
  /** Set when the row was run on another gameplay version than the rest of the table, e.g. "gameplay 3". */
  readonly carried: string | null;
  readonly finish: string;
  /** Mean score when the question tells the brain which option the fixed rules rate as correct. */
  readonly score: string;
  /** Mean score with the facts only: a figure, "same" for drivers that do not read the question, "not run" otherwise. */
  readonly factsScore: string;
  /** The facts-only score moved against the verdict score: 'down' means the brain did worse without the verdict. */
  readonly factsMove: 'up' | 'down' | null;
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

const NO_FIGURES = { factsScore: MISSING, factsMove: null, finish: MISSING, score: MISSING, decisions: MISSING, p50: MISSING, p95: MISSING, lateCrashes: MISSING, cost: MISSING } as const;

/**
 * A "not run" reason fit to show: the runner sometimes records the provider's raw error (a status code and a JSON body).
 * The status is kept; the body, which can describe the account, is not put on a public page.
 */
export function cleanReason(reason: string): string {
  const status = /HTTP\s+(\d{3})/i.exec(reason);
  if (status) return `the provider refused the request (HTTP ${status[1]})`;
  return reason.includes('{') ? reason.slice(0, reason.indexOf('{')).replace(/[:\s]+$/, '') || 'the provider returned an error' : reason;
}

export interface ScenarioTable {
  readonly scenarios: readonly string[];
  readonly rows: readonly { readonly id: string; readonly label: string; readonly kind: ContestantKind; readonly cells: readonly { readonly score: string; readonly done: string; readonly failed: boolean }[] }[];
}

/** Lab Missions: each brain's mean score per scenario with how many of its runs completed. Null when the section has no such figures. */
export function scenarioTable(arena: ArenaSection): ScenarioTable | null {
  const rows = arena.contestants.flatMap((entry) => {
    const by = entry.byScenario;
    if (entry.status !== 'ok' || !by) return [];
    return [
      {
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        cells: arena.scenarios.map((scenario) => {
          const result = by[scenario];
          return result ? { score: `${Math.round(result.meanScore)}`, done: `${result.completed}/${result.runs}`, failed: result.completed === 0 } : { score: MISSING, done: '', failed: false };
        }),
      },
    ];
  });
  return rows.length > 0 && arena.scenarios.length > 0 ? { scenarios: arena.scenarios, rows } : null;
}

/** Whether any brain in this section was also run on the facts-only question: then the table has that column. */
export const hasFacts = (arena: ArenaSection): boolean => arena.contestants.some((entry) => typeof entry.facts?.meanScore === 'number');

/** How many runs the largest row has: rows with fewer are marked. */
export const mostRuns = (arena: ArenaSection): number => Math.max(0, ...arena.contestants.map((entry) => (entry.status === 'ok' ? (entry.runs ?? 0) : 0)));

/** One table row per contestant, every figure as text; then the brains that were not run, with the reason. */
export function arenaRows(arena: ArenaSection): readonly ArenaRow[] {
  const mostRuns = Math.max(0, ...arena.contestants.map((entry) => (entry.status === 'ok' ? (entry.runs ?? 0) : 0)));
  const measured = arena.contestants.map((entry): ArenaRow => {
    if (entry.status !== 'ok') return { id: entry.id, label: entry.label, kind: entry.kind, configured: false, detail: 'not configured', fewer: null, carried: null, ...NO_FIGURES };
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
      carried: typeof entry.gameplayVersion === 'number' && arena.gameplayVersion !== null && entry.gameplayVersion !== arena.gameplayVersion ? `gameplay ${entry.gameplayVersion}` : null,
      fewer: runs !== null && runs < mostRuns ? [`${runs} ${runs === 1 ? 'run' : 'runs'}`, entry.seeds ? `${entry.seeds.length} ${entry.seeds.length === 1 ? 'seed' : 'seeds'}` : null].filter(Boolean).join(' · ') : null,
      finish: shown(entry.finishPct, (value) => `${Math.round(value)}%`),
      score: shown(entry.meanScore, (value) => `${Math.round(value)}`),
      // The fixed rules and the coin do not read the question, so it makes no difference to them.
      factsScore: typeof entry.facts?.meanScore === 'number' ? `${Math.round(entry.facts.meanScore)}` : entry.kind === 'heuristic' || entry.kind === 'random' ? 'same' : 'not run',
      factsMove:
        typeof entry.facts?.meanScore === 'number' && typeof entry.meanScore === 'number' && Math.round(entry.facts.meanScore) !== Math.round(entry.meanScore)
          ? entry.facts.meanScore > entry.meanScore ? 'up' : 'down'
          : null,
      decisions: shown(entry.decisionsPerRun, (value) => value.toFixed(1)),
      p50: shown(entry.latencyP50Ms, latency),
      p95: shown(entry.latencyP95Ms, latency),
      lateCrashes: shown(entry.lateCrashes, (value) => `${value}`),
      // No price configured: the tokens the provider reported stand in, labelled as tokens, never turned into money.
      cost: typeof entry.costPerRunUsd === 'number' ? dollars(entry.costPerRunUsd) : tokens === null ? MISSING : `${thousands(tokens)} tok`,
    };
  });
  const held = arena.notRun.filter((entry) => !arena.contestants.some((contestant) => contestant.id === entry.id)).map((entry): ArenaRow => ({ id: entry.id, label: entry.label, kind: 'llm', configured: false, detail: `not run: ${cleanReason(entry.reason)}`, fewer: null, carried: null, ...NO_FIGURES }));
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
  /** Its score is under the bottom of the score axis: drawn on the axis and named in the note below the plot. */
  readonly below: boolean;
  readonly score: number;
}

export interface Scatter {
  readonly points: readonly ScatterPoint[];
  /** The right end of the latency axis and the top of the score axis, rounded up to a tidy figure. */
  readonly xMaxMs: number;
  readonly yMax: number;
  /** The bottom of the score axis. Above zero when one brain scores far under the rest: the axis then starts just under the pack so the pack can be told apart. */
  readonly yMin: number;
  /** Marks along the latency axis: the axis is a square-root scale, so they are not evenly spaced. */
  readonly xTicks: readonly { readonly ms: number; readonly x: number }[];
}

/** Latencies worth a mark on the axis, in ms. */
const TICKS_MS = [0, 500, 1000, 2000, 5000, 10000] as const;

/** The next tidy figure at or above a value: 1, 2 or 5 times a power of ten. */
function tidyCeiling(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * power).find((candidate) => candidate >= value) ?? 10 * power;
}

/**
 * Where the score axis starts. Zero, unless the lowest brain sits apart from all the others by more than half the axis:
 * then the axis starts at a tidy figure just under the rest, and that brain is shown below it.
 */
function scoreFloor(scores: readonly number[], yMax: number): number {
  const sorted = [...scores].sort((a, b) => a - b);
  const [lowest, next] = sorted;
  if (sorted.length < 3 || lowest === undefined || next === undefined || next - lowest < yMax / 2) return 0;
  const step = tidyCeiling(yMax / 10);
  return Math.max(0, Math.floor((next - step / 2) / step) * step);
}

/** Median latency against mean score, one point per brain that has both. Null with fewer than two: one dot compares nothing. */
export function scatter(arena: ArenaSection, box: PlotBox): Scatter | null {
  const measured = arena.contestants.flatMap((entry) =>
    entry.status === 'ok' && typeof entry.latencyP50Ms === 'number' && typeof entry.meanScore === 'number' ? [{ entry, ms: entry.latencyP50Ms, score: entry.meanScore }] : [],
  );
  if (measured.length < 2) return null;
  const xMaxMs = tidyCeiling(Math.max(...measured.map((point) => point.ms)));
  const yMax = tidyCeiling(Math.max(...measured.map((point) => point.score)));
  const yMin = scoreFloor(measured.map((point) => point.score), yMax);
  const [plotW, plotH] = [box.width - 2 * box.padding, box.height - 2 * box.padding];
  // Square-root scale: instant brains (0 ms) stay on the axis, fast ones spread out, one slow one does not squash the rest.
  const xOf = (ms: number): number => box.padding + Math.sqrt(ms / xMaxMs) * plotW;
  return {
    xMaxMs,
    yMax,
    yMin,
    xTicks: TICKS_MS.filter((ms) => ms <= xMaxMs).map((ms) => ({ ms, x: xOf(ms) })),
    points: measured.map(({ entry, ms, score }) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      x: xOf(ms),
      // A score under the axis sits on it, flagged: the plot is about telling the pack apart.
      y: box.padding + (1 - Math.max(0, Math.min(1, (score - yMin) / (yMax - yMin)))) * plotH,
      below: score < yMin,
      score,
    })),
  };
}

/** The caveat that goes with every arena figure. */
export const arenaLine = (arena: ArenaSection): string => `Our sim, our prompts, ${arena.runs} ${arena.runs === 1 ? 'run' : 'runs'}, ${arena.date}. Not a general model ranking.`;
