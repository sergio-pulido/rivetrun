import { describe, expect, it } from 'vitest';
import { PARTS_BY_ID, PRESETS, SIMPLIFICATIONS, deriveSpec, predictStats } from '@rivetrun/sim';
import { LAB_TUNING, PACE, deriveRobot } from './robot';

// One robot, two simulations (OVN-SIM-15): what the grid takes from a build equals what the track takes from it,
// or differs only where a sentence in SIMPLIFICATIONS says so.
describe('lab and rail agree on the robot', () => {
  const said = (id: string): boolean => SIMPLIFICATIONS.some((item) => item.id === id && item.screen === 'lab');

  for (const preset of Object.values(PRESETS)) {
    it(`${preset.id}: mass, top speed, battery capacity and sensor ranges`, () => {
      const rail = deriveSpec(preset.build);
      const stats = predictStats(preset.build);
      const lab = deriveRobot(preset.build);

      expect(lab.spec.massKg).toBe(rail.massKg);
      expect(lab.spec.massKg).toBeCloseTo(stats.massKg, 1);
      expect(lab.spec.topSpeedMps).toBe(rail.topSpeedMps);
      expect(PACE.full.speed * lab.spec.topSpeedMps).toBeCloseTo(stats.topSpeedMps, 1);
      expect(lab.spec.capacityWh).toBe(rail.capacityWh);

      // Ranges, metres, straight from the parts.
      expect(lab.suite.cameraM).toBe(rail.sensorRangeM.camera ?? 0);
      expect(lab.suite.droneM).toBe(rail.sensorRangeM.scout_drone ?? 0);
      expect(lab.suite.imu).toBe(rail.sensorRangeM.imu !== undefined);
      expect(lab.suite.probe).toBe(rail.sensorRangeM.moisture !== undefined);
      expect(lab.suite.sources).toEqual(rail.sources);
      // The rail keeps one obstacle ranger (the longest); the grid keeps lidar and ToF apart.
      const longRanger = Math.max(lab.suite.lidarM, lab.suite.tofM);
      if (longRanger > 0) expect(longRanger).toBe(rail.sensorRangeM.ultrasonic);
      // The plain ultrasonic is the stated difference: 3 m ahead on the rail, the four neighbouring tiles on the grid.
      if (lab.suite.ultrasonic && longRanger === 0) {
        expect(rail.sensorRangeM.ultrasonic).toBe(PARTS_BY_ID.get('ultrasonic')!.effects.rangeM);
        expect(said('lab_ultrasonic_adjacent')).toBe(true);
      }
    });
  }

  it('every way the grid departs from the rail has its sentence', () => {
    // A loaded motor turns slower on the grid only.
    expect(LAB_TUNING.loadSpeedDrop).toBeGreaterThan(0);
    expect(said('lab_load_speed')).toBe(true);
    // Scenario weather is a table of range factors, not the rail's conditions model.
    expect(said('lab_weather')).toBe(true);
    expect(said('lab_grid')).toBe(true);
  });
});
