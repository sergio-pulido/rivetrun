// The honesty guardrail: anything the sim has simplified is said so on the screen it belongs to. The sentences are the
// sim's (SIMPLIFICATIONS, final wording, with the numbers its physics uses); this only decides where each one shows.
import type { Mission, Part } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';

export interface Simplification {
  readonly id: string;
  readonly sentence: string;
  /** Where the player should meet it. */
  readonly screen: string;
  readonly partId?: string | undefined;
  readonly missionId?: string | undefined;
}

/** The sim's list, when it exports one in the shape this reads. Entries that are not are skipped. */
function simList(): readonly Simplification[] {
  const list = (sim as unknown as { readonly SIMPLIFICATIONS?: unknown }).SIMPLIFICATIONS;
  if (!Array.isArray(list)) return [];
  return list.filter((entry): entry is Simplification => typeof entry === 'object' && entry !== null && typeof entry.id === 'string' && typeof entry.sentence === 'string' && typeof entry.screen === 'string');
}

const on = (list: readonly Simplification[], screen: string): readonly Simplification[] => list.filter((entry) => entry.screen === screen);

/** Part sheet: what is simplified about this part, and the general note on weather factors for a sensor that has weather notes. */
export function simplifiedForPart(part: Part, hasWeatherNotes: boolean, list: readonly Simplification[] = simList()): readonly Simplification[] {
  const isSensor = part.slot === 'sensor';
  return on(list, 'part sheet').filter((entry) => (entry.partId ? entry.partId === part.id : isSensor && hasWeatherNotes));
}

/** Brief objectives: rules bound to this mission (or to none). */
export function simplifiedForObjectives(mission: Mission, list: readonly Simplification[] = simList()): readonly Simplification[] {
  return on(list, 'brief objectives').filter((entry) => !entry.missionId || entry.missionId === mission.id);
}

/** Which general weather simplifications apply, by id. One not listed here shows whenever the mission has any weather. */
const WEATHER_APPLIES: Readonly<Record<string, (mission: Mission) => boolean>> = {
  wind_drag_only: (mission) => (mission.conditions?.windMps ?? 0) !== 0 || (mission.conditions?.gustMps ?? 0) > 0,
  gusts_seeded: (mission) => (mission.conditions?.gustMps ?? 0) > 0,
  // The capacity effect is present on a cold mission, or below 20 °C when the plan gives a temperature.
  cold_capacity: (mission) => (mission.conditions?.temperatureC === undefined ? mission.weather === 'cold' : mission.conditions.temperatureC < 20),
};

const hasWeather = (mission: Mission): boolean => mission.weather !== 'clear' || Object.keys(mission.conditions ?? {}).length > 0;

/** Brief weather card: the mission-bound ones on their mission, and the general ones whose effect is present. */
export function simplifiedForWeather(mission: Mission, list: readonly Simplification[] = simList()): readonly Simplification[] {
  return on(list, 'brief weather card').filter((entry) => (entry.missionId ? entry.missionId === mission.id : (WEATHER_APPLIES[entry.id]?.(mission) ?? hasWeather(mission))));
}

/** With the senses: the core-kit assumption. */
export const simplifiedForSenses = (list: readonly Simplification[] = simList()): readonly Simplification[] => on(list, 'workshop senses');

/** Where the controls are explained: the air rule when the track has something to fly over, the jump curve when the build has the piston. */
export function simplifiedForCoach(context: { readonly airborne: boolean; readonly piston: boolean }, list: readonly Simplification[] = simList()): readonly Simplification[] {
  return on(list, 'drive coach marks').filter((entry) => (entry.id === 'charged_jump' ? context.piston : context.airborne));
}
