// The robot's planner: shortest known paths and the edges of what it has explored. It reads the robot's own
// map only, never the scenario's.
import type { TerrainId } from '@rivetrun/contracts';
import { BACK, DIRS, cellAt, dirBetween, indexOf, inside, stepCell } from './grid';
import { LAB_TUNING, tileMotion, type LabRobot, type Pace } from './robot';
import type { Cell, Dir, KnownMap, LabMap } from './types';

export interface NavContext {
  readonly map: LabMap;
  readonly known: KnownMap;
  readonly robot: LabRobot;
  readonly pace: Pace;
  readonly defaultTerrain: TerrainId;
  readonly tileM: number;
  /** Tile indexes to keep out of, e.g. where a forklift is in view. */
  readonly avoid?: ReadonlySet<number>;
}

export interface EnterCost {
  readonly timeS: number;
  readonly energyWh: number;
  /** The ground type is not known: the scenario's usual ground was assumed. */
  readonly assumed: boolean;
}

/** What it costs this build to drive onto a tile, as far as the robot knows. `undefined` = it cannot, or it does not know the tile. */
export function enterCost(ctx: NavContext, index: number): EnterCost | undefined {
  const tile = ctx.known[index];
  if (tile === undefined || tile.noGo || tile.kind === 'drop' || (tile.blocked && tile.kind !== 'door') || ctx.avoid?.has(index)) return undefined;
  const motion = tileMotion(ctx.robot.spec, tile.terrain ?? ctx.defaultTerrain, tile.slopeDeg ?? 0, ctx.pace);
  if (!motion.ok) return undefined;
  const driveS = ctx.tileM / motion.speedMps;
  // A closed door is pushed open first.
  const doorS = tile.blocked ? LAB_TUNING.doorS : 0;
  return {
    timeS: driveS + doorS,
    energyWh: (motion.drawW * driveS + ctx.robot.spec.basePowerW * doorS) / 3600,
    assumed: tile.terrain === undefined,
  };
}

/** Whether the robot believes it can drive onto a tile. */
export const passable = (ctx: NavContext, cell: Cell): boolean => inside(ctx.map, cell) && enterCost(ctx, indexOf(ctx.map, cell)) !== undefined;

export interface Nav {
  readonly from: number;
  /** Per tile index; Infinity = no known way there. */
  readonly timeS: readonly number[];
  readonly energyWh: readonly number[];
  readonly tiles: readonly number[];
  readonly assumed: readonly boolean[];
  readonly prev: readonly number[];
}

/** Min-heap of [cost, sequence, index]; the sequence keeps equal costs in insertion order, so paths are deterministic. */
class Heap {
  private readonly items: [number, number, number][] = [];
  private sequence = 0;

  get size(): number { return this.items.length; }

