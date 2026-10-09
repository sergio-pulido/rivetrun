// Browser Brain: asks the server (Jev) and falls back to the heuristic. Never imports @rivetrun/brain.
import {
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

export interface ClientBrainOptions {
  readonly timeoutMs?: number;
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

const askServer = async (question: BrainQuestion, timeoutMs: number): Promise<BrainDecision> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(DECIDE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(question),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`/api/decide responded ${response.status}`);
    const decision = BrainDecisionSchema.parse(await response.json());
    if (!question.options.includes(decision.selected)) throw new Error('decision is not an available action');
    return decision;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`no decision within ${timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

/** Jev via POST /api/decide; on error or timeout the heuristic decides with `fallback: true`. */
export function createClientBrain(options: ClientBrainOptions = {}): Brain {
  const timeoutMs = options.timeoutMs ?? DECIDE_TIMEOUT_MS;
  return {
    decide: async (question) => {
      const started = performance.now();
      try {
        const decision = await askServer(question, timeoutMs);
        // Round trip as the player experienced it (includes the network hop to our server).
        return { ...decision, latencyMs: Math.round(performance.now() - started) };
      } catch (error) {
        options.onFallback?.(error instanceof Error ? error.message : String(error));
        return fallbackDecision(question, started);
      }
    },
  };
}

export const clientBrain: Brain = createClientBrain();
