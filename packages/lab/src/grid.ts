import type { TerrainId } from '@rivetrun/contracts';
import type { Cell, Dir, LabMap, Tile } from './types';

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
const DELTA: Readonly<Record<Dir, Cell>> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
export const LEFT: Readonly<Record<Dir, Dir>> = { N: 'W', W: 'S', S: 'E', E: 'N' };
export const RIGHT: Readonly<Record<Dir, Dir>> = { N: 'E', E: 'S', S: 'W', W: 'N' };
export const BACK: Readonly<Record<Dir, Dir>> = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const DIR_NAME: Readonly<Record<Dir, string>> = { N: 'north', E: 'east', S: 'south', W: 'west' };

export const DEFAULT_RAMP_DEG = 12;

export const stepCell = (cell: Cell, dir: Dir): Cell => ({ x: cell.x + DELTA[dir].x, y: cell.y + DELTA[dir].y });
export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
export const inside = (map: LabMap, cell: Cell): boolean => cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height;
export const indexOf = (map: LabMap, cell: Cell): number => cell.y * map.width + cell.x;
export const cellAt = (map: LabMap, index: number): Cell => ({ x: index % map.width, y: Math.floor(index / map.width) });
export const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const OUTSIDE: Tile = { kind: 'wall', terrain: 'rock', slopeDeg: 0 };
/** The tile at a cell; everything beyond the map is wall. */
export const tileAt = (map: LabMap, cell: Cell): Tile => (inside(map, cell) ? map.tiles[indexOf(map, cell)]! : OUTSIDE);

/** The direction from a cell to the one next to it, if they are neighbours. */
export function dirBetween(from: Cell, to: Cell): Dir | undefined {
  return DIRS.find((dir) => sameCell(stepCell(from, dir), to));
}

/** "3 tiles north-east" style bearing, for display lines. */
export function bearing(from: Cell, to: Cell): string {
  const ns = to.y < from.y ? 'north' : to.y > from.y ? 'south' : '';
  const ew = to.x > from.x ? 'east' : to.x < from.x ? 'west' : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'here';
}

const TERRAIN_CHARS: Readonly<Record<string, TerrainId>> = { a: 'asphalt', g: 'grass', s: 'sand', m: 'mud', i: 'ice', w: 'water', r: 'rock' };

/**
 * Builds a map from rows of characters:
 * `#` wall · `.` floor · `+` door · `^` ramp · `>` drop (stairs) · `a g s m i w r` floor of that terrain ·
 * `A–Z`, `0–9` floor with a marker (starts, objects, rooms).
 */
export function parseMap(rows: readonly string[], options: { readonly defaultTerrain: TerrainId; readonly rampDeg?: number }): LabMap {
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new Error('@rivetrun/lab: empty map');
  const floor: Tile = { kind: 'floor', terrain: options.defaultTerrain, slopeDeg: 0 };
  const markers: Record<string, Cell[]> = {};
  const tiles = rows.flatMap((row, y) => {
    if (row.length !== width) throw new Error(`@rivetrun/lab: map row ${y} is ${row.length} wide, expected ${width}`);
    return [...row].map((char, x): Tile => {
      if (char === '#') return { ...floor, kind: 'wall' };
      if (char === '+') return { ...floor, kind: 'door' };
      if (char === '^') return { ...floor, kind: 'ramp', slopeDeg: options.rampDeg ?? DEFAULT_RAMP_DEG };
      if (char === '>') return { ...floor, kind: 'drop' };
      if (char === '.') return floor;
      const terrain = TERRAIN_CHARS[char];
      if (terrain) return { ...floor, terrain };
      if (!/[A-Z0-9]/.test(char)) throw new Error(`@rivetrun/lab: unknown map character "${char}" at ${x},${y}`);
      markers[char] = [...(markers[char] ?? []), { x, y }];
      return floor;
    });
  });
  return { width, height: rows.length, tiles, markers };
}

/** The one cell a marker stands on. Throws when the map has none or several. */
export function markerCell(map: LabMap, marker: string): Cell {
  const cells = map.markers[marker] ?? [];
  if (cells.length !== 1) throw new Error(`@rivetrun/lab: marker "${marker}" appears ${cells.length} times, expected 1`);
  return cells[0]!;
}

/** The floor reachable from a cell without crossing a wall or a door: a room. Tile indexes, sorted. */
export function roomCells(map: LabMap, from: Cell): number[] {
  const seen = new Set<number>([indexOf(map, from)]);
  const queue: Cell[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    for (const dir of DIRS) {
      const next = stepCell(queue[head]!, dir);
      const kind = tileAt(map, next).kind;
      if (kind === 'wall' || kind === 'door' || seen.has(indexOf(map, next))) continue;
      seen.add(indexOf(map, next));
      queue.push(next);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Bresenham line of sight: true when no cell strictly between the two is opaque. */
export function lineOfSight(from: Cell, to: Cell, opaque: (cell: Cell) => boolean): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  let x = from.x;
  let y = from.y;
  for (;;) {
    const twice = 2 * error;
    if (twice > -dy) { error -= dy; x += sx; }
    if (twice < dx) { error += dx; y += sy; }
    if (x === to.x && y === to.y) return true;
    if (opaque({ x, y })) return false;
  }
}

/** Every tile of a mover's loop, in order, from its waypoints. Consecutive waypoints must share a row or a column. */
export function expandRoute(path: readonly Cell[], loop: 'cycle' | 'bounce'): Cell[] {
  if (path.length < 2) throw new Error('@rivetrun/lab: a mover needs at least two waypoints');
  const legs = loop === 'cycle' ? [...path, path[0]!] : path;
  const forward: Cell[] = [legs[0]!];
  for (let i = 1; i < legs.length; i += 1) {
    const from = legs[i - 1]!;
    const to = legs[i]!;
    if (from.x !== to.x && from.y !== to.y) throw new Error('@rivetrun/lab: mover waypoints must be joined by straight lines');
    const steps = manhattan(from, to);
    for (let s = 1; s <= steps; s += 1) forward.push({ x: from.x + Math.sign(to.x - from.x) * s, y: from.y + Math.sign(to.y - from.y) * s });
  }
  // cycle: the last tile is the first again. bounce: walk back without repeating either end.
  return loop === 'cycle' ? forward.slice(0, -1) : [...forward, ...forward.slice(1, -1).reverse()];
}
