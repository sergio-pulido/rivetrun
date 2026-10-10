import { JEV_QUESTION_VERSION } from '@rivetrun/brain';

/**
 * Rules of the game the cached answers were computed under (docs/GAMEPLAY_V3_CONTROLS.md, docs/BRAIN_V3_SENSING.md).
 * A ghost or a decision recorded under other rules is a different run, so every cache key starts with this.
 * Local constant until the sim exports its own gameplay version; bump it when triggers, sensing or physics change.
 */
export const GAMEPLAY_VERSION = 'RR-GAMEPLAY-V3';

/** Prefix for every cache key that stores something Jev answered. */
export const CACHE_VERSION = `${GAMEPLAY_VERSION}/${JEV_QUESTION_VERSION}`;
