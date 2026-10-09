import type { Action, Brain, BrainDecision, BrainQuestion, Probabilities } from '@rivetrun/contracts';
import { mulberry32 } from './rng';

const TEMPERATURE = 0.6;
const STALL_PROGRESS_M = 0.15;
const STALL_PENALTY = 4;
const BASE_LOOKAHEAD_S = 1.5;

/** Lookahead utility of one option for the player's priority (0 = speed, 1 = safety). */
export function utility(question: BrainQuestion, action: Action): number {
  const entry = question.lookahead.find((l) => l.action === action);
  if (!entry) return -Infinity;
  const p = question.priority;
  // Standing still never finishes the course: without this the robot parks in front of every obstacle.
  const stall = entry.progressM < STALL_PROGRESS_M ? STALL_PENALTY * (2 - p) : 0;
  // Progress is compared per standard window, so a longer lookahead (scout drone) is not just more reward.
  // Damage is only partly discounted: a hazard seen 8 s out still counts, unavoidable trickle damage does not stall the robot.
  const window = BASE_LOOKAHEAD_S / (question.lookaheadS ?? BASE_LOOKAHEAD_S);
  return -stall + entry.progressM * window * (1 - 0.5 * p) - entry.damagePct * Math.sqrt(window) * (0.4 + 2 * p) - entry.energyPct * window * (0.05 + 0.15 * p);
}

function softmax(options: readonly Action[], utilities: readonly number[]): Probabilities {
  const finite = utilities.map((u) => (Number.isFinite(u) ? u : -1e6));
  const max = Math.max(...finite);
  const weights = finite.map((u) => Math.exp((u - max) / TEMPERATURE));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const probabilities: Probabilities = {};
  options.forEach((action, i) => {
    probabilities[action] = Math.round((weights[i]! / total) * 1000) / 1000;
  });
  return probabilities;
}

export function heuristicDecide(question: BrainQuestion): BrainDecision {
  const utilities = question.options.map((action) => utility(question, action));
  let best = 0;
  utilities.forEach((u, i) => {
    if (u > utilities[best]!) best = i;
  });
  return {
    probabilities: softmax(question.options, utilities),
    selected: question.options[best]!,
    policy: 'heuristic',
    fallback: false,
    latencyMs: 0,
  };
}

/** Deterministic policy: best lookahead utility for the player's priority. Also Jev's fallback. */
export const heuristicBrain: Brain = {
  decide: async (question) => heuristicDecide(question),
};

/** Seeded uniform choice over the available actions. One instance per run. */
export function randomBrain(seed: number): Brain {
  const random = mulberry32(seed);
  return {
    decide: async (question) => {
      const share = Math.round((1 / question.options.length) * 1000) / 1000;
      const probabilities: Probabilities = {};
      for (const action of question.options) probabilities[action] = share;
      const selected = question.options[Math.floor(random() * question.options.length)]!;
      return { probabilities, selected, policy: 'random', fallback: false, latencyMs: 0 };
    },
  };
}
