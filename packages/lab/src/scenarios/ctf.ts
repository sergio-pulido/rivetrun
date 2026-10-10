import { markerCell, parseMap } from '../grid';
import type { LabScenario } from '../types';
import { LAB_DEFAULTS, LAB_PLAYER, LAB_RIVAL, LAB_SCORE } from './common';

// The same map turned half a turn: both robots have the same way to the flag. Y and J = the bases, F = the flag.
const ROWS = [
  '###############',
  '#......J......#',
  '#.###.....###.#',
  '#.#.........#.#',
  '#.#..##.##..#.#',
  '#....#...#....#',
  '#.##.......##.#',
  '#.#...###...#.#',
  '#......F......#',
  '#.#...###...#.#',
  '#.##.......##.#',
  '#....#...#....#',
  '#.#..##.##..#.#',
  '#.#.........#.#',
  '#.###.....###.#',
  '#......Y......#',
  '###############',
];
const map = parseMap(ROWS, { defaultTerrain: 'asphalt' });

/**
 * Two robots, one flag in the middle, the first to bring it home wins. The map is known to both; where the other
 * robot is, only the sensors tell. Driving into the robot that holds the flag takes it and stuns that robot for 2 s.
 */
export const CTF: LabScenario = {
  ...LAB_DEFAULTS,
  id: 'ctf',
  name: 'Capture the flag',
  description: 'Your robot against a Jev robot on the same map. First to bring the flag home wins; tag the carrier to take it.',
  map,
  defaultTerrain: 'asphalt',
  indoor: true,
  planMap: true,
  agents: [
    { id: LAB_PLAYER, label: 'You', start: markerCell(map, 'Y'), heading: 'N' },
    { id: LAB_RIVAL, label: 'Jev', start: markerCell(map, 'J'), heading: 'S' },
  ],
  objects: [
    { id: 'flag', kind: 'flag', label: 'the flag', at: markerCell(map, 'F'), destKind: 'home', inPlan: true },
    { id: 'home-you', kind: 'home', label: 'your base', at: markerCell(map, 'Y'), owner: LAB_PLAYER, inPlan: true },
    { id: 'home-jev', kind: 'home', label: 'the Jev base', at: markerCell(map, 'J'), owner: LAB_RIVAL, inPlan: true },
  ],
  objectives: [{ id: 'flag', label: 'Bring the flag home', type: 'deliver', kind: 'flag' }],
  ends: 'first',
  tagSteals: true,
  maxS: 120,
  score: { ...LAB_SCORE, perSecond: 8, starThreshold: 750 },
};
