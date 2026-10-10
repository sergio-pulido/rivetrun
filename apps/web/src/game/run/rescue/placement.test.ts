import { MISSIONS } from '@rivetrun/sim';
import { describe, expect, it } from 'vitest';
import { LANES } from '../../palette';
import { layoutTrack } from '../../track';
import { FRONT_MAX_HEIGHT, LANE_CLEARANCE, placeRescueKit } from './placement';

const mission = MISSIONS.M7;
const layout = layoutTrack(mission.track);
const zones = mission.scanZones ?? [];
const ALL_LANES = [LANES.player, LANES.heuristic, LANES.random];

const CASES = [
  { name: 'three lanes, full', lanes: ALL_LANES, budget: 1 },
  { name: 'three lanes, low quality', lanes: ALL_LANES, budget: 0.5 },
  { name: 'two lanes, full', lanes: [LANES.player, LANES.heuristic], budget: 1 },
] as const;

describe('placeRescueKit on M7', () => {
  for (const { name, lanes, budget } of CASES) {
    const placed = placeRescueKit({ layout, zones, lanes, budget });

    it(`${name}: nothing stands in a lane`, () => {
      expect(placed.length).toBeGreaterThan(8);
      for (const item of placed) {
        for (const lane of lanes) {
          const inLane = item.z - item.halfZ < lane + LANE_CLEARANCE && item.z + item.halfZ > lane - LANE_CLEARANCE;
          expect(inLane, `${item.prop} at ${item.s.toFixed(1)} m`).toBe(false);
        }
      }
    });

    it(`${name}: nothing floats over a hole or cuts into an obstacle`, () => {
      for (const item of placed) {
        const s0 = item.s - item.halfS;
        const s1 = item.s + item.halfS;
        expect(s0).toBeGreaterThan(0);
        expect(s1).toBeLessThan(layout.lengthM);
        for (const gap of layout.gaps) {
          const over = s1 > gap.s0 && s0 < gap.s1;
          // Hazard tape is the one prop that spans a hole: both posts stand on the ground either side.
          if (item.prop === 'warning_tape_posts' && over) {
            expect(gap.s0 - s0).toBeGreaterThan(0.3);
            expect(s1 - gap.s1).toBeGreaterThan(0.3);
          } else expect(over, `${item.prop} at ${item.s.toFixed(1)} m over a hole`).toBe(false);
        }
        for (const obstacle of layout.obstacles) expect(s1 > obstacle.s0 && s0 < obstacle.s1 && obstacle.kind !== 'step', `${item.prop} in an obstacle`).toBe(false);
        for (const incline of layout.inclines) {
          if (!(s1 > incline.s0 && s0 < incline.s1)) continue;
          // Only a slab lying on it, or a scan-zone beacon, shares a ramp or deck, and then wholly on it.
          expect(['cracked_slab_01', 'cracked_slab_02', 'cracked_slab_03', 'rescue_beacon']).toContain(item.prop);
          expect(s0).toBeGreaterThanOrEqual(incline.s0);
          expect(s1).toBeLessThanOrEqual(incline.s1);
        }
      }
    });

    it(`${name}: props on one side do not overlap, and the front edge stays low`, () => {
      for (const side of ['back', 'front'] as const) {
        const row = placed.filter((item) => item.side === side).sort((a, b) => a.s - b.s);
        for (let i = 1; i < row.length; i += 1) expect(row[i]!.s - row[i]!.halfS).toBeGreaterThanOrEqual(row[i - 1]!.s + row[i - 1]!.halfS);
      }
      for (const item of placed) if (item.side === 'front') expect(item.height).toBeLessThanOrEqual(FRONT_MAX_HEIGHT + 1e-6);
    });

    it(`${name}: every scan zone has a beacon, every ramp a slab`, () => {
      for (const zone of zones) expect(placed.some((item) => item.prop === 'rescue_beacon' && Math.abs(item.s - zone.atM) < zone.halfLengthM + 0.6)).toBe(true);
      for (const incline of layout.inclines) expect(placed.some((item) => item.prop.startsWith('cracked_slab') && item.s > incline.s0 && item.s < incline.s1 && item.slope !== 0)).toBe(true);
    });
  }

  it('is the same street every time', () => {
    expect(placeRescueKit({ layout, zones })).toEqual(placeRescueKit({ layout, zones }));
  });

  it('places rubble on the rough ground and less of everything on a weak device', () => {
    const full = placeRescueKit({ layout, zones });
    const low = placeRescueKit({ layout, zones, budget: 0.5 });
    expect(full.some((item) => item.prop.startsWith('rubble_pile'))).toBe(true);
    expect(low.length).toBeLessThan(full.length);
  });
});
