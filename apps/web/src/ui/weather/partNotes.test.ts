import { describe, expect, it } from 'vitest';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { partWeatherNotes, type WeatherNumbers } from './partNotes';

const part = (id: string) => PARTS_BY_ID.get(id)!;
const TODAY: WeatherNumbers = { rainGrip: 0.8, coldCapacity: 0.8, rainCamera: 0.6, model: null };
const FULL: WeatherNumbers = { ...TODAY, model: { capacityLossPerC: 0.01, capacityFloor: 0.5, camera: { fog: 0.35, night: 0.25, snow: 0.7 }, light: { fog: 0.7, heavyRain: 0.6, snow: 0.6 } } };

describe('partWeatherNotes', () => {
  it('says what rain and cold do with the tuning the sim has always had', () => {
    expect(partWeatherNotes(part('camera'), TODAY)).toEqual(['Rain: reads 60% as far.']);
    expect(partWeatherNotes(part('battery_small'), TODAY)).toEqual(['Cold: 80% of its capacity is usable.']);
    expect(partWeatherNotes(part('tracks'), TODAY)).toEqual(['Rain: grip ×0.8 on every surface, whatever the drive.']);
    expect(partWeatherNotes(part('scout_drone'), TODAY)).toEqual(['Rain: flies above it and keeps its range.']);
  });

  it('adds fog, night and snow once the sim models them', () => {
    expect(partWeatherNotes(part('camera'), FULL)).toEqual(['Rain: reads 60% as far.', 'Fog: 35% · night: 25% · snow: 70% of its range.']);
    expect(partWeatherNotes(part('battery_large'), FULL)).toEqual(['Cold: 80% of its capacity is usable.', 'By temperature: about 1% less per °C below 20 °C, never under 50%.']);
    expect(partWeatherNotes(part('lidar_rplidar_c1'), FULL)).toEqual(['Darkness does not affect it.', 'Fog: 70% · heavy rain: 60% · snow: 60% of its range.']);
    expect(partWeatherNotes(part('ultrasonic'), FULL)).toEqual(['Sound: not affected by fog, rain, snow or darkness.']);
  });

  it('says nothing about a ranger before the sim has weather that touches it, or about parts weather leaves alone', () => {
    expect(partWeatherNotes(part('ultrasonic'), TODAY)).toEqual([]);
    expect(partWeatherNotes(part('lidar_rplidar_c1'), TODAY)).toEqual([]);
    expect(partWeatherNotes(part('imu'), FULL)).toEqual([]);
    expect(partWeatherNotes(part('motor_torque'), FULL)).toEqual([]);
    expect(partWeatherNotes(part('winch'), FULL)).toEqual([]);
  });
});
