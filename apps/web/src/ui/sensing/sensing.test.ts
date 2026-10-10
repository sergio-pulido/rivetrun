import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { derivedSensing, sensing } from './sensing';

const BLIND: Build = { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: [], extras: [] };

describe('derivedSensing', () => {
  const sensing = derivedSensing;

  it('always lists the core kit, power sensing included', () => {
    const { core } = sensing(BLIND);
    expect(core.join(' · ')).toContain('Battery charge and current draw');
    expect(core.join(' · ')).toContain('Wheel speed and distance');
  });

  it('says a build with no sensors is blind, and what would change that', () => {
    const { can, cannot } = sensing(BLIND);
    expect(can).toEqual([]);
    expect(cannot.map((row) => row.id)).toEqual(['obstacles', 'terrain', 'depth', 'body', 'contact']);
    const obstacles = cannot[0]!;
    expect(obstacles.text).toBe('Obstacles and gaps ahead: it finds them by hitting them, or not at all');
    expect(obstacles.fit).toContain('Ultrasonic');
    expect(obstacles.fit).toContain('RPLIDAR C1');
  });

  it('names the sensor behind each sense and its range from the sim', () => {
    const { can, cannot } = sensing({ ...BLIND, sensors: ['camera', 'tof_vl53l1x_pololu'] });
    expect(can).toEqual([
      { id: 'obstacles', text: 'Obstacles and gap edges, 4 m ahead', source: 'ToF ranger', fit: null },
      { id: 'terrain', text: 'Terrain type, 6 m ahead', source: 'Camera', fit: null },
    ]);
    expect(cannot.map((row) => row.id)).toEqual(['depth', 'body', 'contact']);
  });

  it('credits the longer of two obstacle rangers', () => {
    const { can } = sensing({ ...BLIND, sensors: ['ultrasonic', 'lidar_rplidar_c1'] });
    expect(can[0]).toMatchObject({ text: 'Obstacles and gap edges, 12 m ahead', source: 'RPLIDAR C1' });
  });

  it('feels contact through the bumper or the IMU; without a forward sensor that is how it meets obstacles', () => {
    const bumped = sensing({ ...BLIND, extras: ['bumper'] });
    expect(bumped.can).toEqual([{ id: 'contact', text: 'Contact, after it happens', source: 'Bumper', fit: null }]);
    expect(bumped.cannot[0]!.text).toBe('Obstacles and gaps ahead: it finds them by hitting them');
    const balanced = sensing({ ...BLIND, sensors: ['imu'] });
    expect(balanced.can.map((row) => [row.id, row.source])).toEqual([
      ['body', 'IMU'],
      ['contact', 'IMU'],
    ]);
  });
});

describe('sensing', () => {
  it('always answers, with at least one thing the build knows and what a sensorless build cannot', () => {
    const blind = sensing(BLIND);
    expect(blind.sensorless).toBe(true);
    expect(blind.cannot.length).toBeGreaterThan(0);
    expect([...blind.core, ...blind.can.map((row) => row.text)].join(' ').toLowerCase()).toContain('battery charge');
    expect(sensing({ ...BLIND, sensors: ['camera'] }).sensorless).toBe(false);
  });
});
