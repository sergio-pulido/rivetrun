import type { Atmosphere } from '../../atmosphere';
import type { SkyLook } from '../../palette';

/** Earthquake Rescue's sky: the sun going down behind the wrecked skyline, as in the backdrop pictures. */
const DUSK: SkyLook = {
  top: '#252a49', mid: '#5f5879', horizon: '#e39a6b', fog: '#ad8c88', sun: '#ffbd88', sunIntensity: 2.0,
  hemiSky: '#a3a6d2', hemiGround: '#5c4a44', hemiIntensity: 1.0, hills: ['#3b4053', '#4a4d62', '#5f5c70'],
};

/**
 * The mission's weather with dusk light and a light dust haze over it. Only what the scene looks like changes: wind,
 * rain, temperature and the HUD's weather words stay the mission's. A night or fog override (dev ?weather=) keeps its own sky.
 */
export function duskOver(base: Atmosphere): Atmosphere {
  if (base.night || base.visibility !== 'clear') return base;
  return { ...base, key: `${base.key}|dusk`, sky: DUSK, fogNear: 22, fogFar: 430, fill: base.fill * 0.9, env: base.env * 0.85 };
}
