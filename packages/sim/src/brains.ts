import type { Action, Brain, BrainDecision, BrainQuestion, Probabilities } from '@rivetrun/contracts';
import { mulberry32 } from './rng';

const TEMPERATURE = 0.6;
const STALL_PROGRESS_M = 0.15;
const STALL_PENALTY = 4;
const PARKED_SPEED_MPS = 0.1;
const PARKED_FACTOR = 4;
const BASE_LOOKAHEAD_S = 1.5;
// Approach planning: contact below this speed is free; above it, damage per m/s (an unknown obstacle on firm ground).
const SAFE_CONTACT_MPS = 0.6;
const CONTACT_DAMAGE_PER_MPS = 8;
const MIN_DECEL_MPS2 = 0.05;
const STOCK_RANGER_M = 3.2;

/**
 * Planning the approach to an obstacle the ranger sees beyond the lookahead window (ToF 4 m, lidar 12 m).
 * The window itself only shows a hit once it is inside it; on slippery ground that is too late to slow down.
 * This estimates, from the lookahead numbers alone, the damage an option would arrive with if the robot
 * braked as hard as the brake option shows it can from the end of the window.
 */
function approachDamagePct(question: BrainQuestion, action: Action): number {
  const distance = question.perceived.obstacleAheadM;
  // Only for what a long ranger adds: inside the stock ultrasonic's reach the window already covers the approach.
  if (typeof distance !== 'number' || distance <= STOCK_RANGER_M) return 0;
  const windowS = question.lookaheadS ?? BASE_LOOKAHEAD_S;
  const entry = question.lookahead.find((l) => l.action === action);
  const brake = question.lookahead.find((l) => l.action === 'brake');
  if (!entry || !brake) return 0;
  const remainingM = distance - entry.progressM;
  // Already inside the window: the lookahead has simulated the contact itself.
  if (remainingM <= 0) return 0;
  const speed = Math.max(0, question.status.speedMps);
  const endSpeed = Math.max(0, (2 * entry.progressM) / windowS - speed);
  // Deceleration the ground allows, read off the brake option: v·T − ½·a·T² = progress.
  const decel = Math.max(MIN_DECEL_MPS2, (2 * (speed * windowS - brake.progressM)) / (windowS * windowS));
  const arrival = Math.sqrt(Math.max(0, endSpeed * endSpeed - 2 * decel * remainingM));
  return Math.max(0, arrival - SAFE_CONTACT_MPS) * CONTACT_DAMAGE_PER_MPS;
}

/** Lookahead utility of one option for the player's priority (0 = speed, 1 = safety). */
export function utility(question: BrainQuestion, action: Action): number {
  const entry = question.lookahead.find((l) => l.action === action);
  if (!entry) return -Infinity;
  const p = question.priority;
  // Standing still never finishes the course: without this the robot parks in front of every obstacle.
  // Already standing still: staying put is the one option that can never finish, so it costs more than a risk.
  const parked = Math.abs(question.status.speedMps) < PARKED_SPEED_MPS ? PARKED_FACTOR : 1;
  const stall = entry.progressM < STALL_PROGRESS_M ? STALL_PENALTY * (2 - p) * parked : 0;
  // Progress is compared per standard window, so a longer lookahead (scout drone) is not just more reward.
  // Damage is only partly discounted: a hazard seen 8 s out still counts, unavoidable trickle damage does not stall the robot.
  const window = BASE_LOOKAHEAD_S / (question.lookaheadS ?? BASE_LOOKAHEAD_S);
  return -stall + entry.progressM * window * (1 - 0.5 * p) - (entry.damagePct * Math.sqrt(window) + approachDamagePct(question, action)) * (0.4 + 2 * p) - entry.energyPct * window * (0.05 + 0.15 * p);
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
