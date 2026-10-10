// Fog of war. A robot's map holds only what its own sensors have reported (RR-BRAIN-V3, rule 1).
import type { SensorSource } from '@rivetrun/contracts';
import { DIRS, indexOf, inside, lineOfSight, manhattan, sameCell, stepCell, tileAt } from './grid';
import { LAB_TUNING, rangeTiles } from './robot';
import type { AgentState, Cell, KnownMap, KnownObject, KnownTile, LabState, SeenMover, Tile } from './types';

/** How much of its range a source has left under the weather in force. */
export function weatherFactor(state: LabState, source: SensorSource): number {
  return state.weather.filter((w) => state.weatherActive.includes(w.id)).reduce((factor, w) => factor * (w.rangeFactor[source] ?? 1), 1);
}

export const doorOpen = (state: LabState, cell: Cell): boolean => state.doorsOpen.includes(indexOf(state.scenario.map, cell));

/** Blocks sight and beams: walls, closed doors and everything beyond the map. */
export function isOpaque(state: LabState, cell: Cell): boolean {
  const kind = tileAt(state.scenario.map, cell).kind;
  return kind === 'wall' || (kind === 'door' && !doorOpen(state, cell));
}

interface Seen {
  /** A ranger reports it: blocked or free, nothing more. */
  readonly geometry?: SensorSource;
  /** The camera or the drone reports it: what it is and what the ground is. */
  readonly label?: SensorSource;
}

/** Range of each sensor in tiles, under the weather. */
function reach(state: LabState, agent: AgentState): { tof: number; lidar: number; camera: number; drone: number; max: number } {
  const { suite } = agent.robot;
  const tiles = (rangeM: number, source: SensorSource): number => rangeTiles(rangeM, weatherFactor(state, source), state.scenario.tileM);
  const tof = tiles(suite.tofM, 'tof');
  const lidar = tiles(suite.lidarM, 'lidar');
  const camera = tiles(suite.cameraM, 'camera');
  const drone = tiles(suite.droneM, 'scout_drone');
  return { tof, lidar, camera, drone, max: Math.max(tof, lidar, camera, drone, suite.ultrasonic || suite.probe ? 1 : 0) };
}

/** Which of the robot's sensors report a cell right now. */
export function seeCell(state: LabState, agent: AgentState, cell: Cell): Seen {
  if (sameCell(cell, agent.cell)) return { label: 'core' };
  const { suite } = agent.robot;
  const range = reach(state, agent);
  const dx = cell.x - agent.cell.x;
  const dy = cell.y - agent.cell.y;
  const distance = Math.hypot(dx, dy);
  if (distance > range.max) return {};
  const ahead = stepCell({ x: 0, y: 0 }, agent.heading);
  const forward = dx * ahead.x + dy * ahead.y;
  const lateral = Math.abs(dx * ahead.y - dy * ahead.x);
  let sightLine: boolean | undefined;
  const clear = (): boolean => (sightLine ??= lineOfSight(agent.cell, cell, (c) => isOpaque(state, c)));
  const label: SensorSource | undefined =
    forward >= 1 && lateral <= forward * LAB_TUNING.cameraHalfFovTan && distance <= range.camera && clear() ? 'camera'
    : distance <= range.drone && (!state.scenario.indoor || clear()) ? 'scout_drone'
    : undefined;
  const geometry: SensorSource | undefined =
    distance <= range.lidar && clear() ? 'lidar'
    : lateral === 0 && forward >= 1 && forward <= range.tof && clear() ? 'tof'
    : suite.ultrasonic && manhattan(cell, agent.cell) === 1 ? 'ultrasonic'
    : undefined;
  return { ...(label ? { label } : {}), ...(geometry ? { geometry } : {}) };
}

/** What a sighting says about a tile. Rangers cannot tell a ramp or a drop from flat floor. */
function report(tile: Tile, open: boolean, seen: Seen, eyes: boolean, imu: boolean): KnownTile | undefined {
  const via = seen.label ?? seen.geometry;
  if (via === undefined) return undefined;
  if (tile.kind === 'wall') return { blocked: true, kind: 'wall', via };
  if (tile.kind === 'door') return { blocked: !open, kind: 'door', via };
  if (seen.label === undefined) return { blocked: false, via };
  // The tile under the robot: the ground type only with a camera or a drone, the slope only with those or an IMU.
  const looked = seen.label !== 'core' || eyes;
  if (!looked && !imu) return { blocked: false, kind: tile.kind === 'ramp' ? 'floor' : tile.kind, via };
  return { blocked: false, kind: tile.kind, ...(looked ? { terrain: tile.terrain } : {}), ...(tile.kind === 'ramp' ? { slopeDeg: tile.slopeDeg } : {}), via };
}

const merge = (old: KnownTile | undefined, next: KnownTile): KnownTile => ({
  ...old,
  ...next,
  kind: next.kind ?? old?.kind,
  terrain: next.terrain ?? old?.terrain,
  slopeDeg: next.slopeDeg ?? old?.slopeDeg,
  via: old?.via ?? next.via,
});

