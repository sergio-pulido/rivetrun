// What the board draws, worked out from the robot's own map: the fog is whatever its sensors have not reported.
import type { TerrainId } from '@rivetrun/contracts';
import { cellAt, doorOpen, seeCell, type AgentState, type Cell, type KnownTile, type LabObjectKind, type LabScenario, type LabState, type TileKind } from '@rivetrun/lab';

/** Drawing units per tile. On a 390 px phone a 15-tile map is about 24 px a tile, so one unit is one pixel. */
export const TILE = 24;

/** The last word or digit of an id: "parcel-2" → "2", "check-kitchen" → "K". */
export const shortId = (id: string): string => (id.split('-').pop() ?? id).slice(0, 1).toUpperCase();

export type TileLook = 'fog' | 'floor' | 'wall' | 'door' | 'door-open' | 'drop' | 'ramp';

export interface TileView {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly look: TileLook;
  /** Known only when a camera or a drone has looked at the tile. */
  readonly terrain?: TerrainId;
  readonly visited: boolean;
  /** Learned the hard way that this build cannot get onto it. */
  readonly noGo: boolean;
}

function lookOf(tile: KnownTile | undefined): TileLook {
  if (tile === undefined) return 'fog';
  if (tile.kind === 'door') return tile.blocked ? 'door' : 'door-open';
  if (tile.blocked) return 'wall';
  if (tile.kind === 'drop' || tile.kind === 'ramp') return tile.kind;
  return 'floor';
}

/** The map as one robot knows it. Tiles it has not sensed are fog. */
export function knownTiles(state: LabState, agent: AgentState): TileView[] {
  const { map } = state.scenario;
  return agent.known.map((tile, index) => {
    const cell = cellAt(map, index);
    return { index, x: cell.x, y: cell.y, look: lookOf(tile), ...(tile?.terrain ? { terrain: tile.terrain } : {}), visited: tile?.visited === true, noGo: tile?.noGo === true };
  });
}

const TRUE_LOOK: Readonly<Record<TileKind, TileLook>> = { floor: 'floor', wall: 'wall', door: 'door', ramp: 'ramp', drop: 'drop' };

/** The map as it really is, for the result: what was there all along. */
export function trueTiles(state: LabState, agent: AgentState): (TileView & { readonly sensed: boolean })[] {
  const { map } = state.scenario;
  return map.tiles.map((tile, index) => {
    const cell = cellAt(map, index);
    const look = tile.kind === 'door' && doorOpen(state, cell) ? 'door-open' : TRUE_LOOK[tile.kind];
    // Sensed = one of the robot's sensors, or contact, reported it. A tile known only from the mission plan is not.
    return { index, x: cell.x, y: cell.y, look, terrain: tile.terrain, visited: agent.known[index]?.visited === true, noGo: false, sensed: agent.known[index]?.seen === true };
  });
}

/** Tile indexes a sensor of the robot reports right now: its field of view. */
export function inView(state: LabState, agent: AgentState): number[] {
  const { map } = state.scenario;
  const seen: number[] = [];
  for (let index = 0; index < map.tiles.length; index += 1) {
    const sight = seeCell(state, agent, cellAt(map, index));
    if (sight.label !== undefined || sight.geometry !== undefined) seen.push(index);
  }
  return seen;
}

/** Where a robot is drawn: between its tile and the next while it drives. */
export function poseOf(agent: Pick<AgentState, 'cell' | 'move'>): Cell {
  if (agent.move === undefined) return agent.cell;
  const t = agent.move.progress;
  return { x: agent.cell.x + (agent.move.to.x - agent.cell.x) * t, y: agent.cell.y + (agent.move.to.y - agent.cell.y) * t };
}

export interface FogReport {
  /** Share of the map the robot's own sensors reported, %. The mission plan does not count. */
  readonly sensedPct: number;
  /** The floor plan was on the mission plan from the start. */
  readonly planKnown: boolean;
  /** What was on the map and never reported, e.g. "2 stairs", "1 forklift". */
  readonly missed: readonly string[];
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** "What your sensors could not see": the share of the map sensed and the things that never showed up. */
export function fogReport(state: LabState, agent: AgentState): FogReport {
  const { scenario } = state;
  const sensed = agent.known.filter((tile) => tile?.seen === true).length;
  const drops = scenario.map.tiles.filter((tile, index) => tile.kind === 'drop' && agent.known[index]?.kind !== 'drop').length;
  const unseenObjects = scenario.objects.filter((object) => agent.knownObjects[object.id] === undefined && state.objects.find((o) => o.id === object.id)?.by !== agent.id).length;
  const unseenMovers = scenario.movers.filter((mover) => !agent.memory.moversInView.includes(mover.id)).length;
  // A ranger maps floor without seeing what the ground is.
  const unread = agent.known.filter((tile) => tile !== undefined && !tile.blocked && tile.terrain === undefined).length;
  return {
    sensedPct: Math.round((sensed / Math.max(1, agent.known.length)) * 100),
    planKnown: scenario.planMap,
    missed: [
      ...(drops > 0 ? [plural(drops, 'drop', 'drops')] : []),
      ...(unseenMovers > 0 ? [plural(unseenMovers, 'forklift', 'forklifts')] : []),
      ...(unseenObjects > 0 ? [plural(unseenObjects, 'object', 'objects')] : []),
      ...(unread > 0 ? [`the ground type on ${plural(unread, 'tile', 'tiles')}`] : []),
    ],
  };
}

export type LegendKey = LabObjectKind | 'you' | 'rival' | 'mover' | 'door' | 'drop' | 'ramp' | 'fog';

export interface LegendEntry {
  readonly key: LegendKey;
  readonly label: string;
}

const OBJECT_NAME: Readonly<Record<LabObjectKind, string>> = {
  exit: 'exit', parcel: 'parcel', bay: 'bay', sample: 'soil sample', lander: 'lander', checkpoint: 'checkpoint', flag: 'flag', home: 'base',
};

/** What the marks on a scenario's map mean: only the ones that scenario can show. */
export function legendFor(scenario: LabScenario): LegendEntry[] {
  const kinds = [...new Set(scenario.objects.map((object) => object.kind))];
  const tiles = new Set(scenario.map.tiles.map((tile) => tile.kind));
  // Outdoors a drop is a crater and a ramp a dune; indoors they are stairs and a ramp.
  const outdoors = !scenario.indoor;
  return [
    { key: 'you', label: 'your robot' },
    ...(scenario.agents.length > 1 ? [{ key: 'rival' as const, label: 'the other robot, when a camera or a drone sees it' }] : []),
    ...kinds.map((kind) => ({ key: kind, label: OBJECT_NAME[kind] })),
    ...(scenario.movers.length > 0 ? [{ key: 'mover' as const, label: 'forklift ("?" until a camera or a drone names it)' }] : []),
    ...(tiles.has('door') ? [{ key: 'door' as const, label: 'door' }] : []),
    ...(tiles.has('drop') ? [{ key: 'drop' as const, label: outdoors ? 'crater' : 'stairs down' }] : []),
    ...(tiles.has('ramp') ? [{ key: 'ramp' as const, label: outdoors ? 'dune' : 'ramp' }] : []),
    { key: 'fog', label: 'not sensed yet' },
  ];
}
