import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { lockedLine, objectives, scanFixes } from './objectives';

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

describe('scanFixes', () => {
  const allRounder: Build = { ...BARE, sensors: ['camera', 'ultrasonic'] };
  const fixes = scanFixes(MISSIONS.M9, allRounder, 'M9-beacon', { maxSensors: 2 });

  it('finds the sensors that make the dark beacon scannable, with what has to come off for each', () => {
    const byId = Object.fromEntries(fixes.map((fix) => [fix.partId, fix]));
    expect(Object.keys(byId)).toEqual(expect.arrayContaining(['camera_module_3_noir', 'ambient_light_veml7700']));
    // The light sensor only helps beside a camera, so it is the ultrasonic that makes room for it.
    expect(byId.ambient_light_veml7700).toMatchObject({ replaces: 'Ultrasonic' });
    expect(byId.camera_module_3_noir!.unlockPoints).toBeGreaterThan(0);
    expect(byId.ultrasonic).toBeUndefined();
  });

  it('has nothing to suggest for a zone the build can scan, or one that does not exist', () => {
    expect(scanFixes(MISSIONS.M1, allRounder, 'M1-survivor', { maxSensors: 2 })).toEqual([]);
    expect(scanFixes(MISSIONS.M9, allRounder, 'nope', { maxSensors: 2 })).toEqual([]);
  });

  it('uses a free slot when there is one', () => {
    const one = scanFixes(MISSIONS.M9, { ...BARE, sensors: ['camera'] }, 'M9-beacon', { maxSensors: 2 });
    expect(one.find((fix) => fix.partId === 'ambient_light_veml7700')).toMatchObject({ replaces: null });
  });
});

describe('lockedLine', () => {
  const fixes = [
    { partId: 'noir', name: 'NoIR camera', unlockPoints: 200, replaces: 'Camera' },
    { partId: 'light', name: 'Light sensor', unlockPoints: 50, replaces: 'Ultrasonic' },
    { partId: 'free', name: 'Camera', unlockPoints: 0, replaces: null },
  ];

  it('says what the locked parts cost, cheapest first, and what they come to', () => {
    expect(lockedLine(fixes, () => false)).toEqual({ text: 'Locked: the light sensor costs 50 points and the NoIR camera 200.', total: 250, count: 2 });
  });

  it('leaves out parts already unlocked, and is null when nothing is locked', () => {
    expect(lockedLine(fixes, (id) => id === 'light')).toEqual({ text: 'Locked: the NoIR camera costs 200 points.', total: 200, count: 1 });
    expect(lockedLine(fixes, () => true)).toBeNull();
  });
});
