// The mission's weather and what it does to the robot on the bench. The numbers are the sim's: its tuning for rain and
// cold, and its weather functions (capacity, camera and ranger range factors) once it exports them. The UI only words them.
import type { Build, Mission, Part } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';
import { PARTS_BY_ID, TUNING } from '@rivetrun/sim';

/** The weather as the mission plan states it: label, temperature, precipitation, visibility, wind. Empty when calm and clear. */
export function planFacts(mission: Mission): readonly string[] {
  const c = mission.conditions ?? {};
  const wind = c.windMps ?? 0;
  return [
    mission.weather === 'rain' ? 'Rain' : mission.weather === 'cold' ? 'Cold' : null,
    c.temperatureC === undefined ? null : `${c.temperatureC < 0 ? '−' : ''}${Math.abs(c.temperatureC)} °C`,
    c.precipitation === 'rain' && mission.weather !== 'rain' ? 'Rain' : c.precipitation === 'heavy_rain' ? 'Heavy rain' : c.precipitation === 'snow' ? 'Snow' : null,
    c.visibility === 'fog' ? 'Fog' : c.visibility === 'night' ? 'Night' : null,
    wind > 0 ? `Headwind ${wind} m/s` : wind < 0 ? `Tailwind ${-wind} m/s` : null,
    c.gustMps ? `Gusts to +${c.gustMps} m/s` : null,
  ].flatMap((fact) => (fact ? [fact] : []));
}

/** The sensor source the sim keys its ranger factor on. */
export type RangerSource = 'ultrasonic' | 'tof' | 'lidar';

/** The factors the sim applies on a mission. 1 = no effect. */
export interface WeatherFacts {
  /** Friction on every surface. */
  readonly grip: number;
  /** Extra friction factor on ice. */
  readonly iceGrip: number;
  readonly mudSinkage: number;
  /** Share of the battery's capacity that is usable. */
  readonly capacity: number;
  /** Range factor for the camera, or for the scout drone's camera (which flies above the rain). */
  readonly camera: (drone: boolean) => number;
  readonly ranger: (source: RangerSource) => number;
}

export interface WeatherLine {
  readonly id: string;
  /** What is affected: a part of the build by name, or "Grip", "Battery". */
  readonly label: string;
  readonly detail: string;
  readonly tone: 'info' | 'warn' | 'bad';
}

const tenth = (value: number): number => Math.round(value * 10) / 10;
const toneOf = (factor: number): WeatherLine['tone'] => (factor < 0.5 ? 'bad' : 'warn');
const rangerSource = (part: Part): RangerSource => (part.id.startsWith('lidar') ? 'lidar' : part.id.startsWith('tof') ? 'tof' : 'ultrasonic');

/** What the weather does to this build, one line per thing affected. Empty when it changes nothing. */
export function weatherLines(mission: Mission, build: Build, facts: WeatherFacts): readonly WeatherLine[] {
  const sensors = build.sensors.flatMap((id) => PARTS_BY_ID.get(id) ?? []);
  const battery = PARTS_BY_ID.get(build.battery);
  const cameras = sensors.filter((part) => part.effects.sensor === 'camera' || part.effects.sensor === 'scout_drone');
  // Of two rangers the sim uses the longer one: the same one is named here.
  const ranger = [...sensors].filter((part) => part.effects.sensor === 'ultrasonic').sort((a, b) => (b.effects.rangeM ?? 0) - (a.effects.rangeM ?? 0))[0];
  const lightAffected = (['lidar', 'tof'] as const).some((source) => facts.ranger(source) < 1);
  const wind = mission.conditions?.windMps ?? 0;
  const gusts = (mission.conditions?.gustMps ?? 0) > 0;

  const cameraLines = cameras.flatMap((part): WeatherLine[] => {
    const factor = facts.camera(part.effects.sensor === 'scout_drone');
    const range = part.effects.rangeM;
    if (factor >= 1 || range === undefined) return [];
    return [{ id: part.effects.sensor === 'scout_drone' ? 'drone' : 'camera', label: part.name, detail: `Reads ${tenth(range * factor)} m ahead instead of ${range} m.`, tone: toneOf(factor) }];
  });
  const rangerLine = ((): WeatherLine[] => {
    if (!ranger || ranger.effects.rangeM === undefined) return [];
    const factor = facts.ranger(rangerSource(ranger));
    if (factor < 1) return [{ id: 'ranger', label: ranger.name, detail: `Sees ${tenth(ranger.effects.rangeM * factor)} m ahead instead of ${ranger.effects.rangeM} m.`, tone: toneOf(factor) }];
    return lightAffected ? [{ id: 'ranger', label: ranger.name, detail: `Keeps its ${ranger.effects.rangeM} m range: sound is not affected.`, tone: 'info' }] : [];
  })();

  return [
    facts.grip < 1 ? { id: 'grip', label: 'Grip', detail: `Grip ×${facts.grip} on every surface.`, tone: toneOf(facts.grip) } : null,
    facts.iceGrip < 1 ? { id: 'ice', label: 'Ice', detail: `Grip on ice ×${facts.iceGrip} on top of that.`, tone: toneOf(facts.iceGrip) } : null,
    facts.mudSinkage > 1 ? { id: 'mud', label: 'Mud', detail: `Mud is ×${facts.mudSinkage} deeper to push through.`, tone: 'warn' as const } : null,
    facts.capacity < 1
      ? { id: 'battery', label: 'Battery', detail: `Usable capacity down to ${Math.round(facts.capacity * 100)}%: your ${battery?.name.toLowerCase() ?? 'battery'} has less to give.`, tone: toneOf(facts.capacity) }
      : null,
    ...cameraLines,
    ...rangerLine,
    wind > 0 || gusts
      ? { id: 'wind', label: wind > 0 ? 'Headwind' : 'Gusts', detail: `Air drag grows with the square of your speed into the wind: pace costs more battery.${gusts ? ' Gusts come and go.' : ''}`, tone: 'warn' as const }
      : wind < 0
        ? { id: 'wind', label: 'Tailwind', detail: 'The wind is behind you: less air drag at the same pace.', tone: 'info' as const }
        : null,
  ].flatMap((line) => (line ? [line] : []));
}

