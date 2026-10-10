import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { objectives } from './objectives';

const BARE: Build = { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: [], extras: [] };

describe('objectives', () => {
  it('lists each scan zone with where it is and the sensors that can scan it', () => {
    const [survivor] = objectives(MISSIONS.M1, BARE);
    expect(survivor).toMatchObject({ id: 'M1-survivor', label: 'survivor', atM: 17, canScan: false, with: null });
    // Every playable camera-kind part is named; the sim may add more (it added the NoIR camera overnight).
    expect(survivor!.needs).toMatch(/^Camera, .*or /);
    expect(survivor!.needs).toContain('Scout drone');
    expect(survivor!.needs).not.toContain('Moisture probe');
  });

  it('says which fitted sensor scans it when the build has one', () => {
    expect(objectives(MISSIONS.M1, { ...BARE, sensors: ['camera'] })[0]).toMatchObject({ canScan: true, with: 'Camera' });
    expect(objectives(MISSIONS.M1, { ...BARE, sensors: ['scout_drone'] })[0]).toMatchObject({ canScan: true, with: 'Scout drone' });
  });

  it('judges every zone of a mission on its own sensor', () => {
    const rows = objectives(MISSIONS.M3, { ...BARE, sensors: ['camera'] });
    expect(rows.map((row) => [row.label, row.canScan])).toEqual([
      ['survivor', true],
      ['soil sample', false],
    ]);
    expect(rows[1]!.needs).toBe('Moisture probe');
  });

  it('counts any obstacle ranger for a zone that needs one', () => {
    const structure = (build: Build) => objectives(MISSIONS.M7, build).find((row) => row.label === 'structure')!;
    expect(structure(BARE).canScan).toBe(false);
    for (const name of ['Ultrasonic', 'RPLIDAR C1', 'ToF ranger']) expect(structure(BARE).needs).toContain(name);
    expect(structure({ ...BARE, sensors: ['lidar_rplidar_c1'] })).toMatchObject({ canScan: true, with: 'RPLIDAR C1' });
  });

  it('takes the verdict of the sim at night: a plain camera cannot scan in the dark, and the row says why', () => {
    const night = MISSIONS.M9;
    const [beacon] = objectives(night, { ...BARE, sensors: ['camera'] });
    expect(beacon).toMatchObject({ label: 'beacon', canScan: false, with: 'Camera' });
    expect(beacon!.blocked).toBeTruthy();
    const [seen] = objectives(night, { ...BARE, sensors: ['camera_module_3_noir'] });
    expect(seen).toMatchObject({ canScan: true, blocked: null });
    // No camera at all: nothing is "blocked", the build simply lacks the sensor.
    expect(objectives(night, BARE)[0]).toMatchObject({ canScan: false, with: null, blocked: null });
  });

  it('is empty for a mission with no objectives', () => {
    expect(objectives(MISSIONS.M2, BARE)).toEqual([]);
  });
});
