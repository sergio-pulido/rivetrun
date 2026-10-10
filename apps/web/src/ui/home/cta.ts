import type { MissionId } from '@rivetrun/contracts';

/**
 * What Home's PLAY NOW does.
 * 'mission': straight into one mission with the robot on the bench, with the YOU DRIVE / JEV DRIVES switch (as before /play).
 * 'play': opens /play, where the vehicle, the agent and the strategy are picked in three taps; the switch goes, since
 *         the agent pick replaces it.
 */
export type HomeCta = 'mission' | 'play';

/** 'play' since [MASTER]'s go for /play on 10 Oct at 14:15 (docs/OVERNIGHT_LOG.md). Back to 'mission' is the fallback. */
export const HOME_CTA: HomeCta = 'play';

/** The mission PLAY NOW starts in 'mission' mode: the Play mission, by the human's order of 13:28. */
export const HOME_MISSION: MissionId = 'M7';

/** "?cta=play" or "?cta=mission" shows the other version of Home without changing it for anyone else. */
export const homeCta = (asked: string | readonly string[] | undefined): HomeCta => (asked === 'play' || asked === 'mission' ? asked : HOME_CTA);
