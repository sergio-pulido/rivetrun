import { describe, expect, it } from 'vitest';
import { atmosphereOf } from './atmosphere';

describe('atmosphereOf', () => {
  it('a calm clear mission has nothing to say and far fog', () => {
    const a = atmosphereOf({ weather: 'clear' });
    expect(a.labels).toEqual([]);
    expect(a.precipitation).toBe('none');
    expect(a.night).toBe(false);
    expect(a.fogFar).toBeGreaterThan(300);
  });

  it('keeps the old labels: rain draws rain, cold draws snow but is called COLD', () => {
    expect(atmosphereOf({ weather: 'rain' }).labels).toEqual(['RAIN']);
    const cold = atmosphereOf({ weather: 'cold' });
    expect(cold.precipitation).toBe('snow');
    expect(cold.labels).toEqual(['COLD']);
  });

  it('names night, snow, wind, gusts and temperature in that order', () => {
    const a = atmosphereOf({ weather: 'cold', conditions: { visibility: 'night', precipitation: 'snow', windMps: 6, gustMps: 8, temperatureC: -12 } });
    expect(a.labels).toEqual(['NIGHT', 'SNOW', 'HEADWIND 6 m/s', 'GUSTS +8', '−12 °C']);
    expect(a.night).toBe(true);
    expect(a.fill).toBeLessThan(0.5);
  });

  it('a tailwind is named as one, and fog closes the view in', () => {
    const a = atmosphereOf({ weather: 'clear', conditions: { windMps: -4, visibility: 'fog' } });
    expect(a.labels).toEqual(['FOG', 'TAILWIND 4 m/s']);
    expect(a.fogFar).toBeLessThan(50);
    expect(a.overcast).toBe(true);
  });

  it('an override replaces only the fields it names', () => {
    const a = atmosphereOf({ weather: 'clear', conditions: { windMps: 3 } }, { precipitation: 'heavy_rain' });
    expect(a.precipitation).toBe('heavy_rain');
    expect(a.windMps).toBe(3);
  });
});
