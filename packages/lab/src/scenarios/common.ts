import type { LabScenario, LabScoreWeights } from '../types';

/** The robot the player (or the brain under test) drives, in every scenario. */
export const LAB_PLAYER = 'you';
/** The second robot of a two-robot scenario. */
export const LAB_RIVAL = 'jev';

/** Same shape as the rail's score: time, damage, energy and build cost against a base. */
export const LAB_SCORE: LabScoreWeights = { base: 1000, perSecond: 4, perDamagePct: 6, perEnergyPct: 2, costDivisor: 5, dnfMax: 200, starThreshold: 600 };

/** What most scenarios share. Each scenario states what differs. */
export const LAB_DEFAULTS: Pick<LabScenario, 'tileM' | 'zones' | 'movers' | 'weather' | 'carryLimit' | 'ends' | 'tagSteals' | 'maxS' | 'score'> = {
  tileM: 1, zones: [], movers: [], weather: [], carryLimit: 1, ends: 'each', tagSteals: false, maxS: 180, score: LAB_SCORE,
};
