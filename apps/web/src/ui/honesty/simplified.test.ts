import { describe, expect, it } from 'vitest';
import type { Mission } from '@rivetrun/contracts';
import { MISSIONS, PARTS_BY_ID } from '@rivetrun/sim';
import { simplifiedForCoach, simplifiedForObjectives, simplifiedForPart, simplifiedForSenses, simplifiedForWeather, type Simplification } from './simplified';

const LIST: readonly Simplification[] = [
  { id: 'noir_range', screen: 'part sheet', partId: 'camera_module_3_noir', sentence: 'NoIR.' },
  { id: 'weather_sensor_factors', screen: 'part sheet', sentence: 'Factors.' },
  { id: 'night_scan', screen: 'brief objectives', missionId: 'M9', sentence: 'Night scan.' },
  { id: 'puddles', screen: 'brief weather card', missionId: 'M8', sentence: 'Puddles.' },
  { id: 'wind_drag_only', screen: 'brief weather card', sentence: 'Wind.' },
  { id: 'gusts_seeded', screen: 'brief weather card', sentence: 'Gusts.' },
  { id: 'cold_capacity', screen: 'brief weather card', sentence: 'Cold.' },
  { id: 'snow_model', screen: 'brief weather card', missionId: 'M9', sentence: 'Snow.' },
  { id: 'core_kit', screen: 'workshop senses', sentence: 'Core kit.' },
  { id: 'air_levelling', screen: 'drive coach marks', sentence: 'Air.' },
  { id: 'charged_jump', screen: 'drive coach marks', sentence: 'Jump.' },
];
const mission = (id: Mission['id'], extra: Partial<Mission> = {}): Mission => ({ ...MISSIONS.M1, id, conditions: undefined, ...extra });
const sentences = (list: readonly Simplification[]): string[] => list.map((entry) => entry.sentence);

describe('part sheet', () => {
  it('shows what is simplified about that part, and the weather factors on a sensor weather touches', () => {
    expect(sentences(simplifiedForPart(PARTS_BY_ID.get('camera_module_3_noir')!, true, LIST))).toEqual(['NoIR.', 'Factors.']);
    expect(sentences(simplifiedForPart(PARTS_BY_ID.get('camera')!, true, LIST))).toEqual(['Factors.']);
  });

  it('shows nothing on a part with no simplification of its own and no weather notes', () => {
    expect(simplifiedForPart(PARTS_BY_ID.get('winch')!, false, LIST)).toEqual([]);
    // A battery has weather notes but is not a sensor: the sensor-factor sentence is not about it.
    expect(simplifiedForPart(PARTS_BY_ID.get('battery_small')!, true, LIST)).toEqual([]);
  });
});

describe('brief', () => {
  it('ties the objective rule to its mission', () => {
    expect(sentences(simplifiedForObjectives(mission('M9'), LIST))).toEqual(['Night scan.']);
    expect(simplifiedForObjectives(mission('M1'), LIST)).toEqual([]);
  });

  it('shows the weather simplifications that apply: mission-bound ones, wind, gusts, cold', () => {
    expect(sentences(simplifiedForWeather(mission('M8', { conditions: { windMps: 6, gustMps: 4 } }), LIST))).toEqual(['Puddles.', 'Wind.', 'Gusts.']);
    expect(sentences(simplifiedForWeather(mission('M9', { weather: 'cold', conditions: { temperatureC: -20, precipitation: 'snow' } }), LIST))).toEqual(['Cold.', 'Snow.']);
    expect(sentences(simplifiedForWeather(mission('M4', { weather: 'cold' }), LIST))).toEqual(['Cold.']);
    expect(sentences(simplifiedForWeather(mission('M2', { conditions: { windMps: -2 } }), LIST))).toEqual(['Wind.']);
    expect(simplifiedForWeather(mission('M5', { weather: 'rain' }), LIST)).toEqual([]);
  });
});

describe('senses and controls', () => {
  it('states the core-kit assumption with the senses', () => {
    expect(sentences(simplifiedForSenses(LIST))).toEqual(['Core kit.']);
  });

  it('explains the air rule where there is something to fly over, and the jump curve when the build has the piston', () => {
    expect(sentences(simplifiedForCoach({ airborne: true, piston: true }, LIST))).toEqual(['Air.', 'Jump.']);
    expect(sentences(simplifiedForCoach({ airborne: true, piston: false }, LIST))).toEqual(['Air.']);
    expect(simplifiedForCoach({ airborne: false, piston: false }, LIST)).toEqual([]);
  });

  it('reads the list the sim exports', () => {
    expect(simplifiedForSenses().length).toBeGreaterThan(0);
  });
});
