// /lab "How it was built": the measured tokens (docs/tokens.json) and the facts about who and what built the game
// (docs/how-built.json). Pure parsers: a block that is missing or malformed is left out, never filled in, and what
// the files call "not measured" stays "not measured".
import { z } from 'zod';

const count = z.number().finite().nonnegative();
const text = z.string().trim().min(1);

/** One part of a file: null when it is absent or not in the expected shape, so the rest of the file still shows. */
const part = <T>(schema: z.ZodType<T>, raw: unknown): T | null => {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};
/** A list from a file, keeping the entries that are well formed. */
const list = <T>(schema: z.ZodType<T>, raw: unknown): readonly T[] => (Array.isArray(raw) ? raw.flatMap((entry: unknown) => part(schema, entry) ?? []) : []);
const field = (raw: unknown, key: string): unknown => (typeof raw === 'object' && raw !== null ? (raw as Readonly<Record<string, unknown>>)[key] : undefined);

const SplitSchema = z.object({ inputTokens: count, outputTokens: count, cacheWriteTokens: count, cacheReadTokens: count, totalTokens: count });
const SessionTokensSchema = SplitSchema.extend({ name: text, models: z.array(text).default([]) });
const TotalSchema = z.object({ measuredTokens: count, claudeCodeTokens: count.nullish(), arenaApiTokens: count.nullish(), note: text.nullish() });
const ArenaRowSchema = z.object({ track: text, contestant: text, modelId: text.nullish(), runs: count, totalTokens: count, costUsd: count.nullish() });
const ArenaTotalSchema = z.object({ totalTokens: count, costUsd: count.nullish(), factsColumnCostUsd: count.nullish() });
const JevSchema = z.object({ method: text.nullish(), benchmarkCalls: count.nullish(), arenaCallsTotal: count.nullish(), notMeasured: text.nullish() });
const NotMeasuredSchema = z.object({ what: text, why: text });

export type TokenSplit = z.infer<typeof SplitSchema>;
export type SessionTokens = z.infer<typeof SessionTokensSchema>;
export type ArenaTokenRow = z.infer<typeof ArenaRowSchema>;

export interface TokenReport {
  /** The headline: every measured token, and the file's note on what that figure is made of. */
  readonly total: z.infer<typeof TotalSchema> | null;
  readonly sessions: readonly SessionTokens[];
  /** How the Claude Code figures were counted, and their sum. */
  readonly claudeCode: { readonly method: string | null; readonly total: TokenSplit | null } | null;
  readonly arena: { readonly method: string | null; readonly rows: readonly ArenaTokenRow[]; readonly total: z.infer<typeof ArenaTotalSchema> | null; readonly notMeasured: string | null } | null;
  /** Jev is counted in calls: its tokens are not measured. */
  readonly jev: z.infer<typeof JevSchema> | null;
  readonly notMeasured: readonly z.infer<typeof NotMeasuredSchema>[];
  readonly generatedAt: string | null;
}

const optionalText = (raw: unknown): string | null => part(text, raw);

/** docs/tokens.json as scripts/tokens.py writes it. Null when the file has neither a measured total nor a session row. */
export function parseTokenReport(raw: unknown): TokenReport | null {
  const total = part(TotalSchema, field(raw, 'total'));
  const sessions = list(SessionTokensSchema, field(raw, 'sessions'));
  if (!total && sessions.length === 0) return null;
  const [claudeCode, arena] = [field(raw, 'claudeCode'), field(raw, 'arena')];
  return {
    total,
    sessions,
    claudeCode: claudeCode === undefined ? null : { method: optionalText(field(claudeCode, 'method')), total: part(SplitSchema, field(claudeCode, 'total')) },
    arena:
      arena === undefined
        ? null
        : { method: optionalText(field(arena, 'method')), rows: list(ArenaRowSchema, field(arena, 'rows')), total: part(ArenaTotalSchema, field(arena, 'total')), notMeasured: optionalText(field(arena, 'notMeasured')) },
    jev: part(JevSchema, field(raw, 'jev')),
    notMeasured: list(NotMeasuredSchema, field(raw, 'notMeasured')),
    generatedAt: optionalText(field(raw, 'generatedAt')),
  };
}

const BuilderSchema = z.object({ name: text, kind: text.nullish(), model: text, tools: z.array(text).default([]), did: text });
const OtherAgentSchema = z.object({ name: text, model: text, tools: z.array(text).default([]), did: text, tokens: text.nullish() });
const RuntimeModelSchema = z.object({ name: text, model: text, use: text });
const ToolSchema = z.object({ name: text, use: text });

export type Builder = z.infer<typeof BuilderSchema>;
export type OtherAgent = z.infer<typeof OtherAgentSchema>;

export interface HowBuilt {
  /** The Claude Code sessions, each with the model its own transcript recorded. */
  readonly sessions: readonly Builder[];
  /** Agents outside Claude Code: the asset agent, the orchestration chat, Claude Design. */
  readonly otherAgents: readonly OtherAgent[];
  /** Models the game runs or was measured against, not ones that built it. */
  readonly runtimeModels: readonly z.infer<typeof RuntimeModelSchema>[];
  readonly tools: readonly z.infer<typeof ToolSchema>[];
  readonly agentsDid: readonly string[];
  readonly humanDid: readonly string[];
}

/** docs/how-built.json. Null when nothing in it can be read. */
export function parseHowBuilt(raw: unknown): HowBuilt | null {
  const built: HowBuilt = {
    sessions: list(BuilderSchema, field(raw, 'sessions')),
    otherAgents: list(OtherAgentSchema, field(raw, 'otherAgents')),
    runtimeModels: list(RuntimeModelSchema, field(raw, 'runtimeModels')),
    tools: list(ToolSchema, field(raw, 'tools')),
    agentsDid: list(text, field(raw, 'agentsDid')),
    humanDid: list(text, field(raw, 'humanDid')),
  };
  return Object.values(built).every((block: readonly unknown[]) => block.length === 0) ? null : built;
}

/** Every digit, grouped: these are measured counts, shown as counted. */
export const exact = (value: number): string => Math.round(value).toLocaleString('en-US');

/** 347264200 → "347.3 M"; 9090 → "9,090". For table cells, where the exact figure sits in the headline or the title. */
export const short = (value: number): string => (value >= 1_000_000_000 ? `${(value / 1_000_000_000).toFixed(2)} B` : value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} M` : exact(value));

/** A cost the file records, in the dollars it records it in. */
export const usd = (value: number): string => `US$ ${value < 1 ? value.toFixed(3).replace(/0$/, '') : value.toFixed(2)}`;

/** What to print where a file has no figure. */
export const NOT_MEASURED = 'not measured';
