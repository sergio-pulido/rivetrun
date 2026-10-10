// Who sits in the brain's seat on /scenarios: Jev, asked live through the server, with the lab's fixed rules
// (its heuristic) deciding when Jev does not answer in time. Same arrangement as the rail game's clientBrain.
import { LAB_RIVAL_LATENCY_MS, LabDecisionSchema, labHeuristicDecide, type LabBrain, type LabDecision, type LabQuestion } from '@rivetrun/lab';

export const LAB_DECIDE_URL = '/api/lab/decide';
/** The server marks an answer it took from its cache of identical questions with this header (miss | joined | hit). */
const CACHE_HEADER = 'x-rivetrun-cache';
/** Jev's budget per decision, as on the rail: beyond it the fixed rules decide and the thread says FALLBACK. */
export const LAB_DECIDE_TIMEOUT_MS = 1200;

export const JEV_LIVE_NOTE = 'Jev answers live; when it is slow the fixed rules decide.';
export const STAND_IN_NOTE = `Jev is not reachable from this page right now: its seat is filled by the lab's fixed rules, answering in ${LAB_RIVAL_LATENCY_MS} ms. They read the same question Jev would get.`;

export interface JevLabOptions {
  readonly timeoutMs?: number;
  /** For tests. */
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

async function askJev(question: LabQuestion, timeoutMs: number, fetchImpl: typeof fetch): Promise<LabDecision> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LAB_DECIDE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(question), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${LAB_DECIDE_URL} responded ${response.status}`);
    const decision = LabDecisionSchema.parse(await response.json());
    if (!question.options.some((option) => option.id === decision.choice)) throw new Error(`"${decision.choice}" is not one of the options`);
    // A cache hit comes back in no time: the thread says "cached" rather than pass that off as Jev's speed.
    return response.headers.get(CACHE_HEADER) === 'hit' ? { ...decision, cached: true } : decision;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Jev through the server. An error, a late answer, a body that is not a decision or a choice that was not on offer
 * all end the same way: the fixed rules decide, marked `fallback`, with the time that was waited.
 */
export function jevLabBrain(options: JevLabOptions = {}): LabBrain {
  const timeoutMs = options.timeoutMs ?? LAB_DECIDE_TIMEOUT_MS;
  const now = options.now ?? (() => performance.now());
  return {
    decide: async (question) => {
      const started = now();
      try {
        const decision = await askJev(question, timeoutMs, options.fetchImpl ?? fetch);
        return { ...decision, policy: decision.policy ?? 'jev' };
      } catch {
        // Whatever went wrong, the robot still needs a decision: the thread shows it as a fallback.
        return { ...labHeuristicDecide(question), policy: 'heuristic', fallback: true, latencyMs: Math.round(now() - started) };
      }
    },
  };
}

/**
 * True when the server has a Lab decide route and Jev's key is set (`GET` answers `{ ok, model, configured }`).
 * Otherwise every question would fall back, and the page says the fixed rules are in the seat instead of "live".
 */
export async function jevIsLive(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(LAB_DECIDE_URL, { method: 'GET' });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && (body as { configured?: unknown }).configured === true;
  } catch {
    return false;
  }
}

/** The fixed rules, answering after `latencyMs` of real time: the seat's occupant while there is no route to Jev. */
export function standInBrain(latencyMs: number = LAB_RIVAL_LATENCY_MS): LabBrain {
  return {
    decide: (question) =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ ...labHeuristicDecide(question), latencyMs }), latencyMs);
      }),
  };
}
