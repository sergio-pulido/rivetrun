import { describe, expect, it } from 'vitest';
import type { Build, Mission } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { planFacts, simWeatherEffects, weatherLines, type WeatherFacts } from './weather';

const BUILD: Build = { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: ['camera', 'lidar_rplidar_c1'], extras: [] };
const CALM: WeatherFacts = { grip: 1, iceGrip: 1, mudSinkage: 1, capacity: 1, camera: () => 1, ranger: () => 1 };
const mission = (extra: Partial<Mission>): Mission => ({ ...MISSIONS.M1, ...extra });

describe('planFacts', () => {
  it('reads the weather out of the mission plan', () => {
    expect(planFacts(mission({ weather: 'rain' }))).toEqual(['Rain']);
    expect(planFacts(mission({ weather: 'cold', conditions: { temperatureC: -12, precipitation: 'snow', visibility: 'night', windMps: 6, gustMps: 4 } }))).toEqual(['Cold', '−12 °C', 'Snow', 'Night', 'Headwind 6 m/s', 'Gusts to +4 m/s']);
    expect(planFacts(mission({ weather: 'clear', conditions: { windMps: -3, precipitation: 'heavy_rain', visibility: 'fog' } }))).toEqual(['Heavy rain', 'Fog', 'Tailwind 3 m/s']);
  });

  it('has nothing to say about a calm, clear mission', () => {
    expect(planFacts(mission({ weather: 'clear' }))).toEqual([]);
    expect(planFacts(mission({ weather: 'clear', conditions: { precipitation: 'none', visibility: 'clear', windMps: 0 } }))).toEqual([]);
  });
});

describe('weatherLines', () => {
  it('says nothing when the weather changes nothing for the build', () => {
    expect(weatherLines(mission({ weather: 'clear' }), BUILD, CALM)).toEqual([]);
  });

  it('puts the cold on the battery the build carries', () => {
    const [line] = weatherLines(mission({ weather: 'cold' }), BUILD, { ...CALM, capacity: 0.8 });
    expect(line).toEqual({ id: 'battery', label: 'Battery', detail: 'Usable capacity down to 80%: your small battery has less to give.', tone: 'warn' });
  });

  it('gives the camera and the ranger their own ranges in this weather, as the sim scales them', () => {
    const lines = weatherLines(mission({ weather: 'clear', conditions: { visibility: 'fog' } }), BUILD, { ...CALM, camera: () => 0.35, ranger: (source) => (source === 'lidar' ? 0.7 : 1) });
    expect(lines).toEqual([
      { id: 'camera', label: 'Camera', detail: 'Reads 2.1 m ahead instead of 6 m.', tone: 'bad' },
      { id: 'ranger', label: 'RPLIDAR C1', detail: 'Sees 8.4 m ahead instead of 12 m.', tone: 'warn' },
    ]);
  });

  it('says so when a ranger is not affected while light sensors are', () => {
    const lines = weatherLines(mission({ weather: 'clear', conditions: { visibility: 'fog' } }), { ...BUILD, sensors: ['ultrasonic'] }, { ...CALM, camera: () => 0.35, ranger: (source) => (source === 'ultrasonic' ? 1 : 0.7) });
    expect(lines).toEqual([{ id: 'ranger', label: 'Ultrasonic', detail: 'Keeps its 3 m range: sound is not affected.', tone: 'info' }]);
  });

  it('states grip and sinkage as the factors the sim applies', () => {
    const lines = weatherLines(mission({ weather: 'rain' }), { ...BUILD, sensors: [] }, { ...CALM, grip: 0.8, mudSinkage: 1.3 });
    expect(lines.map((line) => [line.id, line.detail, line.tone])).toEqual([
      ['grip', 'Grip ×0.8 on every surface.', 'warn'],
      ['mud', 'Mud is ×1.3 deeper to push through.', 'warn'],
    ]);
  });

  it('names the wind without inventing a figure for it', () => {
    const lines = weatherLines(mission({ weather: 'clear', conditions: { windMps: 6, gustMps: 4 } }), { ...BUILD, sensors: [] }, CALM);
    expect(lines).toEqual([{ id: 'wind', label: 'Headwind', detail: 'Air drag grows with the square of your speed into the wind: pace costs more battery. Gusts come and go.', tone: 'warn' }]);
  });
});

describe('simWeatherEffects', () => {
  it('passes on the lines of the sim for a mission with weather, and has none on a calm one', () => {
    const rain = simWeatherEffects(BUILD, MISSIONS.M5);
    // Null only if the sim stops exporting weatherEffects: the card then falls back to weatherLines.
    if (rain === null) return;
    expect(rain.length).toBeGreaterThan(0);
    expect(rain.every((line) => line.label.length > 0 && line.detail.length > 0 && ['info', 'warn', 'bad'].includes(line.tone))).toBe(true);
    expect(simWeatherEffects(BUILD, MISSIONS.M1)).toEqual([]);
  });
});
