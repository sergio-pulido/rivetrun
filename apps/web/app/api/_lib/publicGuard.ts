// RR-GUARD: limits for traffic that comes in through the public URL (the tunnel behind the QR), so a room full of
// phones, or one curious visitor with a script, cannot spend the provider budgets. The presenter's own machine
// (localhost: the laptop and the projector) is not limited here; it stays under ARENA_LIVE_CAP_USD.
// Everything is counted in memory and starts again with the server. No key or request body is ever logged here.

/** Why a public request may not make a live AI call right now. The phone shows `label`, never an error screen. */
export type GuardReason = 'off' | 'ai_budget' | 'jev_budget' | 'client_runs';

export const GUARD_LABEL: Readonly<Record<GuardReason, string>> = {
  off: 'heuristic: live AI for visitors is switched off',
  ai_budget: 'heuristic: the AI budget for visitors is used up',
  jev_budget: 'heuristic: the AI budget for visitors is used up',
  client_runs: 'heuristic: this phone has used its live AI runs for now',
};
/** What a phone shows when an earlier recorded run is served instead of a new one. */
export const CACHED_RUN_LABEL = 'cached run';

interface GuardState {
  /** The kill switch: false = no public request makes a live AI call. */
  on: boolean;
  /** US$ spent on OpenAI and DeepSeek calls made for public requests. */
  aiSpentUsd: number;
  /** Jev calls made for public requests. */
  jevCalls: number;
  /** Start times (epoch ms) of the live AI runs of each client in the current window. */
  readonly runs: Map<string, number[]>;
  /** Clients whose current run was refused at its start: its later decisions are refused too, until a new start is allowed. */
  readonly blocked: Map<string, GuardReason>;
  /** Public requests turned away from a live call, by reason. */
  readonly refused: Record<GuardReason, number>;
}
const holder = globalThis as typeof globalThis & { __rivetrunPublicGuard?: GuardState };
const state: GuardState = (holder.__rivetrunPublicGuard ??= { on: true, aiSpentUsd: 0, jevCalls: 0, runs: new Map(), blocked: new Map(), refused: { off: 0, ai_budget: 0, jev_budget: 0, client_runs: 0 } });

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
export const publicAiCapUsd = (): number => num(process.env.PUBLIC_AI_CAP_USD, 3);
export const publicJevCallsCap = (): number => num(process.env.PUBLIC_JEV_CALLS_CAP, 1500);
export const publicRunsPerClient = (): number => num(process.env.PUBLIC_LIVE_RUNS_PER_CLIENT, 3);
export const RUN_WINDOW_MS = 10 * 60_000;
const MAX_CLIENTS = 5000;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Public = the request did not come to localhost. The Host header names what the browser asked for: the tunnel's
 * hostname or the laptop's LAN address for a phone, localhost for the presenter. A request relayed by Cloudflare
 * also carries its own headers, which count as public whatever the Host says.
 */
export function isPublicRequest(request: Request): boolean {
  if (request.headers.has('cf-connecting-ip') || request.headers.has('cf-ray')) return true;
  const host = (request.headers.get('host') ?? new URL(request.url).host).trim().toLowerCase();
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]!;
  return !LOCAL_HOSTS.has(name);
}

/** Who is asking: Cloudflare's client address, else the first forwarded address, else one shared bucket. */
export function clientOf(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (request.headers.get('cf-connecting-ip') ?? forwarded ?? request.headers.get('x-real-ip') ?? 'unknown').slice(0, 64);
}

export type Provider = 'jev' | 'llm';

/** Whether the budgets still allow a public call to this kind of provider; a refusal is counted. */
export function publicBudget(provider: Provider): GuardReason | null {
  const reason: GuardReason | null = !state.on ? 'off' : provider === 'jev' ? (state.jevCalls >= publicJevCallsCap() ? 'jev_budget' : null) : state.aiSpentUsd >= publicAiCapUsd() ? 'ai_budget' : null;
  if (reason) state.refused[reason] += 1;
  return reason;
}

