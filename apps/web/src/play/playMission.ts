import { MissionIdSchema, type MissionId } from '@rivetrun/contracts';

/**
 * The mission of the hands-on: /play and its auto rooms. M7, decided by Sergio on 10 Oct at about 13:30.
 * Override with PLAY_MISSION on the server (NEXT_PUBLIC_PLAY_MISSION for client code).
 */
const fromEnv = MissionIdSchema.safeParse(process.env.PLAY_MISSION ?? process.env.NEXT_PUBLIC_PLAY_MISSION);
export const PLAY_MISSION: MissionId = fromEnv.success ? fromEnv.data : 'M7';

/**
 * The missions a phone may ask an auto room for (RR-PLAN amendment, 14:00). One room queue per mission, each on its
 * own fixed seed. Override with PLAY_MISSIONS, a comma-separated list (NEXT_PUBLIC_PLAY_MISSIONS for client code);
 * ids that are not missions are dropped. PLAY_MISSION is always allowed, and is what a phone gets when it asks for none.
 */
// Sergio's list was M7, M3, M6, M9; [MASTER] swapped M3 and M9 for M5 and M8 after measuring (docs/OVERNIGHT.md, 14:05):
// the best preset differs between these, and a first-timer finishes three of them in about 45 s.
const DEFAULT_PLAY_MISSIONS: readonly MissionId[] = ['M7', 'M5', 'M8', 'M6'];
const listed = (process.env.PLAY_MISSIONS ?? process.env.NEXT_PUBLIC_PLAY_MISSIONS ?? '')
  .split(',')
  .map((id) => MissionIdSchema.safeParse(id.trim()))
  .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
export const PLAY_MISSIONS: readonly MissionId[] = [...new Set<MissionId>([...(listed.length > 0 ? listed : DEFAULT_PLAY_MISSIONS), PLAY_MISSION])];

/**
 * The presenter's live Arena race and the Lab's "Race in Arena" default: M1, from the rehearsal of 10 Oct. Jev beat
 * the model that reasons while driving in 3 of 3 races there and a race lasts about 35 s.
 */
export const ARENA_DEMO_MISSION: MissionId = 'M1';
