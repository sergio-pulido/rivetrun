import { JEV_QUESTION_VERSION } from '@rivetrun/brain';
import { GAMEPLAY_VERSION } from '@rivetrun/contracts';

/**
 * Rules of the game the cached answers were computed under (docs/GAMEPLAY_V3_CONTROLS.md, docs/BRAIN_V3_SENSING.md).
 * A ghost or a decision recorded under other rules is a different run, so every cache key starts with this.
 * The sim bumps GAMEPLAY_VERSION when triggers, sensing or physics change.
 */
export { GAMEPLAY_VERSION };

/** Prefix for every cache key that stores something Jev answered. */
export const CACHE_VERSION = `gameplay-${GAMEPLAY_VERSION}/${JEV_QUESTION_VERSION}`;