  push(cost: number, index: number): void {
    const items = this.items;
    items.push([cost, this.sequence, index]);
    this.sequence += 1;
    for (let i = items.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (!this.less(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): [number, number, number] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      for (let i = 0; ;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let best = i;
        if (left < items.length && this.less(items[left]!, items[best]!)) best = left;
        if (right < items.length && this.less(items[right]!, items[best]!)) best = right;
        if (best === i) break;
        [items[i], items[best]] = [items[best]!, items[i]!];
        i = best;
      }
    }
    return top;
  }

  private less(a: [number, number, number], b: [number, number, number]): boolean {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }
}

/** Fastest known way from a cell to every tile the robot knows it can reach (Dijkstra on driving time). */
export function navigate(ctx: NavContext, from: Cell): Nav {
  const size = ctx.map.tiles.length;
  const timeS = new Array<number>(size).fill(Infinity);
  const energyWh = new Array<number>(size).fill(Infinity);
  const tiles = new Array<number>(size).fill(Infinity);
  const assumed = new Array<boolean>(size).fill(false);
  const prev = new Array<number>(size).fill(-1);
  const start = indexOf(ctx.map, from);
  timeS[start] = 0;
  energyWh[start] = 0;
  tiles[start] = 0;
  const heap = new Heap();
  heap.push(0, start);
  while (heap.size > 0) {
    const [cost, , index] = heap.pop();
    if (cost > timeS[index]!) continue;
    const cell = cellAt(ctx.map, index);
    for (const dir of DIRS) {
      const next = stepCell(cell, dir);
      if (!inside(ctx.map, next)) continue;
      const nextIndex = indexOf(ctx.map, next);
      const enter = enterCost(ctx, nextIndex);
      if (enter === undefined || cost + enter.timeS >= timeS[nextIndex]!) continue;
      timeS[nextIndex] = cost + enter.timeS;
      energyWh[nextIndex] = energyWh[index]! + enter.energyWh;
      tiles[nextIndex] = tiles[index]! + 1;
      assumed[nextIndex] = assumed[index]! || enter.assumed;
      prev[nextIndex] = index;
      heap.push(timeS[nextIndex]!, nextIndex);
    }
  }
  return { from: start, timeS, energyWh, tiles, assumed, prev };
}

/** The cells to drive through to get there, the target last. `undefined` = no known way; empty = already there. */
export function pathTo(nav: Nav, map: LabMap, to: Cell): Cell[] | undefined {
  const target = indexOf(map, to);
  if (!Number.isFinite(nav.timeS[target]!)) return undefined;
  const path: Cell[] = [];
  for (let index = target; index !== nav.from; index = nav.prev[index]!) path.unshift(cellAt(map, index));
  return path;
}

export interface Frontier {
  readonly cell: Cell;
  readonly tiles: number;
  readonly timeS: number;
  readonly energyWh: number;
  readonly assumed: boolean;
  /** First step of the way there; `undefined` when the robot stands on it. */
  readonly first?: Dir;
  /** The way on from there into what is not yet known. */
  readonly into: Dir;
  /** Unsensed tiles next to it. 0 = a tile a ranger has mapped but nothing has looked at. */
  readonly unknown: number;
}

/**
 * Where there is still something to find out, nearest first: reachable tiles with an unsensed neighbour (the edge
 * of the explored map) and, with `search`, tiles a ranger has mapped but that no camera has looked at and the
 * robot has not stood on. A lidar gives the walls, not what lies on the floor.
 */
export function frontiers(ctx: NavContext, nav: Nav, search = false): Frontier[] {
  const found: Frontier[] = [];
  nav.timeS.forEach((timeS, index) => {
    if (!Number.isFinite(timeS)) return;
    const cell = cellAt(ctx.map, index);
    const open = DIRS.filter((dir) => { const next = stepCell(cell, dir); return inside(ctx.map, next) && ctx.known[indexOf(ctx.map, next)] === undefined; });
    // Looked at = driven over, or seen by a camera or a drone (they give the ground type). A floor plan and a ranger give neither.
    const tile = ctx.known[index];
    const unlooked = search && index !== nav.from && tile !== undefined && !tile.visited && tile.terrain === undefined;
    if (open.length === 0 && !unlooked) return;
    const path = pathTo(nav, ctx.map, cell) ?? [];
    const first = path[0] ? dirBetween(cellAt(ctx.map, nav.from), path[0]) : undefined;
    // Keep going the way the robot arrives, if that leads into the unknown.
    const before = path.length >= 2 ? path[path.length - 2]! : cellAt(ctx.map, nav.from);
    const arriving = path.length > 0 ? dirBetween(before, cell) : undefined;
    const into = arriving !== undefined && (open.includes(arriving) || open.length === 0) ? arriving : (open.find((dir) => arriving === undefined || dir !== BACK[arriving]) ?? open[0]!);
    found.push({ cell, tiles: nav.tiles[index]!, timeS, energyWh: nav.energyWh[index]!, assumed: nav.assumed[index]!, ...(first ? { first } : {}), into, unknown: open.length });
  });
  return found.sort((a, b) => a.timeS - b.timeS || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
}
