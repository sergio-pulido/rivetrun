import type { MissionId } from '@rivetrun/contracts';

/**
 * What Home's PLAY NOW does.
 * 'mission': straight into one mission with the robot on the bench, with the YOU DRIVE / JEV DRIVES switch (as before /play).
 * 'play': opens /play, where the vehicle, the agent and the strategy are picked in three taps; the switch goes, since
 *         the agent pick replaces it.
 */
export type HomeCta = 'mission' | 'play';

/** Stays 'mission' until /play has its go (docs/PLAY_AND_PLAN.md, go/no-go at 14:15). */
export const HOME_CTA: HomeCta = 'mission';

/** The mission PLAY NOW starts in 'mission' mode. */
export const HOME_MISSION: MissionId = 'M1';

/** "?cta=play" or "?cta=mission" shows the other version of Home without changing it for anyone else. */
export const homeCta = (asked: string | readonly string[] | undefined): HomeCta => (asked === 'play' || asked === 'mission' ? asked : HOME_CTA);
