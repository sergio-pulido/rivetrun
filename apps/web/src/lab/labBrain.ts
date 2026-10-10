// Who sits in the brain's seat on /scenarios: Jev, asked live through the server, with the lab's fixed rules
// (its heuristic) deciding when Jev does not answer in time. Same arrangement as the rail game's clientBrain.
import { LAB_RIVAL_LATENCY_MS, LabDecisionSchema, labHeuristicDecide, type LabBrain, type LabDecision, type LabQuestion } from '@rivetrun/lab';

export const LAB_DECIDE_URL = '/api/lab/decide';
/** The server marks an answer it took from its cache of identical questions with this header (miss | joined | hit). */
const CACHE_HEADER = 'x-rivetrun-cache';
/** Jev's budget per decision, as on the rail: beyond it the fixed rules decide and the thread says FALLBACK. */
export const LAB_DECIDE_TIMEOUT_MS = 1200;

export const JEV_LIVE_NOTE = 'Jev answers live; when it is slow or does not answer, the fixed rules decide.';
/** How long the page waits to learn whether Jev is reachable before it seats the fixed rules. */
const PROBE_TIMEOUT_MS = 2500;
/**
 * What Jev is asked (QA finding Q20): the question built in packages/brain/src/lab/question.ts adds, to each option,
 * where the lab's fixed rules place it ("it is the correct job to start", "exploring is not correct now").
 */
export const JEV_VERDICT_NOTE = "The question Jev gets states which option the lab's fixed rules rate as correct; its percentages show how closely it follows that, not a judgement of its own.";
export const STAND_IN_NOTE = `Jev is not reachable from this page right now: its seat is filled by the lab's fixed rules, answering in ${LAB_RIVAL_LATENCY_MS} ms. They read the same question Jev would get.`;

/** The same seat with the verdicts left out of the question: Jev gets the facts and the options, nothing on which is correct. */
export const JEV_FACTS_NOTE = 'Jev answers live from the facts alone: this question does not say which option the fixed rules rate as correct. When it is slow or does not answer, the fixed rules decide.';

export interface JevLabOptions {
  /** Ask the facts-only question: the options and their predictions, without the fixed rules' verdict on each. */
  readonly factsOnly?: boolean;
  readonly timeoutMs?: number;
  /** For tests. */
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

/**
 * The promise's own outcome, or a rejection after `ms`. The abort signal asks the request to stop; this makes sure
 * the caller moves on even if the request does not listen (a stalled connection, a body that never ends).
 */
function within<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, what: string): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { controller.abort(); reject(new Error(`${what}: no answer within ${ms} ms`)); }, ms);
    work(controller.signal).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

function askJev(question: LabQuestion, timeoutMs: number, fetchImpl: typeof fetch, factsOnly: boolean): Promise<LabDecision> {
  return within(async (signal) => {
    const response = await fetchImpl(factsOnly ? `${LAB_DECIDE_URL}?verdicts=0` : LAB_DECIDE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(question), signal,
    });
    if (!response.ok) throw new Error(`${LAB_DECIDE_URL} responded ${response.status}`);
    const decision = LabDecisionSchema.parse(await response.json());
    if (!question.options.some((option) => option.id === decision.choice)) throw new Error(`"${decision.choice}" is not one of the options`);
    // A cache hit comes back in no time: the thread says "cached" rather than pass that off as Jev's speed.
    return response.headers.get(CACHE_HEADER) === 'hit' ? { ...decision, cached: true } : decision;
  }, timeoutMs, LAB_DECIDE_URL);
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
        const decision = await askJev(question, timeoutMs, options.fetchImpl ?? fetch, options.factsOnly === true);
        return { ...decision, policy: decision.policy ?? 'jev' };
      } catch {
        // Whatever went wrong, the robot still needs a decision: the thread shows it as a fallback.
        return { ...labHeuristicDecide(question), policy: 'heuristic', fallback: true, latencyMs: Math.round(now() - started) };
      }
    },
  };
}

export interface JevSeat {
  /** The server has a Lab decide route and Jev's key is set. Otherwise every question would fall back. */
  readonly live: boolean;
  /** The route also offers the facts-only question (it lists more than one wording). */
  readonly factsOnly: boolean;
}

const NO_JEV: JevSeat = { live: false, factsOnly: false };

/**
 * What the server's Lab decide route offers (`GET` answers `{ ok, model, configured, questions? }`). Without a
 * configured route the page says the fixed rules are in the seat instead of "live".
 */
export async function jevSeat(fetchImpl: typeof fetch = fetch, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<JevSeat> {
  try {
    return await within(async (signal) => {
      const response = await fetchImpl(LAB_DECIDE_URL, { method: 'GET', signal });
      if (!response.ok) return NO_JEV;
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null || (body as { configured?: unknown }).configured !== true) return NO_JEV;
      const questions = (body as { questions?: unknown }).questions;
      return { live: true, factsOnly: Array.isArray(questions) && questions.length > 1 };
    }, timeoutMs, LAB_DECIDE_URL);
  } catch {
    // No route, no network, or no answer in time: the fixed rules take the seat and the page says so.
    return NO_JEV;
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
