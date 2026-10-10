// Reference Lab drivers. The heuristic reads the question and nothing else: the same information Jev gets.
import type { LabBrain, LabDecision, LabOption, LabPrediction, LabQuestion } from './schema';
import { mulberry32 } from './rng';

/** Charge the heuristic will not plan to go below. */
const RESERVE_PCT = 5;
const TEMPERATURE = 8;

const affordable = (predicted: LabPrediction | undefined): boolean =>
  predicted === undefined || ((predicted.batteryAfterPct ?? 100) > RESERVE_PCT && (predicted.marginAfterPct ?? 100) > RESERVE_PCT);

/** How good an option looks to the heuristic. Higher is better. */
export function labUtility(option: LabOption, question: LabQuestion): number {
  const steps = option.predicted?.steps ?? 0;
  const ok = affordable(option.predicted);
  const staying = option.current ? 3 : 0;
  switch (option.kind) {
    case 'interact':
      return 100;
    case 'return': {
      if (option.completes) return 90 - steps * 0.1;
      // Ending early is for when nothing else can be afforded.
      const more = question.options.some((other) => (other.kind === 'objective' || other.kind === 'explore') && affordable(other.predicted));
      return more ? -40 : 30;
    }
    case 'objective':
      return ok ? 60 - steps * 0.5 + staying : -20;
    case 'explore':
      return ok ? 40 - (steps + (option.towardTiles ?? 0)) * 0.5 - (option.visited ? 2 : 0) + staying : -30;
    case 'wait':
      return question.trigger.cause === 'mover_ahead' ? 35 : 5;
    case 'pace':
      if (option.pace === 'eco' && question.trigger.cause === 'energy_low') return 95;
      // Blind and just hit something: slow down first, then choose a way.
      if (option.pace === 'eco' && question.trigger.cause === 'bumped' && question.observation.blind) return 95;
      return option.pace === 'full' && question.trigger.cause === 'energy_ok' ? 70 : -10;
  }
}

/** Softmax of the utilities; the choice is the best option (the first on a tie). */
function choose(question: LabQuestion, utilities: readonly number[], policy: LabDecision['policy']): LabDecision {
  const best = Math.max(...utilities);
  const weights = utilities.map((u) => Math.exp((u - best) / TEMPERATURE));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const probabilities = Object.fromEntries(question.options.map((option, i) => [option.id, Math.round((weights[i]! / total) * 1000) / 1000]));
  return { choice: question.options[utilities.indexOf(best)]!.id, probabilities, latencyMs: 0, ...(policy ? { policy } : {}) };
}

export function labHeuristicDecide(question: LabQuestion): LabDecision {
  return choose(question, question.options.map((option) => labUtility(option, question)), 'heuristic');
}

export const labHeuristicBrain: LabBrain = { decide: async (question) => labHeuristicDecide(question) };

/** Picks any option on offer, seeded. The floor a brain has to beat. */
export function labRandomBrain(seed: number): LabBrain {
  const random = mulberry32(seed);
  return {
    decide: async (question) => {
      const pick = Math.floor(random() * question.options.length);
      return choose(question, question.options.map((_, i) => (i === pick ? 0 : -1000)), 'random');
    },
  };
}
