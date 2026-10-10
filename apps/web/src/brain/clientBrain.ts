// Browser Brain: asks the server (Jev) and falls back to the heuristic. Never imports @rivetrun/brain.
import {
  BRIEFING_MAX_CHARS,
  BrainDecisionSchema,
  type Action,
  type Brain,
  type BrainDecision,
  type BrainQuestion,
  type Probabilities,
} from '@rivetrun/contracts';
import { heuristicBrain } from '@rivetrun/sim';

export const DECIDE_TIMEOUT_MS = 1200;
const DECIDE_URL = '/api/decide';
/** After this many answers in a row that came too late, Jev is not asked for a while: waiting 1.2 s for every
 * decision makes the robot react late to everything, which costs more than driving on the fixed rules. */
const SLOW_STREAK = 2;
const SLOW_PAUSE_MS = 8000;

class DecideTimeout extends Error {}

export interface ClientBrainOptions {
  readonly timeoutMs?: number;
  /** Where to ask (default /api/decide: Jev). The live Arena asks /api/arena/decide?model=… */
  readonly url?: string;
  /** "Brief the brain": the player's instructions, sent to Jev with every question. The heuristic ignores it. */
  readonly briefing?: string;
  /**
   * True while the robot is in the air (SimState.airborne). No traction and no throttle there, so nothing is
   * asked of Jev: the brain answers at once with "hold" and makes no network call.
   */
  readonly isAirborne?: () => boolean;
  /** Called when Jev could not decide and the heuristic took over. */
  readonly onFallback?: (reason: string) => void;
}

// Last resort while the sim's heuristicBrain is unavailable: best lookahead utility for the priority.
const localHeuristic = (question: BrainQuestion): { probabilities: Probabilities; selected: Action } => {
  const byAction = new Map(question.lookahead.map((entry) => [entry.action, entry]));
  const utility = (action: Action): number => {
    const entry = byAction.get(action);
    if (!entry) return 0;
    const safety = question.priority;
    return entry.progressM * (1 - 0.5 * safety) - entry.damagePct * (0.2 + 2 * safety) - entry.energyPct * 0.2;
  };
  const selected = question.options.reduce((best, action) => (utility(action) > utility(best) ? action : best));
  const probabilities: Probabilities = Object.fromEntries(
    question.options.map((action) => [action, action === selected ? 1 : 0]),
  );
  return { probabilities, selected };
};

const fallbackDecision = async (question: BrainQuestion, started: number): Promise<BrainDecision> => {
  const picked = await heuristicBrain.decide(question).catch(() => localHeuristic(question));
  return {
    probabilities: picked.probabilities,
    selected: picked.selected,
    policy: 'heuristic',
    fallback: true,
    latencyMs: Math.round(performance.now() - started),
  };
};

const askServer = async (question: BrainQuestion, timeoutMs: number, url: string): Promise<BrainDecision> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(question),
      signal: controller.signal,
    });
    if (!response.ok) {
      // 429 = a visitor limit (RR-GUARD): the server's own words say why the fixed rules are driving.
      const said = response.status === 429 ? ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error : undefined;
      throw new Error(typeof said === 'string' && said ? said : `the brain's server responded ${response.status}`);
    }
    const decision = BrainDecisionSchema.parse(await response.json());
    if (!question.options.includes(decision.selected)) throw new Error('decision is not an available action');
    return decision;
  } catch (error) {
    if (controller.signal.aborted) throw new DecideTimeout(`no decision within ${timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

/** The answer while airborne: keep doing nothing new. Labelled heuristic because Jev was not asked. */
const holdInAir = (question: BrainQuestion): BrainDecision => {
  const selected: Action = question.options.includes('cruise') ? 'cruise' : question.options[0]!;
  const probabilities: Probabilities = Object.fromEntries(question.options.map((action) => [action, action === selected ? 1 : 0]));
  return { probabilities, selected, policy: 'heuristic', fallback: false, latencyMs: 0 };
};

/** Jev via POST /api/decide; on error or timeout the heuristic decides with `fallback: true`. */
export function createClientBrain(options: ClientBrainOptions = {}): Brain {
  const timeoutMs = options.timeoutMs ?? DECIDE_TIMEOUT_MS;
  const briefing = options.briefing?.trim().slice(0, BRIEFING_MAX_CHARS);
  let slowInARow = 0;
  let pausedUntil = 0;
  return {
    decide: async (asked) => {
      if (options.isAirborne?.()) return holdInAir(asked);
      const question: BrainQuestion = briefing ? { ...asked, briefing } : asked;
      const started = performance.now();
      if (started < pausedUntil) {
        options.onFallback?.('Jev is answering too slowly: the fixed rules decide for a few seconds');
        return fallbackDecision(question, started);
      }
      try {
        const decision = await askServer(question, timeoutMs, options.url ?? DECIDE_URL);
        slowInARow = 0;
        // Round trip as the player experienced it (includes the network hop to our server).
        return { ...decision, latencyMs: Math.round(performance.now() - started) };
      } catch (error) {
        slowInARow = error instanceof DecideTimeout ? slowInARow + 1 : 0;
        if (slowInARow >= SLOW_STREAK) {
          slowInARow = 0;
          pausedUntil = performance.now() + SLOW_PAUSE_MS;
        }
        options.onFallback?.(error instanceof Error ? error.message : String(error));
        return fallbackDecision(question, started);
      }
    },
  };
}

export const clientBrain: Brain = createClientBrain();
