import { markerCell, parseMap } from '../grid';
import type { LabScenario } from '../types';
import { LAB_DEFAULTS, LAB_PLAYER, LAB_SCORE } from './common';

// Shelves in blocks, five aisles, three cross-aisles. A B C = bays, 1 2 3 = parcels, S = the dock.
const ROWS = [
  '###############',
  '#A.....B.....C#',
  '#.............#',
  '#.##.##.##.##.#',
  '#.##.##.##.##.#',
  '#.##1##.##.##.#',
  '#.##.##.##.##.#',
  '#.............#',
  '#.##.##.##.##.#',
  '#.##.##.##2##.#',
  '#.##.##.##.##.#',
  '#3##.##.##.##.#',
  '#.............#',
  '#.............#',
  '#......S......#',
  '###############',
];
const map = parseMap(ROWS, { defaultTerrain: 'asphalt' });
const at = (marker: string) => markerCell(map, marker);

/**
 * Three parcels to three bays, one at a time, with forklifts working the cross-aisles. The job sheet and the floor
 * plan are known; the forklifts are not. Each tile is 2 m, so the three round trips are about 160 m: more than
 * the small battery holds.
 */
export const WAREHOUSE: LabScenario = {
  ...LAB_DEFAULTS,
  id: 'warehouse',
  name: 'Warehouse delivery',
  description: 'Carry three parcels to their bays, one at a time, without meeting a forklift and without running the battery flat.',
  map,
  tileM: 2,
  defaultTerrain: 'asphalt',
  indoor: true,
  planMap: true,
  agents: [{ id: LAB_PLAYER, label: 'You', start: at('S'), heading: 'N' }],
  objects: [
    { id: 'bay-a', kind: 'bay', label: 'Bay A', at: at('A'), inPlan: true },
    { id: 'bay-b', kind: 'bay', label: 'Bay B', at: at('B'), inPlan: true },
    { id: 'bay-c', kind: 'bay', label: 'Bay C', at: at('C'), inPlan: true },
    { id: 'parcel-1', kind: 'parcel', label: 'Parcel 1 (for Bay C)', at: at('1'), destId: 'bay-c', inPlan: true },
    { id: 'parcel-2', kind: 'parcel', label: 'Parcel 2 (for Bay A)', at: at('2'), destId: 'bay-a', inPlan: true },
    { id: 'parcel-3', kind: 'parcel', label: 'Parcel 3 (for Bay B)', at: at('3'), destId: 'bay-b', inPlan: true },
  ],
  movers: [
    { id: 'forklift-1', label: 'Forklift', path: [{ x: 1, y: 2 }, { x: 13, y: 2 }], loop: 'bounce', speedMps: 1.2, damagePct: 30 },
    { id: 'forklift-2', label: 'Forklift', path: [{ x: 13, y: 7 }, { x: 1, y: 7 }], loop: 'bounce', speedMps: 1.2, damagePct: 30 },
    { id: 'forklift-3', label: 'Forklift', path: [{ x: 7, y: 3 }, { x: 7, y: 11 }], loop: 'bounce', speedMps: 1, damagePct: 30 },
  ],
  objectives: [{ id: 'deliver', label: 'Deliver the three parcels', type: 'deliver', kind: 'parcel' }],
  maxS: 240,
  score: { ...LAB_SCORE, perSecond: 3, starThreshold: 480 },
};
