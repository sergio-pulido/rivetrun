// Where a part matters in weather, for its sheet. Every figure is one the sim applies: its tuning for rain and cold,
// and its weather model's constants once it exports them. A part the weather leaves alone gets no note.
import type { Part } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';
import { TUNING } from '@rivetrun/sim';

/** The sim's weather model, as far as part notes need it. */
export interface WeatherModel {
  readonly capacityLossPerC: number;
  readonly capacityFloor: number;
  /** Camera range factors by visibility. */
  readonly camera: { readonly fog: number; readonly night: number; readonly snow: number };
  /** Lidar and ToF range factors. */
  readonly light: { readonly fog: number; readonly heavyRain: number; readonly snow: number };
}

export interface WeatherNumbers {
  readonly rainGrip: number;
  readonly coldCapacity: number;
  readonly rainCamera: number;
  /** Null until the sim exports its weather model: then fog, night, snow and temperature have no notes. */
  readonly model: WeatherModel | null;
}

const pct = (factor: number): string => `${Math.round(factor * 100)}%`;
const isLight = (part: Part): boolean => part.id.startsWith('lidar') || part.id.startsWith('tof');

/** What weather does to this part, or what it spares it. Empty when weather does not change what the part does. */
export function partWeatherNotes(part: Part, numbers: WeatherNumbers): readonly string[] {
  const { model } = numbers;
  if (part.slot === 'locomotion') return [`Rain: grip ×${numbers.rainGrip} on every surface, whatever the drive.`];
  if (part.slot === 'battery') {
    return [`Cold: ${pct(numbers.coldCapacity)} of its capacity is usable.`, ...(model ? [`By temperature: about ${pct(model.capacityLossPerC)} less per °C below 20 °C, never under ${pct(model.capacityFloor)}.`] : [])];
  }
  const sees = model ? [`Fog: ${pct(model.camera.fog)} · night: ${pct(model.camera.night)} · snow: ${pct(model.camera.snow)} of its range.`] : [];
  if (part.effects.sensor === 'camera') return [`Rain: reads ${pct(numbers.rainCamera)} as far.`, ...sees];
  if (part.effects.sensor === 'scout_drone') return ['Rain: flies above it and keeps its range.', ...sees];
  if (part.effects.sensor === 'ultrasonic' && model) {
    return isLight(part)
      ? ['Darkness does not affect it.', `Fog: ${pct(model.light.fog)} · heavy rain: ${pct(model.light.heavyRain)} · snow: ${pct(model.light.snow)} of its range.`]
      : ['Sound: not affected by fog, rain, snow or darkness.'];
  }
  return [];
}

const isFactor = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The sim's weather model when it exports one in the shape these notes read; null otherwise. */
function simWeatherModel(): WeatherModel | null {
  const model = (sim as unknown as { readonly WEATHER?: Partial<WeatherModel> }).WEATHER;
  const { camera, light } = model ?? {};
  const complete = isFactor(model?.capacityLossPerC) && isFactor(model?.capacityFloor) && [camera?.fog, camera?.night, camera?.snow, light?.fog, light?.heavyRain, light?.snow].every(isFactor);
  return complete ? (model as WeatherModel) : null;
}

/** The numbers the sim applies today. */
export function simWeatherNumbers(): WeatherNumbers {
  const { rain, cold } = TUNING.weather;
  return { rainGrip: rain.frictionFactor, coldCapacity: cold.batteryCapacityFactor, rainCamera: rain.cameraRangeFactor, model: simWeatherModel() };
}

/** A part's weather notes in the sim's own words when it provides them (`partWeatherNotes(partId)`), otherwise worked out from its numbers. */
export function weatherNotesFor(part: Part): readonly string[] {
  const own = (sim as unknown as { readonly partWeatherNotes?: (partId: string) => unknown }).partWeatherNotes;
  if (typeof own === 'function') {
    try {
      const notes = own(part.id);
      if (Array.isArray(notes) && notes.every((note) => typeof note === 'string')) return notes;
    } catch {
      // Fall through to the notes worked out here.
    }
  }
  return partWeatherNotes(part, simWeatherNumbers());
}
