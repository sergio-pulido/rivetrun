import { MissionIdSchema, type MissionId } from '@rivetrun/contracts';

/**
 * The mission of the hands-on: /play and its auto rooms. M7, decided by Sergio on 10 Oct at about 13:30.
 * Override with PLAY_MISSION on the server (NEXT_PUBLIC_PLAY_MISSION for client code).
 */
const fromEnv = MissionIdSchema.safeParse(process.env.PLAY_MISSION ?? process.env.NEXT_PUBLIC_PLAY_MISSION);
export const PLAY_MISSION: MissionId = fromEnv.success ? fromEnv.data : 'M7';

/**
 * The presenter's live Arena race and the Lab's "Race in Arena" default: M1, from the rehearsal of 10 Oct. Jev beat
 * the model that reasons while driving in 3 of 3 races there and a race lasts about 35 s.
 */
export const ARENA_DEMO_MISSION: MissionId = 'M1';
