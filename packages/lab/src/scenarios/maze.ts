import { markerCell, parseMap } from '../grid';
import type { LabScenario } from '../types';
import { LAB_DEFAULTS, LAB_PLAYER, LAB_SCORE } from './common';

// S = start, E = the exit, a gap in the outer wall. Dead ends that point at the exit, and two loops.
const ROWS = [
  '###############',
  '#S#.....#.....#',
  '#.###.###.#.###',
  '#...#.....#...#',
  '###.#########.#',
  '#.#...#.......#',
  '#.###.#.#.###.#',
  '#.#...#.......#',
  '#.#.###.#.#####',
  '#...#...#...#.#',
  '#.###.#####.#.#',
  '#...#.#...#.#.#',
  '###.#.###.#.#.#',
  '#...#...#.#.#.#',
  '#.#####.#.#.#.#',
  '#.......#.....E',
  '###############',
];
const map = parseMap(ROWS, { defaultTerrain: 'asphalt' });

/**
 * Reach the exit of a maze nobody has mapped; only where the exit lies is known. A lidar sees down every corridor in its line of sight and finds the
 * exit from tiles away; a camera sees a cone ahead; an ultrasonic knows only the next tile; a blind robot finds the
 * walls by driving into them.
 */
export const MAZE: LabScenario = {
  ...LAB_DEFAULTS,
  id: 'maze',
  name: 'Maze',
  description: 'Find the way out of a maze nobody has mapped. What the robot can sense decides how much of it gets driven.',
  map,
  defaultTerrain: 'asphalt',
  indoor: true,
  planMap: false,
  agents: [{ id: LAB_PLAYER, label: 'You', start: markerCell(map, 'S'), heading: 'E' }],
  // Where the way out is, is known (it is on the plan of the building). How to get to it is not.
  objects: [{ id: 'exit', kind: 'exit', label: 'the exit', at: markerCell(map, 'E'), inPlan: true }],
  objectives: [{ id: 'exit', label: 'Reach the exit', type: 'reach', target: 'exit' }],
  maxS: 150,
  score: { ...LAB_SCORE, perSecond: 6, starThreshold: 640 },
};