/** Records one tile in a map, e.g. a wall learned by driving into it. */
export function learnTile(known: KnownMap, index: number, tile: KnownTile): KnownMap {
  return known.map((old, i) => (i === index ? merge(old, tile) : old));
}

export interface SenseResult {
  readonly agent: AgentState;
  /** Objects the robot learned of in this update. */
  readonly fresh: readonly string[];
}

/** Updates the robot's map and its known objects from where it stands. Call on arrival, on turning and when a door opens. */
export function senseTiles(state: LabState, agent: AgentState): SenseResult {
  const { map } = state.scenario;
  const { suite } = agent.robot;
  const eyes = suite.cameraM > 0 || suite.droneM > 0;
  const range = reach(state, agent).max;
  const known = [...agent.known];
  const labelled = new Map<number, SensorSource>();
  const ranged = new Map<number, SensorSource>();
  for (let y = agent.cell.y - range; y <= agent.cell.y + range; y += 1) {
    for (let x = agent.cell.x - range; x <= agent.cell.x + range; x += 1) {
      const cell = { x, y };
      if (!inside(map, cell)) continue;
      const seen = seeCell(state, agent, cell);
      const index = indexOf(map, cell);
      const tile = report(map.tiles[index]!, doorOpen(state, cell), seen, eyes, suite.imu);
      if (tile === undefined) continue;
      known[index] = merge(known[index], sameCell(cell, agent.cell) ? { ...tile, visited: true } : tile);
      if (seen.label !== undefined) labelled.set(index, seen.label);
      if (seen.geometry !== undefined) ranged.set(index, seen.geometry);
    }
  }

  const objects: Record<string, KnownObject> = {};
  const fresh: string[] = [];
  for (const object of state.objects) {
    const def = state.scenario.objects.find((o) => o.id === object.id)!;
    const here = object.status !== 'delivered';
    const index = indexOf(map, object.at);
    const probed = suite.probe && def.kind === 'sample' && manhattan(object.at, agent.cell) <= 1;
    // An exit is a gap in the wall: geometry, so a ranger finds it too. Everything else is a label.
    const shape = def.kind === 'exit' ? ranged.get(index) : undefined;
    const via = here ? (labelled.get(index) ?? shape ?? (probed ? 'moisture_probe' : undefined)) : undefined;
    const before = agent.knownObjects[object.id];
    if (via !== undefined) {
      objects[object.id] = { at: object.at, t: state.t, via: before?.via ?? via };
      if (before === undefined && object.by !== agent.id) fresh.push(object.id);
    } else if (before !== undefined && !labelled.has(indexOf(map, before.at))) {
      // Not in view: the robot still believes what it last knew. In view and gone: forgotten.
      objects[object.id] = before;
    }
  }
  return { agent: { ...agent, known, knownObjects: objects }, fresh };
}

function seenTraffic(state: LabState, agent: AgentState, id: string, cell: Cell, next?: Cell): SeenMover | undefined {
  const seen = seeCell(state, agent, cell);
  const via = seen.label ?? seen.geometry;
  return via === undefined || via === 'core' ? undefined : { id, cell, ...(next ? { next } : {}), labelled: seen.label !== undefined, via };
}

/** Movers and other robots in view right now. Cheap: run every step. */
export function senseTraffic(state: LabState, agent: AgentState): AgentState {
  // A sensor that keeps something moving in view also knows which way it moves: its next tile.
  const visibleMovers = state.movers.flatMap((mover) => seenTraffic(state, agent, mover.id, mover.route[mover.index]!, mover.route[(mover.index + 1) % mover.route.length]) ?? []);
  const visibleRivals = state.agents.flatMap((other) => (other.id === agent.id || other.status !== 'running' ? [] : (seenTraffic(state, agent, other.id, other.cell, other.move?.to) ?? [])));
  return { ...agent, visibleMovers, visibleRivals };
}

/** The floor plan as the mission plan gives it: walls, doors, ramps and drops, but not the ground type. */
export function planKnown(state: Pick<LabState, 'scenario'>): KnownMap {
  return state.scenario.map.tiles.map((tile): KnownTile =>
    tile.kind === 'wall' || tile.kind === 'door'
      ? { blocked: true, kind: tile.kind, via: 'core' }
      : { blocked: false, kind: tile.kind, ...(tile.kind === 'ramp' ? { slopeDeg: tile.slopeDeg } : {}), via: 'core' });
}

/** Tiles the robot knows, as a share of the map. */
export function knownShare(agent: AgentState): number {
  return agent.known.filter((tile) => tile !== undefined).length / Math.max(1, agent.known.length);
}

/** Known neighbours of a cell that are not yet sensed, for "what is unknown" lines. */
export function unknownNeighbours(state: LabState, agent: AgentState, cell: Cell): number {
  const { map } = state.scenario;
  return DIRS.filter((dir) => { const next = stepCell(cell, dir); return inside(map, next) && agent.known[indexOf(map, next)] === undefined; }).length;
}