type Environment = { readonly weather: Mission['weather']; readonly conditions?: Mission['conditions']; readonly frictionJitter: number; readonly sensorNoiseSeed: number };
interface SimWeather {
  readonly capacityFactor?: (environment: Environment) => number;
  readonly cameraFactor?: (environment: Environment, options?: { aboveRain?: boolean }) => number;
  readonly rangerFactor?: (environment: Environment, source: RangerSource | undefined) => number;
}

/** A sim weather function that is not exported yet, or throws, has no effect to report. */
const factorFrom = (run: (() => number) | undefined, otherwise: number): number => {
  try {
    const value = run?.();
    return typeof value === 'number' && Number.isFinite(value) ? value : otherwise;
  } catch {
    return otherwise;
  }
};

/** The factors the sim applies on this mission: its tuning for rain and cold, and its weather functions where it exports them. */
export function simWeatherFacts(mission: Mission): WeatherFacts {
  const { rain, cold } = TUNING.weather;
  const weather = sim as unknown as SimWeather;
  const environment: Environment = { weather: mission.weather, conditions: mission.conditions, frictionJitter: 1, sensorNoiseSeed: 0 };
  return {
    grip: mission.weather === 'rain' ? rain.frictionFactor : 1,
    iceGrip: mission.weather === 'cold' ? cold.iceFrictionFactor : 1,
    mudSinkage: mission.weather === 'rain' ? rain.mudSinkageFactor : 1,
    capacity: factorFrom(weather.capacityFactor && (() => weather.capacityFactor!(environment)), mission.weather === 'cold' ? cold.batteryCapacityFactor : 1),
    camera: (drone) => factorFrom(weather.cameraFactor && (() => weather.cameraFactor!(environment, { aboveRain: drone })), mission.weather === 'rain' && !drone ? rain.cameraRangeFactor : 1),
    ranger: (source) => factorFrom(weather.rangerFactor && (() => weather.rangerFactor!(environment, source)), 1),
  };
}

const TONES: readonly WeatherLine['tone'][] = ['info', 'warn', 'bad'];

/**
 * The sim's own account of the weather on this build (`weatherEffects(build, mission)`), with this build's numbers.
 * Null when the sim does not export it, throws, or answers in another shape: the card then words the factors itself.
 */
export function simWeatherEffects(build: Build, mission: Mission): readonly WeatherLine[] | null {
  const effects = (sim as unknown as { readonly weatherEffects?: (build: Build, mission: Mission) => unknown }).weatherEffects;
  if (typeof effects !== 'function') return null;
  try {
    const said = effects(build, mission);
    if (!Array.isArray(said)) return null;
    const lines = said.flatMap((entry: unknown): WeatherLine[] => {
      const { id, label, detail, severity } = (entry ?? {}) as { readonly id?: unknown; readonly label?: unknown; readonly detail?: unknown; readonly severity?: unknown };
      if (typeof id !== 'string' || typeof label !== 'string' || typeof detail !== 'string') return [];
      return [{ id, label, detail, tone: TONES.find((tone) => tone === severity) ?? 'info' }];
    });
    return lines.length === said.length ? lines : null;
  } catch {
    return null;
  }
}