const recent = (client: string, now: number): number[] => (state.runs.get(client) ?? []).filter((at) => now - at < RUN_WINDOW_MS);

/**
 * A client starts a live AI run (the first decision of a run, or a ghost that has to be driven). Returns the reason
 * when it may not: the switch, the budget, or its own PUBLIC_LIVE_RUNS_PER_CLIENT in the last ten minutes.
 */
export function startPublicRun(client: string, provider: Provider, now: number = Date.now()): GuardReason | null {
  const budget = publicBudget(provider);
  if (budget) return budget;
  const mine = recent(client, now);
  if (mine.length >= publicRunsPerClient()) {
    state.refused.client_runs += 1;
    state.runs.set(client, mine);
    return 'client_runs';
  }
  if (!state.runs.has(client) && state.runs.size >= MAX_CLIENTS) state.runs.delete(state.runs.keys().next().value as string);
  state.runs.set(client, [...mine, now]);
  return null;
}

/**
 * One decision of a run played live (Jev mode, a picked agent, a Lab mission). The first decision of a run asks for
 * the run; the following ones belong to it. Presenter requests are never limited: null.
 */
export function guardDecision(request: Request, provider: Provider, isStart: boolean, now: number = Date.now()): GuardReason | null {
  if (!isPublicRequest(request)) return null;
  const client = clientOf(request);
  if (isStart) {
    const reason = startPublicRun(client, provider, now);
    if (reason) state.blocked.set(client, reason);
    else state.blocked.delete(client);
    return reason;
  }
  const blocked = state.blocked.get(client);
  if (blocked) {
    state.refused[blocked] += 1;
    return blocked;
  }
  return publicBudget(provider);
}

/** The answer to a refused decision: HTTP 429 with the label a phone shows. The client then drives on the fixed rules. */
export const guardRefusal = (reason: GuardReason): Response =>
  Response.json({ error: GUARD_LABEL[reason], code: 'rate_limited' }, { status: 429, headers: { 'x-rivetrun-guard': reason, 'Cache-Control': 'no-store' } });

/** True while this client has a run it was allowed to start in the window: its later decisions belong to that run. */
export const hasPublicRun = (client: string, now: number = Date.now()): boolean => recent(client, now).length > 0;

/** One Jev call was made for a public request. */
export const countPublicJev = (calls = 1): void => {
  state.jevCalls += calls;
};
/** A paid model call was made for a public request. */
export const countPublicAi = (usd: number): void => {
  state.aiSpentUsd += Math.max(0, usd);
};

export const setPublicAi = (on: boolean): void => {
  state.on = on;
};

export interface PublicGuardStatus {
  readonly on: boolean;
  readonly ai: { readonly spentUsd: number; readonly capUsd: number; readonly leftUsd: number };
  readonly jev: { readonly calls: number; readonly cap: number; readonly left: number };
  readonly runsPerClient: number;
  readonly windowMinutes: number;
  readonly clientsSeen: number;
  readonly refused: Readonly<Record<GuardReason, number>>;
}

export const publicGuardStatus = (): PublicGuardStatus => ({
  on: state.on,
  ai: { spentUsd: Number(state.aiSpentUsd.toFixed(4)), capUsd: publicAiCapUsd(), leftUsd: Number(Math.max(0, publicAiCapUsd() - state.aiSpentUsd).toFixed(4)) },
  jev: { calls: state.jevCalls, cap: publicJevCallsCap(), left: Math.max(0, publicJevCallsCap() - state.jevCalls) },
  runsPerClient: publicRunsPerClient(),
  windowMinutes: RUN_WINDOW_MS / 60_000,
  clientsSeen: state.runs.size,
  refused: { ...state.refused },
});

/** Tests only: back to a fresh server. */
export function resetPublicGuard(): void {
  state.on = true;
  state.aiSpentUsd = 0;
  state.jevCalls = 0;
  state.runs.clear();
  state.blocked.clear();
  for (const key of Object.keys(state.refused) as GuardReason[]) state.refused[key] = 0;
}
