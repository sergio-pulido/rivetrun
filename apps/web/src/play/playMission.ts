import { MissionIdSchema, type MissionId } from '@rivetrun/contracts';

/**
 * The mission of the hands-on (/play, auto rooms) and of the demo's live Arena race.
 * M1 from the rehearsal of 10 Oct (docs/reports/BRAIN.md): Jev beat the reasoning model in 3 of 3 races there and
 * a race lasts about 35 s. Override with PLAY_MISSION on the server (NEXT_PUBLIC_PLAY_MISSION for client code).
 */
const fromEnv = MissionIdSchema.safeParse(process.env.PLAY_MISSION ?? process.env.NEXT_PUBLIC_PLAY_MISSION);
export const PLAY_MISSION: MissionId = fromEnv.success ? fromEnv.data : 'M1';
