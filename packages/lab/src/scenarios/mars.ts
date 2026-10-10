import { markerCell, parseMap } from '../grid';
import type { LabScenario } from '../types';
import { LAB_DEFAULTS, LAB_PLAYER, LAB_SCORE } from './common';

// Sand, with rock plates (r) that roll easier, boulders (#), dunes (^) and craters (>). L = the lander, 1–5 = sample sites.
const ROWS = [
  '###############',
  '#.....1.......#',
  '#.##......rr..#',
  '#.##..^^..rr2.#',
  '#......#..rr..#',
  '#..rrr.#...>..#',
  '#..rrr>...##..#',
  '#3.rrr....##..#',
  '#...>.....^...#',
  '#..##.L..>....#',
  '#..##....rrrr.#',
  '#........rrrr.#',
  '#.^^..>..rr4r.#',
  '#....##.......#',
  '#.5..##...#...#',
  '#.........#...#',
  '###############',
];
const map = parseMap(ROWS, { defaultTerrain: 'sand', rampDeg: 14 });
const site = (n: number) => ({ id: `sample-${n}`, kind: 'sample' as const, label: `Soil sample ${n}`, at: markerCell(map, String(n)), needs: ['moisture' as const], inPlan: true });

/**
 * Five sample sites are marked from orbit; three samples are enough. Taking one needs the moisture probe. The ground
 * is not mapped: boulders, dunes and craters are found by the sensors, or by the wheels. A dust storm comes in and
 * cuts how far a camera sees. Each tile is 2 m of sand, and the battery has to cover the way back to the lander.
 */
export const MARS: LabScenario = {
  ...LAB_DEFAULTS,
  id: 'mars',
  name: 'Mars sample return',
  description: 'Take three soil samples with the moisture probe and get back to the lander before the battery runs out. A dust storm is coming.',
  map,
  tileM: 2,
  defaultTerrain: 'sand',
  indoor: false,
  planMap: false,
  agents: [{ id: LAB_PLAYER, label: 'You', start: markerCell(map, 'L'), heading: 'N' }],
  objects: [{ id: 'lander', kind: 'lander', label: 'the lander', at: markerCell(map, 'L'), inPlan: true }, site(1), site(2), site(3), site(4), site(5)],
  weather: [{ id: 'storm', label: 'Dust storm', atS: 25, jitterS: 8, rangeFactor: { camera: 0.34, scout_drone: 0.34, lidar: 0.75 } }],
  objectives: [
    { id: 'samples', label: 'Take 3 soil samples', type: 'collect', kind: 'sample', count: 3 },
    { id: 'return', label: 'Return to the lander', type: 'reach', target: 'lander', last: true },
  ],
  carryLimit: 3,
  maxS: 240,
  score: { ...LAB_SCORE, perSecond: 3, starThreshold: 600 },
};
