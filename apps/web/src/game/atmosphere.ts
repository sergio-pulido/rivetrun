import type { Conditions, Mission } from '@rivetrun/contracts';
import { SKY, type SkyLook } from './palette';

export type Precipitation = NonNullable<Conditions['precipitation']>;
export type Visibility = NonNullable<Conditions['visibility']>;

/** Everything the scene and the HUD need to draw a mission's weather. Visual only: the sim owns what it does to the robot. */
export interface Atmosphere {
  /** Changes when anything visual changes: memo key. */
  readonly key: string;
  readonly sky: SkyLook;
  readonly fogNear: number;
  readonly fogFar: number;
  /** Fill light and reflection strength, 0–1 of a clear day. */
  readonly fill: number;
  readonly env: number;
  readonly precipitation: Precipitation;
  readonly visibility: Visibility;
  /** Steady wind along the track, m/s. Positive = headwind. */
  readonly windMps: number;
  readonly gustMps: number;
  readonly temperatureC: number | null;
  readonly night: boolean;
  /** Heavy cloud: grey clouds, a dim sun. */
  readonly overcast: boolean;
  /** Short words for the HUD chip, most important first. Empty on a calm clear day. */
  readonly labels: readonly string[];
}

const NIGHT: SkyLook = {
  top: '#04060c', mid: '#0a1222', horizon: '#1c2c48', fog: '#0a111d', sun: '#a9c1ff', sunIntensity: 0.95,
  hemiSky: '#4a639a', hemiGround: '#10141d', hemiIntensity: 0.62, hills: ['#0e1624', '#121c2e', '#17243a'],
};
const FOG: SkyLook = {
  top: '#8b959d', mid: '#a8b1b7', horizon: '#c8ced2', fog: '#bcc4c9', sun: '#eef2f5', sunIntensity: 1.25,
  hemiSky: '#e0e7eb', hemiGround: '#6d7276', hemiIntensity: 1.2, hills: ['#98a1a6', '#a8b0b5', '#b7bec2'],
};
const STORM: SkyLook = {
  top: '#10161f', mid: '#26323f', horizon: '#566371', fog: '#4c5966', sun: '#b9c6d3', sunIntensity: 1.1,
  hemiSky: '#8496aa', hemiGround: '#2c302b', hemiIntensity: 0.95, hills: ['#3a4c42', '#435258', '#525f6a'],
};

const WORD: Readonly<Record<Precipitation, string | null>> = { none: null, rain: 'RAIN', heavy_rain: 'HEAVY RAIN', snow: 'SNOW' };

/** The mission's weather as the scene draws it: the old `weather` label plus the overnight `conditions`. */
export function atmosphereOf(mission: Pick<Mission, 'weather' | 'conditions'>, override?: Conditions | null): Atmosphere {
  const conditions: Conditions = { ...(mission.conditions ?? {}), ...(override ?? {}) };
  const precipitation: Precipitation = conditions.precipitation ?? (mission.weather === 'rain' ? 'rain' : mission.weather === 'cold' ? 'snow' : 'none');
  const visibility: Visibility = conditions.visibility ?? 'clear';
  const night = visibility === 'night';
  const fog = visibility === 'fog';
  const sky = night ? NIGHT : fog ? FOG : precipitation === 'heavy_rain' ? STORM : precipitation === 'rain' ? SKY.rain : precipitation === 'snow' || mission.weather === 'cold' ? SKY.cold : SKY[mission.weather];
  const [fogNear, fogFar] = fog ? [4, 34] : night ? [12, 95] : precipitation === 'heavy_rain' ? [16, 120] : precipitation === 'snow' ? [22, 170] : precipitation === 'rain' ? [30, 230] : [40, 330];
  const windMps = conditions.windMps ?? 0;
  const gustMps = conditions.gustMps ?? 0;
  const temperatureC = conditions.temperatureC ?? null;
  const labels: string[] = [];
  if (night) labels.push('NIGHT');
  if (fog) labels.push('FOG');
  const wet = WORD[precipitation];
  // The old `cold` label drew drifting snow before there was a precipitation field: it stays "COLD" in words.
  if (wet && !(precipitation === 'snow' && conditions.precipitation === undefined)) labels.push(wet);
  if (Math.abs(windMps) >= 1) labels.push(`${windMps > 0 ? 'HEADWIND' : 'TAILWIND'} ${Math.abs(windMps).toFixed(0)} m/s`);
  if (gustMps >= 1) labels.push(`GUSTS +${gustMps.toFixed(0)}`);
  if (temperatureC !== null) labels.push(`${temperatureC > 0 ? '' : temperatureC < 0 ? '−' : ''}${Math.abs(temperatureC).toFixed(0)} °C`);
  else if (mission.weather === 'cold') labels.push('COLD');
  return {
    key: [mission.weather, precipitation, visibility, windMps, gustMps].join('|'),
    sky, fogNear, fogFar,
    fill: night ? 0.2 : fog ? 0.8 : precipitation === 'heavy_rain' ? 0.6 : 1,
    env: night ? 0.14 : fog ? 0.75 : precipitation === 'heavy_rain' ? 0.55 : 1,
    precipitation, visibility, windMps, gustMps, temperatureC, night,
    overcast: fog || precipitation === 'rain' || precipitation === 'heavy_rain',
    labels,
  };
}

/**
 * Dev only, for looking at weather before a mission has it: `?weather=night,snow,wind:8,gust:6,temp:-12`
 * (also fog, rain, heavy_rain). Changes what is drawn, never the physics.
 */
export function weatherOverride(): Conditions | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('weather');
  if (!raw) return null;
  const out: { -readonly [K in keyof Conditions]: Conditions[K] } = {};
  for (const part of raw.split(',')) {
    const [name, value] = part.split(':');
    if (name === 'night' || name === 'fog') out.visibility = name;
    else if (name === 'rain' || name === 'heavy_rain' || name === 'snow') out.precipitation = name;
    else if (name === 'wind' && value) out.windMps = Number(value);
    else if (name === 'gust' && value) out.gustMps = Number(value);
    else if (name === 'temp' && value) out.temperatureC = Number(value);
  }
  return out;
}
