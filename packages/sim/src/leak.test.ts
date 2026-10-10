import { describe, expect, it } from 'vitest';
import { LEAK_BUILDS, LEAK_VARIANTS, leakSamples } from './leak';

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
