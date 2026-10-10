// RR-PLAN (docs/PLAY_AND_PLAN.md): "Think slow before. Decide fast during."
// A reasoning model plans a build and a strategy from the mission BRIEF, before the run. It never sees the track
// beyond what the Brief shows a player, and it never drives: the plan reaches the driver as a briefing and a priority.
// Server-only: the provider keys are read here. Nothing of a model's thinking is read, stored or returned.
export const PLAN_DEFAULT_MODEL = 'claude-sonnet-5-5';
export const PLAN_FALLBACK_MODEL = 'gpt-6.1-sol';
/** The planner is given this long before the fallback provider is asked. */
export const PLAN_TIMEOUT_MS = 30_000;

/** Official prices, US$ per million tokens (the same sources as the arena: docs/ARENA.md). */
const PRICE: Readonly<Record<string, { in: number; out: number }>> = {
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 5, out: 25 },
  'gpt-6.1-sol': { in: 2, out: 10 },
};

export interface PlannerAnswer {
  /** The model's answer text: one JSON object, still unvalidated. */
  readonly text: string;
  readonly provider: 'anthropic' | 'openai';
  readonly model: string;
  readonly ms: number;
  /** From reported tokens and the official price; 0 when the provider reported no usage. */
  readonly costUsd: number;
  /** Set when the first provider failed and the fallback answered: why, in a few words (never an error body). */
  readonly fellBackBecause?: string;
}

export class PlannerError extends Error {}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});
const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // The kind of failure only: billing and auth errors describe the account and are not passed on.
    const kind = /credit balance|billing|quota/i.test(text) ? 'billing' : response.status === 401 || response.status === 403 ? 'auth' : `HTTP ${response.status}`;
    throw new PlannerError(kind);
  }
  return response.json();
}

const cost = (model: string, inputTokens: number, outputTokens: number): number => {
  const price = PRICE[model];
  return price ? (inputTokens * price.in + outputTokens * price.out) / 1e6 : 0;
};

/**
 * Claude with extended thinking. The 5.5 models take `thinking: { type: 'adaptive' }` (the arena's Opus row runs
 * on it); the older `enabled` + `budget_tokens` form is refused with HTTP 400. Only text blocks are read.
 */
async function askAnthropic(model: string, system: string, user: string): Promise<PlannerAnswer> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new PlannerError('no key');
  const started = performance.now();
  const record = asRecord(
    await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: 6000, thinking: { type: 'adaptive' }, system, messages: [{ role: 'user', content: user }] },
      PLAN_TIMEOUT_MS,
    ),
  );
  const blocks = Array.isArray(record.content) ? record.content : [];
  const text = blocks.map((block) => (asRecord(block).type === 'text' ? String(asRecord(block).text ?? '') : '')).join('');
  const usage = asRecord(record.usage);
  return { text, provider: 'anthropic', model, ms: Math.round(performance.now() - started), costUsd: cost(model, asNumber(usage.input_tokens), asNumber(usage.output_tokens)) };
}

/** GPT-6.1 Sol with its default reasoning, through chat completions. */
async function askOpenAi(model: string, system: string, user: string): Promise<PlannerAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new PlannerError('no key');
  const started = performance.now();
  const record = asRecord(
    await postJson(
      'https://api.openai.com/v1/chat/completions',
      { Authorization: `Bearer ${apiKey}` },
      { model, max_completion_tokens: 6000, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
      PLAN_TIMEOUT_MS,
    ),
  );
  const first = asRecord(Array.isArray(record.choices) ? record.choices[0] : undefined);
  const usage = asRecord(record.usage);
  return { text: String(asRecord(first.message).content ?? ''), provider: 'openai', model, ms: Math.round(performance.now() - started), costUsd: cost(model, asNumber(usage.prompt_tokens), asNumber(usage.completion_tokens)) };
}

const ask = (model: string, system: string, user: string): Promise<PlannerAnswer> => (model.startsWith('claude') ? askAnthropic(model, system, user) : askOpenAi(model, system, user));

