// Brain Arena contestants. Every one answers the same BrainQuestion; LLMs get it as text (prompt.ts).
// Keys come from the environment only (apps/web/.env.local via --env-file) and are never logged or returned.
import type { Action, BrainQuestion, Probabilities } from '@rivetrun/contracts';
import { heuristicDecide, randomBrain } from '@rivetrun/sim';
import { createJevBrain, JEV_MODEL_ID } from '../index';
import { ARENA_SYSTEM, buildArenaPrompt, parseArenaAnswer } from './prompt';

/** A contestant that does not answer in this time has made no decision (docs/BRAIN_ARENA.md). */
export const ARENA_TIMEOUT_MS = 10_000;

export interface ArenaDecision {
  readonly choice: Action;
  /** Probability per option where the provider gives one (Jev, heuristic); otherwise the stated confidence on the choice. */
  readonly probabilities: Probabilities;
  /** Real time the answer took, ms. */
  readonly latencyMs: number;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
}

export type ContestantKind = 'jev' | 'heuristic' | 'random' | 'llm';

export interface Contestant {
  /** Exact model id for LLMs and Jev; 'heuristic' / 'random' otherwise. */
  readonly id: string;
  readonly label: string;
  readonly kind: ContestantKind;
  readonly tier: Tier;
  /** 'not_configured' = no key. 'unavailable' = the account cannot use the model, or no mode was accepted. */
  readonly status: 'ok' | 'not_configured' | 'unavailable';
  /** Why it is not 'ok'. Never contains a key. */
  readonly reason?: string;
  /** The exact mode parameters this contestant is called with (recorded in the results). */
  readonly params?: Record<string, unknown>;
  /** USD per million tokens and the official page it comes from. */
  readonly price?: { readonly in: number; readonly out: number };
  readonly priceSource?: string;
  /** LLMs only: one raw call (system + user text in, answer text and token counts out), for other question kinds. */
  readonly send?: Send;
  /** A fresh decide function per run (the random policy is seeded per run). Throws on error or timeout. */
  readonly forRun: (seed: number) => (question: BrainQuestion) => Promise<ArenaDecision>;
}

const notConfigured = (id: string, label: string): Contestant => ({
  id,
  label,
  kind: 'llm',
  tier: 'fast',
  status: 'not_configured',
  reason: 'no API key',
  forRun: () => () => Promise.reject(new Error('not configured')),
});

/** fetch with the arena deadline: aborts the request and always settles. */
async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`no answer within ${ARENA_TIMEOUT_MS} ms`));
    }, ARENA_TIMEOUT_MS);
  });
  const call = (async () => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const text = await response.text();
    // The status and the provider's message, never the request (which holds no key anyway) or its headers.
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text) as unknown;
  })();
  call.catch(() => undefined);
  try {
    return await Promise.race([call, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});
const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** One call, measured. The LLM's answer is a choice and a confidence; nothing else is read from it. */
async function askLlm(question: BrainQuestion, send: (system: string, user: string) => Promise<{ text: string; usage?: ArenaDecision['usage'] }>): Promise<ArenaDecision> {
  const prompt = buildArenaPrompt(question);
  const started = performance.now();
  const reply = await send(prompt.system, prompt.user);
  const latencyMs = Math.round(performance.now() - started);
  const answer = parseArenaAnswer(reply.text, prompt.options);
  return { choice: answer.choice, probabilities: { [answer.choice]: answer.confidence }, latencyMs, usage: reply.usage };
}

/** Official price pages the per-token prices below were read from on 2026-10-10. */
export const PRICE_SOURCES = {
  anthropic: 'https://claude.com/pricing',
  openai: 'https://developers.openai.com/api/docs/models',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
} as const;

type Provider = keyof typeof PRICE_SOURCES;
export type Tier = 'fast' | 'mid' | 'reasoning' | 'baseline';

interface LlmSpec {
  readonly id: string;
  readonly label: string;
  readonly tier: Tier;
  readonly provider: Provider;
  /**
   * Mode parameters to try, in order; the first one the API accepts is used and recorded in the results.
   * Each is the lowest reasoning setting the model's own page (or its own error message) allows for the
   * fast and mid tiers, and the model's default reasoning for the "(reasoning)" tier.
   */
  readonly modes: readonly Record<string, unknown>[];
  /** Room for the answer (and, for reasoning entries, the reasoning tokens before it). */
  readonly maxTokens: number;
  /** USD per million tokens, from the provider's official page. DeepSeek: peak-hour rate, cache miss (the upper bound). */
  readonly price: { readonly in: number; readonly out: number };
}

/** The lineup of docs/BRAIN_ARENA.md. No id outside this table is ever called. */
export const LLM_LINEUP: readonly LlmSpec[] = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', tier: 'fast', provider: 'anthropic', modes: [{ thinking: { type: 'disabled' } }], maxTokens: 64, price: { in: 0.1, out: 0.5 } },
  { id: 'gpt-5-nano', label: 'GPT-5 nano', tier: 'fast', provider: 'openai', modes: [{ reasoning_effort: 'minimal' }, { reasoning_effort: 'low' }], maxTokens: 512, price: { in: 0.05, out: 0.4 } },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', tier: 'fast', provider: 'openai', modes: [{ reasoning_effort: 'none' }], maxTokens: 128, price: { in: 0.1, out: 0.5 } },
  { id: 'deepseek-flash', label: 'DeepSeek Flash', tier: 'fast', provider: 'deepseek', modes: [{ thinking: { type: 'disabled' } }], maxTokens: 64, price: { in: 0.3, out: 1.2 } },
  // Sonnet 5.5: "between_tools" is its thinking-off setting (the API's own wording); it does not think before responding.
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'mid', provider: 'anthropic', modes: [{ thinking: { type: 'between_tools' } }], maxTokens: 64, price: { in: 2, out: 10 } },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', tier: 'mid', provider: 'openai', modes: [{ reasoning_effort: 'none' }], maxTokens: 128, price: { in: 0.2, out: 1.2 } },
  // Reasoning tier: each model's own default reasoning, labelled as such.
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (reasoning)', tier: 'reasoning', provider: 'anthropic', modes: [{ thinking: { type: 'adaptive' } }], maxTokens: 4096, price: { in: 4, out: 20 } },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (reasoning)', tier: 'reasoning', provider: 'openai', modes: [{}], maxTokens: 4096, price: { in: 2, out: 10 } },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (reasoning)', tier: 'reasoning', provider: 'deepseek', modes: [{ thinking: { type: 'enabled' } }], maxTokens: 4096, price: { in: 1.32, out: 3.96 } },
];

