// Brain Arena contestants. Every one answers the same BrainQuestion; LLMs get it as text (prompt.ts).
// Keys come from the environment only (apps/web/.env.local via --env-file) and are never logged or returned.
import type { Action, BrainQuestion, Probabilities } from '@rivetrun/contracts';
import { heuristicDecide, randomBrain } from '@rivetrun/sim';
import { createJevBrain, JEV_MODEL_ID } from '../index';
import { buildArenaPrompt, parseArenaAnswer } from './prompt';

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
  /** 'not_configured' = no key (or no model id from the human): it is skipped, never guessed. */
  readonly status: 'ok' | 'not_configured';
  /** A fresh decide function per run (the random policy is seeded per run). Throws on error or timeout. */
  readonly forRun: (seed: number) => (question: BrainQuestion) => Promise<ArenaDecision>;
}

const notConfigured = (id: string, label: string): Contestant => ({
  id,
  label,
  kind: 'llm',
  status: 'not_configured',
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

/**
 * How each Claude model is asked to answer without extended reasoning (arena rule), as the API itself
 * requires it per model (each setting below is the one the API accepted or named in its own error message):
 * - Haiku 5.5: thinking can be switched off.
 * - Sonnet 5.5: "between_tools" is its off setting; it does not think before responding.
 * - Opus 5.5: thinking cannot be switched off, only steered (adaptive, lowest effort). Its row is therefore
 *   labelled "(reasoning)" and needs room for the thinking tokens before the answer.
 */
const ANTHROPIC_MODELS: Readonly<Record<string, { label: string; maxTokens: number; extra: Record<string, unknown> }>> = {
  'claude-haiku-5-5': { label: 'Claude Haiku 5.5', maxTokens: 64, extra: { thinking: { type: 'disabled' } } },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5', maxTokens: 64, extra: { thinking: { type: 'between_tools' } } },
  'claude-opus-5-5': { label: 'Claude Opus 5.5 (reasoning)', maxTokens: 2048, extra: { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } },
};

/**
 * Anthropic Messages API. No tools, a short answer, extended reasoning off wherever the model allows it.
 * No temperature is sent: these models reject the parameter ("`temperature` is deprecated for this model"),
 * so the arena's "temperature 0 where supported" does not apply to them and they run on their default sampling.
 */
export function anthropicContestant(model: string): Contestant {
  const settings = ANTHROPIC_MODELS[model];
  if (!settings) throw new Error(`no arena settings for Anthropic model ${model}`);
  const { label } = settings;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return notConfigured(model, label);
  const send = async (system: string, user: string) => {
    const raw = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: settings.maxTokens, system, messages: [{ role: 'user', content: user }], ...settings.extra },
    );
    const record = asRecord(raw);
    const blocks = Array.isArray(record.content) ? record.content : [];
    // Only text blocks are read. A thinking block is never parsed, stored or shown.
    const text = blocks.map((block) => (asRecord(block).type === 'text' ? String(asRecord(block).text ?? '') : '')).join('');
    const usage = asRecord(record.usage);
    return { text, usage: { inputTokens: asNumber(usage.input_tokens), outputTokens: asNumber(usage.output_tokens) } };
  };
  return { id: model, label, kind: 'llm', status: 'ok', forRun: () => (question) => askLlm(question, send) };
}

/** OpenAI-compatible chat completions (OpenAI, DeepSeek). Only built for model ids the human supplied. */
export function openAiCompatibleContestant(model: string, label: string, baseUrl: string, apiKey: string | undefined): Contestant {
  if (!apiKey) return notConfigured(model, label);
  const send = async (system: string, user: string) => {
    const raw = await postJson(`${baseUrl}/chat/completions`, { Authorization: `Bearer ${apiKey}` }, {
      model,
      temperature: 0,
      max_tokens: 64,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const record = asRecord(raw);
    const first = asRecord(Array.isArray(record.choices) ? record.choices[0] : undefined);
    const usage = asRecord(record.usage);
    return {
      text: String(asRecord(first.message).content ?? ''),
      usage: { inputTokens: asNumber(usage.prompt_tokens), outputTokens: asNumber(usage.completion_tokens) },
    };
  };
  return { id: model, label, kind: 'llm', status: 'ok', forRun: () => (question) => askLlm(question, send) };
}

/** Jev under arena rules: the 10 s deadline instead of the game's 1200 ms, and no heuristic behind it. */
export function jevContestant(): Contestant {
  if (!process.env.JEV_API_KEY) return { ...notConfigured(JEV_MODEL_ID, 'Jev'), kind: 'jev' };
  const brain = createJevBrain({ timeoutMs: ARENA_TIMEOUT_MS });
  return {
    id: JEV_MODEL_ID,
    label: 'Jev',
    kind: 'jev',
    status: 'ok',
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
  status: 'ok',
  forRun: (seed) => {
    const brain = randomBrain(seed);
    return async (question) => {
      const decision = await brain.decide(question);
      return { choice: decision.selected, probabilities: decision.probabilities, latencyMs: 0 };
    };
  },
});

/** Model ids the human listed in an env var ("id1,id2"). No list, no contestants: ids are never guessed. */
const listed = (name: string): string[] => (process.env[name] ?? '').split(',').map((id) => id.trim()).filter(Boolean);

/** Every contestant the arena knows, configured or not. Anthropic ids are the ones in docs/BRAIN_ARENA.md. */
export function allContestants(): Contestant[] {
  return [
    jevContestant(),
    heuristicContestant(),
    randomContestant(),
    anthropicContestant('claude-haiku-5-5'),
    anthropicContestant('claude-sonnet-5-5'),
    anthropicContestant('claude-opus-5-5'),
    ...listed('ARENA_OPENAI_MODELS').map((id) => openAiCompatibleContestant(id, id, 'https://api.openai.com/v1', process.env.OPENAI_API_KEY)),
    ...listed('ARENA_DEEPSEEK_MODELS').map((id) => openAiCompatibleContestant(id, id, 'https://api.deepseek.com/v1', process.env.DEEPSEEK_API_KEY)),
  ];
}
