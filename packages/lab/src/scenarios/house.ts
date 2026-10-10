import { markerCell, parseMap, roomCells } from '../grid';
import type { LabScenario, LabZone } from '../types';
import { LAB_DEFAULTS, LAB_PLAYER, LAB_SCORE } from './common';

// Four rooms off a hallway, doors (+), stairs going down (>). K L B D = the rooms, 1–4 = checkpoints, S = the front door.
const ROWS = [
  '###############',
  '#K....#......L#',
  '#.....#.......#',
  '#..1..+....2..#',
  '#.....#.......#',
  '###+#####+#####',
  '#.....>.......#',
  '#S..........>.#',
  '###+#####+#####',
  '#.....#.......#',
  '#..3..#...>4..#',
  '#.....#.......#',
  '#.....+.......#',
  '#.....#.......#',
  '#B....#......D#',
  '#.....#.......#',
  '###############',
];
const map = parseMap(ROWS, { defaultTerrain: 'asphalt' });
const room = (marker: string, id: string, label: string): LabZone => ({ id, label, cells: roomCells(map, markerCell(map, marker)) });
const checkpoint = (marker: string, id: string, label: string) =>
  ({ id, kind: 'checkpoint' as const, label, at: markerCell(map, marker), needs: ['camera' as const, 'scout_drone' as const] });

/**
 * Go into every room and scan its checkpoint. Scanning needs a camera. The house is not mapped, and there are stairs
 * going down: a camera sees the drop, a lidar or an ultrasonic does not.
 */
export const HOUSE: LabScenario = {
  ...LAB_DEFAULTS,
  id: 'house',
  name: 'House inspection',
  description: 'Go into the four rooms and scan the checkpoint in each with the camera. Mind the stairs: only a camera sees a drop.',
  map,
  defaultTerrain: 'asphalt',
  indoor: true,
  planMap: false,
  agents: [{ id: LAB_PLAYER, label: 'You', start: markerCell(map, 'S'), heading: 'E' }],
  zones: [room('K', 'kitchen', 'the kitchen'), room('L', 'living', 'the living room'), room('B', 'bedroom', 'the bedroom'), room('D', 'study', 'the study')],
  objects: [
    checkpoint('1', 'check-kitchen', 'the kitchen checkpoint'),
    checkpoint('2', 'check-living', 'the living room checkpoint'),
    checkpoint('3', 'check-bedroom', 'the bedroom checkpoint'),
    checkpoint('4', 'check-study', 'the study checkpoint'),
  ],
  objectives: [
    { id: 'rooms', label: 'Go into the 4 rooms', type: 'visit' },
    { id: 'scans', label: 'Scan the 4 checkpoints', type: 'scan', kind: 'checkpoint' },
  ],
  maxS: 180,
  score: { ...LAB_SCORE, perSecond: 5, starThreshold: 700 },
};
