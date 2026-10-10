// Brain Arena, Lab track: the same contestants answering Lab Mission questions (grid decisions).
// Heuristic and random come from the lab package itself; this file adapts Jev and the LLMs.
import { askJevChoice } from '../index';
import { buildLabJevRequest, buildLabTextPrompt, parseLabAnswer, type LabQuestionLike, type LabQuestionMode } from '../lab/question';
import { ARENA_TIMEOUT_MS, type Contestant } from './providers';

export interface LabArenaDecision {
  /** The id of one of the question's options. */
  readonly choice: string;
  readonly probabilities?: Record<string, number>;
  /** Real time the answer took, ms. */
  readonly latencyMs: number;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
}

/**
 * How a contestant answers a Lab question, or null for the local policies (the lab package supplies those).
 * Same rules as the rail arena: one call per trigger, no fallback, a 10 s deadline, a throw = no decision.
 */
export function labDecider(contestant: Contestant, mode: LabQuestionMode = 'verdict'): ((question: LabQuestionLike) => Promise<LabArenaDecision>) | null {
  if (contestant.kind === 'jev') {
    return async (question) => {
      const request = buildLabJevRequest(question, undefined, mode);
      const answer = await askJevChoice(request, Object.keys(request.questions.action.criteria), { timeoutMs: ARENA_TIMEOUT_MS });
      return { choice: answer.choice, probabilities: answer.probabilities as Record<string, number>, latencyMs: answer.latencyMs };
    };
  }
  const send = contestant.send;
  if (contestant.kind !== 'llm' || !send) return null;
  return async (question) => {
    const prompt = buildLabTextPrompt(question, mode);
    const started = performance.now();
    const reply = await send(prompt.system, prompt.user);
    const latencyMs = Math.round(performance.now() - started);
    const answer = parseLabAnswer(reply.text, prompt.optionIds);
    return { choice: answer.choice, probabilities: { [answer.choice]: answer.confidence }, latencyMs, usage: reply.usage };
  };
}