/**
 * One planning call. The configured model first; when it fails for billing, auth, a server error, a missing key or
 * takes longer than PLAN_TIMEOUT_MS, the fallback model answers and the answer says so.
 */
export async function askPlanner(system: string, user: string, model: string = process.env.PLAN_MODEL ?? PLAN_DEFAULT_MODEL): Promise<PlannerAnswer> {
  try {
    return await ask(model, system, user);
  } catch (error) {
    if (model === PLAN_FALLBACK_MODEL) throw error;
    const why = error instanceof PlannerError ? error.message : error instanceof Error && error.name === 'TimeoutError' ? `no answer in ${PLAN_TIMEOUT_MS / 1000} s` : 'network error';
    const answer = await ask(PLAN_FALLBACK_MODEL, system, user);
    return { ...answer, fellBackBecause: `${model}: ${why}` };
  }
}

export const PLAN_SYSTEM =
  'You plan for a small robot that will race one mission in a simulation. You choose its parts and write short orders for its driver. ' +
  'You are given the mission brief a player sees, the parts catalog, four ready-made presets, how a run is scored and how fast the drivers answer. ' +
  'You do not see the track beyond the brief and you do not drive. ' +
  'Answer with one JSON object and nothing else, no code fence.';

export interface PlanPromptInput {
  /** The mission as the Brief shows it: name, length, weather, what each stretch demands, the scan zones. */
  readonly brief: unknown;
  /** Every part with its slot, cost, mass, power and effects. */
  readonly parts: unknown;
  readonly presets: unknown;
  readonly budgetEur?: number;
  /** Plan around this preset when the player has already picked a vehicle. */
  readonly presetId?: string;
  /** Sent on the retry: what was wrong with the previous answer. */
  readonly previousError?: string;
}

/** The planning question. The same text whichever model answers. */
export function buildPlanPrompt(input: PlanPromptInput): string {
  return [
    'MISSION BRIEF (all you know about the track):',
    JSON.stringify(input.brief),
    '',
    'PARTS CATALOG:',
    JSON.stringify(input.parts),
    '',
    'PRESETS (complete, valid builds):',
    JSON.stringify(input.presets),
    '',
    'RULES OF A BUILD: exactly one locomotion part, one motor, one battery; at most two sensors; at most two extras; use part ids from the catalog only.' + (input.budgetEur ? ` Total cost at most ${input.budgetEur} EUR.` : ''),
    'A scan zone can only be scanned with a sensor it accepts; a zone driven past costs 10 s. The driver only knows what the fitted sensors report.',
    'SCORING: a run that does not finish scores close to nothing. Among runs that finish: every second costs 4 points, every 1 % of damage 6 points, every 1 % of battery used 2 points, and the build\'s price divided by 5.',
    'DRIVERS: the driver is an AI that picks one driving command whenever something changes. It answers in about 0.25 s (Jev) to 1.2 s (a reasoning model); the robot keeps its last command while it waits. It reads your briefing (max 140 characters) and your priority with every question.',
    input.presetId ? `The player has picked the vehicle "${input.presetId}". It must stay that vehicle: keep its locomotion, its motor and its battery exactly. You may replace at most ONE of its sensors and at most ONE of its extras, and only when the brief shows the mission cannot be finished or scanned without the new part. Set presetId to "${input.presetId}".` : 'Pick the build you expect to score highest; presetId is the preset closest to it.',
    '',
    'Reply with JSON: {"build": {"locomotion": id, "motor": id, "battery": id, "sensors": [ids], "extras": [ids]}, "presetId": one of the preset ids, "priority": number from 0 (pure speed) to 1 (pure safety), "briefing": orders to the driver, at most 140 characters, "rationale": why this plan, at most 300 characters, "partsWhy": up to 4 of {"partId": id, "why": at most 80 characters}}',
    ...(input.previousError ? ['', `Your previous answer was not accepted: ${input.previousError}. Reply again with a corrected JSON object.`] : []),
  ].join('\n');
}

/** The JSON object in a model's reply, or null. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}
