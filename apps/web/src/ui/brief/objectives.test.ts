import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { objectives } from './objectives';

const BARE: Build = { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: [], extras: [] };

describe('objectives', () => {
  it('lists each scan zone with where it is and the sensors that can scan it', () => {
    const [survivor] = objectives(MISSIONS.M1, BARE);
    expect(survivor).toMatchObject({ id: 'M1-survivor', label: 'survivor', atM: 17, needs: 'Camera or Scout drone', canScan: false, with: null });
  });

  it('says which fitted sensor scans it when the build has one', () => {
    expect(objectives(MISSIONS.M1, { ...BARE, sensors: ['camera'] })[0]).toMatchObject({ canScan: true, with: 'Camera' });
    expect(objectives(MISSIONS.M1, { ...BARE, sensors: ['scout_drone'] })[0]).toMatchObject({ canScan: true, with: 'Scout drone' });
  });

  it('judges every zone of a mission on its own sensor', () => {
    const rows = objectives(MISSIONS.M3, { ...BARE, sensors: ['camera'] });
    expect(rows.map((row) => [row.label, row.canScan, row.needs])).toEqual([
      ['survivor', true, 'Camera or Scout drone'],
      ['soil sample', false, 'Moisture probe'],
    ]);
  });

  it('counts any obstacle ranger for a zone that needs one', () => {
    const structure = (build: Build) => objectives(MISSIONS.M7, build).find((row) => row.label === 'structure')!;
    expect(structure(BARE)).toMatchObject({ canScan: false, needs: 'Ultrasonic, RPLIDAR C1 or ToF ranger' });
    expect(structure({ ...BARE, sensors: ['lidar_rplidar_c1'] })).toMatchObject({ canScan: true, with: 'RPLIDAR C1' });
  });

  it('is empty for a mission with no objectives', () => {
    expect(objectives(MISSIONS.M2, BARE)).toEqual([]);
  });
});