const KEY_ENV: Readonly<Record<Provider, string>> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const BASE_URL: Readonly<Record<Provider, string>> = { anthropic: 'https://api.anthropic.com/v1', openai: 'https://api.openai.com/v1', deepseek: 'https://api.deepseek.com' };

const authHeaders = (provider: Provider, apiKey: string): Record<string, string> =>
  provider === 'anthropic' ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${apiKey}` };

export type Send = (system: string, user: string) => Promise<{ text: string; usage?: ArenaDecision['usage'] }>;

/** One request in the provider's own format. Only the text of the answer and the token counts are read back. */
function sender(spec: LlmSpec, apiKey: string, mode: Record<string, unknown>): Send {
  const headers = authHeaders(spec.provider, apiKey);
  if (spec.provider === 'anthropic') {
    // No temperature: the Claude 5.5 models reject the parameter ("`temperature` is deprecated for this model").
    return async (system, user) => {
      const record = asRecord(await postJson(`${BASE_URL.anthropic}/messages`, headers, { model: spec.id, max_tokens: spec.maxTokens, system, messages: [{ role: 'user', content: user }], ...mode }));
      const blocks = Array.isArray(record.content) ? record.content : [];
      // Only text blocks are read. A thinking block is never parsed, stored or shown.
      const text = blocks.map((block) => (asRecord(block).type === 'text' ? String(asRecord(block).text ?? '') : '')).join('');
      const usage = asRecord(record.usage);
      return { text, usage: { inputTokens: asNumber(usage.input_tokens), outputTokens: asNumber(usage.output_tokens) } };
    };
  }
  // OpenAI-compatible chat completions (OpenAI, DeepSeek). Reasoning text, where a provider returns it, is ignored.
  const limit = spec.provider === 'openai' ? { max_completion_tokens: spec.maxTokens } : { max_tokens: spec.maxTokens };
  return async (system, user) => {
    const record = asRecord(
      await postJson(`${BASE_URL[spec.provider]}/chat/completions`, headers, {
        model: spec.id,
        ...limit,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...mode,
      }),
    );
    const first = asRecord(Array.isArray(record.choices) ? record.choices[0] : undefined);
    const usage = asRecord(record.usage);
    return { text: String(asRecord(first.message).content ?? ''), usage: { inputTokens: asNumber(usage.prompt_tokens), outputTokens: asNumber(usage.completion_tokens) } };
  };
}

/** Ids the account behind each key can use, from the provider's models endpoint. null = the listing failed. */
async function usableIds(provider: Provider, apiKey: string): Promise<Set<string> | null> {
  try {
    const url = provider === 'anthropic' ? `${BASE_URL.anthropic}/models?limit=1000` : `${BASE_URL[provider]}/models`;
    const response = await fetch(url, { headers: authHeaders(provider, apiKey), signal: AbortSignal.timeout(ARENA_TIMEOUT_MS) });
    if (!response.ok) return null;
    const data = asRecord(await response.json()).data;
    return new Set((Array.isArray(data) ? data : []).map((model) => String(asRecord(model).id)));
  } catch {
    return null;
  }
}

/** A tiny question every mode is tried on before a row starts. */
const PROBE = { system: ARENA_SYSTEM, user: 'QUESTION: Reply with the JSON object for the option "cruise".\nOPTIONS:\n- cruise: keep going.\n- brake: stop.\nReply with JSON only: {"choice": one of [cruise, brake], "confidence": 0..1}' };

/**
 * Checks the id against the models endpoint, then finds the first mode the API accepts, with temperature 0
 * when the model takes it. Returns the contestant with the exact parameters it will be called with.
 */
async function configureLlm(spec: LlmSpec, listings: Map<Provider, Set<string> | null>): Promise<Contestant> {
  const base = { id: spec.id, label: spec.label, kind: 'llm' as const, tier: spec.tier, price: spec.price, priceSource: PRICE_SOURCES[spec.provider] };
  const apiKey = process.env[KEY_ENV[spec.provider]];
  const dead = (status: Contestant['status'], reason: string): Contestant => ({ ...base, status, reason, forRun: () => () => Promise.reject(new Error(reason)) });
  if (!apiKey) return dead('not_configured', `no ${KEY_ENV[spec.provider]} in apps/web/.env.local`);
  if (!listings.has(spec.provider)) listings.set(spec.provider, await usableIds(spec.provider, apiKey));
  const ids = listings.get(spec.provider);
  if (!ids) return dead('unavailable', 'the models endpoint did not answer for this key');
  if (!ids.has(spec.id)) return dead('unavailable', 'this account cannot use the model (not in the models endpoint)');

  let lastError = 'no mode accepted';
  for (const mode of spec.modes) {
    // Temperature 0 where supported: tried first, dropped if the API refuses it.
    const variants = spec.provider === 'anthropic' ? [mode] : [{ ...mode, temperature: 0 }, mode];
    for (const params of variants) {
      try {
        const send = sender(spec, apiKey, params);
        parseArenaAnswer((await send(PROBE.system, PROBE.user)).text, ['cruise', 'brake']);
        return { ...base, status: 'ok', send, params: { ...params, [spec.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens']: spec.maxTokens }, forRun: () => (question) => askLlm(question, send) };
      } catch (error) {
        lastError = error instanceof Error ? error.message.slice(0, 160) : 'error';
      }
    }
  }
  return dead('unavailable', `no accepted mode: ${lastError}`);
}

/** Jev under arena rules: the 10 s deadline instead of the game's 1200 ms, and no heuristic behind it. */
export function jevContestant(): Contestant {
  if (!process.env.JEV_API_KEY) return { ...notConfigured(JEV_MODEL_ID, 'Jev'), kind: 'jev', tier: 'fast' };
  const brain = createJevBrain({ timeoutMs: ARENA_TIMEOUT_MS });
  return {
    id: JEV_MODEL_ID,
    label: 'Jev',
    kind: 'jev',
    tier: 'fast',
    status: 'ok',
    params: { api: 'TypeSafe systemone', question: 'choice' },
    forRun: () => async (question) => {
      const decision = await brain.decide(question);
      return { choice: decision.selected, probabilities: decision.probabilities, latencyMs: decision.latencyMs };
    },
  };
}

export const heuristicContestant = (): Contestant => ({
  id: 'heuristic',
  label: 'Heuristic',
  kind: 'heuristic',
  tier: 'baseline',
  status: 'ok',
  forRun: () => async (question) => {
    const decision = heuristicDecide(question);
    return { choice: decision.selected, probabilities: decision.probabilities, latencyMs: 0 };
  },
});

export const randomContestant = (): Contestant => ({
  id: 'random',
  label: 'Random',
  kind: 'random',
  tier: 'baseline',
  status: 'ok',
  forRun: (seed) => {
    const brain = randomBrain(seed);
    return async (question) => {
      const decision = await brain.decide(question);
      return { choice: decision.selected, probabilities: decision.probabilities, latencyMs: 0 };
    };
  },
});

/**
 * Every contestant of the lineup. LLMs named in `wanted` (or all, when it is undefined) are verified against
 * their provider's models endpoint and probed for an accepted mode; the others are not called at all.
 */
export async function resolveContestants(wanted: (spec: { id: string; tier: Tier }) => boolean): Promise<Contestant[]> {
  const listings = new Map<Provider, Set<string> | null>();
  const llms: Contestant[] = [];
  for (const spec of LLM_LINEUP) if (wanted(spec)) llms.push(await configureLlm(spec, listings));
  const locals = [jevContestant(), heuristicContestant(), randomContestant()].filter((contestant) => wanted({ id: contestant.id, tier: contestant.tier }) || wanted({ id: contestant.kind, tier: contestant.tier }));
  return [...locals, ...llms];
}

/**
 * A "not run" reason fit for a public page: the kind of failure, never the provider's raw error body
 * (which can describe the account).
 */
export function publicReason(reason: string | undefined): string {
  if (!reason) return 'unavailable';
  if (/credit balance/i.test(reason)) return 'the provider refused the request: the account has no credit left (HTTP 400)';
  const http = /HTTP \d+/.exec(reason)?.[0];
  if (http) return `the provider refused the request (${http})`;
  return reason.split(':')[0]!.slice(0, 80);
}
