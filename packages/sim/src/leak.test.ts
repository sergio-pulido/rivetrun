import { describe, expect, it } from 'vitest';
import type { Conditions } from '@rivetrun/contracts';
import { MISSIONS, PRESETS } from './data';
import { LEAK_BUILDS, LEAK_VARIANTS, leakSamples } from './leak';
import { START_TRIGGER, buildQuestion } from './perception';
import { createRun, step } from './physics';
import { gustAt } from './weather';

// The arena's claim: a brain knows only what its sensors report. Two tracks that differ only beyond what the build
// can sense must give the brain exactly the same question: observation, options and every predicted outcome.
// This fails the moment anything given to a brain reads the track ahead.
const MARGIN_M = 1;
/** The moisture probe reads depth 3 m ahead and is not part of `forwardRangeM`. */
const PROBE_M = 3;

describe('no leak: what lies beyond sensor range never reaches the brain', () => {
  for (const [name, build] of Object.entries(LEAK_BUILDS)) {
    it(`${name}: the question is identical on every variant until the difference is in range`, () => {
      const base = leakSamples(build, 'plain');
      expect(base.length).toBeGreaterThan(40);
      let compared = 0;
      for (const variant of Object.keys(LEAK_VARIANTS).filter((id) => id !== 'plain')) {
        const other = leakSamples(build, variant);
        for (let i = 0; i < Math.min(base.length, other.length); i += 1) {
          const a = base[i]!;
          const b = other[i]!;
          const reach = Math.max(a.rangeM, build.sensors.includes('moisture_probe') ? PROBE_M : 0);
          if (a.toDivergenceM <= reach + MARGIN_M) break;
          // Same position: the physics before the difference is the same too.
          expect(b.x, `${variant} step ${i}`).toBe(a.x);
          expect(b.question, `${variant} at ${a.x.toFixed(1)} m, ${a.toDivergenceM.toFixed(1)} m before the difference, range ${a.rangeM} m`).toEqual(a.question);
          compared += 1;
        }
      }
      expect(compared).toBeGreaterThan(100);
    });
  }

  it('the kit can tell: once the difference is within range, a build with eyes is told', () => {
    const seesIt = (buildId: string, variant: string): boolean => {
      const base = leakSamples(LEAK_BUILDS[buildId]!, 'plain');
      const other = leakSamples(LEAK_BUILDS[buildId]!, variant);
      return base.some((a, i) => other[i] !== undefined && JSON.stringify(other[i]!.question.observation) !== JSON.stringify(a.question.observation));
    };
    expect(seesIt('camera', 'mud')).toBe(true);
    expect(seesIt('lidar', 'rock_at_once')).toBe(true);
    expect(seesIt('drone', 'deep_water')).toBe(true);
    // A blind build is told nothing about any of it before it gets there.
    for (const variant of Object.keys(LEAK_VARIANTS)) expect(seesIt('blind', variant), variant).toBe(false);
  });
});

// Weather. The mission plan gives every build the forecast; what the weather hides, and a gust as it happens,
// reach a brain only through a sensor.
describe('no leak in bad weather', () => {
  const WEATHER: Readonly<Record<string, Conditions>> = {
    fog: { visibility: 'fog' },
    night_snow: { visibility: 'night', precipitation: 'snow', temperatureC: -10 },
    storm: { windMps: 5, gustMps: 9, precipitation: 'heavy_rain' },
  };

  for (const [weather, conditions] of Object.entries(WEATHER)) {
    it(`${weather}: what lies beyond the shortened range stays unknown, for camera, lidar and drone`, () => {
      for (const name of ['camera', 'lidar', 'drone', 'camera_imu_bumper'] as const) {
        const build = LEAK_BUILDS[name]!;
        const base = leakSamples(build, 'plain', 7, conditions);
        const clearRange = leakSamples(build, 'plain')[0]!.rangeM;
        // The weather really did shorten what this build sees (the storm leaves the drone above the rain).
        if (weather !== 'storm' || name !== 'drone') expect(base[0]!.rangeM, `${name} range`).toBeLessThan(clearRange);
        let compared = 0;
        for (const variant of ['mud', 'rock_at_once', 'gap', 'deep_water']) {
          const other = leakSamples(build, variant, 7, conditions);
          for (let i = 0; i < Math.min(base.length, other.length); i += 1) {
            const a = base[i]!;
            if (a.toDivergenceM <= a.rangeM + MARGIN_M) break;
            expect(other[i]!.question, `${name} in ${weather}, ${variant} at ${a.x.toFixed(1)} m, range ${a.rangeM} m`).toEqual(a.question);
            compared += 1;
          }
        }
        expect(compared, name).toBeGreaterThan(100);
      }
    });
  }

  it('a gust the build has no IMU for: the same robot in a gust and out of one is asked the same question', () => {
    const gusty = { ...MISSIONS.M1, scanZones: [], conditions: { windMps: 4, gustMps: 12 } };
    const noImu = { ...PRESETS.all_rounder.build, sensors: [], extras: [] };
    const withImu = { ...noImu, sensors: ['imu'] };
    for (const [build, feels] of [[noImu, false], [withImu, true]] as const) {
      let state = createRun({ mission: gusty, seed: 7, build, priority: 0.5 });
      for (let i = 0; i < 600 && gustAt(state.environment, state.sim.t) === 0; i += 1) state = step(state, 'cruise');
      expect(gustAt(state.environment, state.sim.t)).toBeGreaterThan(0);
      // The same robot at the same moment, in a world whose gust schedule has no gust now. Nothing else differs.
      let calmSeed = state.environment.sensorNoiseSeed;
      let calm = state;
      for (let tries = 0; tries < 200 && gustAt(calm.environment, calm.sim.t) > 0; tries += 1) {
        calmSeed += 1;
        calm = { ...state, environment: { ...state.environment, sensorNoiseSeed: calmSeed } };
      }
      expect(gustAt(calm.environment, calm.sim.t)).toBe(0);
      const inGust = buildQuestion(state, START_TRIGGER);
      const inCalm = buildQuestion(calm, START_TRIGGER);
      if (feels) {
        expect(inGust.observation!.gusting).toBe(true);
        expect(inCalm.observation!.gusting).toBe(false);
        expect(inGust.lookahead).not.toEqual(inCalm.lookahead);
      } else {
        expect(inGust.observation!.gusting).toBe('unknown');
        expect(inGust).toEqual(inCalm);
      }
    }
  });
});
