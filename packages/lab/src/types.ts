import type { Build, DnfReason, Policy, SensorKind, SensorSource, TerrainId, TriggerKind } from '@rivetrun/contracts';
import type { LabRobot, Pace } from './robot';

export type Dir = 'N' | 'E' | 'S' | 'W';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** `drop` is a step down (stairs): driving onto it is a fall. `ramp` needs grip and torque. */
export type TileKind = 'floor' | 'wall' | 'door' | 'ramp' | 'drop';

export interface Tile {
  readonly kind: TileKind;
  readonly terrain: TerrainId;
  /** Ramp only; 0 elsewhere. */
  readonly slopeDeg: number;
}

export interface LabMap {
  readonly width: number;
  readonly height: number;
  /** Row-major: index = y × width + x. */
  readonly tiles: readonly Tile[];
  /** Cells marked with an upper-case letter or a digit in the ASCII map. */
  readonly markers: Readonly<Record<string, readonly Cell[]>>;
}

export type LabObjectKind = 'exit' | 'parcel' | 'bay' | 'sample' | 'lander' | 'checkpoint' | 'flag' | 'home';

/** goal = reach it · item = pick it up · depot = deliver items to it · check = scan it. */
export type LabObjectRole = 'goal' | 'item' | 'depot' | 'check';

export interface LabObjectDef {
  readonly id: string;
  readonly kind: LabObjectKind;
  readonly label: string;
  readonly at: Cell;
  /** Item: the depot it must reach, by id. */
  readonly destId?: string;
  /** Item: any depot of this kind that is the robot's own or nobody's. */
  readonly destKind?: LabObjectKind;
  /** Part sensor kinds that can pick or scan it (any one). Absent = none needed. */
  readonly needs?: readonly SensorKind[];
  /** Known from the mission plan at the start, with its position. */
  readonly inPlan?: boolean;
  /** The one robot it belongs to (a home base). */
  readonly owner?: string;
}

/** A named region of floor: a room. */
export interface LabZone {
  readonly id: string;
  readonly label: string;
  /** Tile indexes. */
  readonly cells: readonly number[];
}

/** Scripted traffic, e.g. a forklift. It turns back for a robot standing in its way, and runs into one that drives in front of it. */
export interface LabMoverDef {
  readonly id: string;
  readonly label: string;
  /** Waypoints joined by straight lines. */
  readonly path: readonly Cell[];
  /** cycle = back to the first waypoint in a straight line; bounce = there and back. */
  readonly loop: 'cycle' | 'bounce';
  readonly speedMps: number;
  /** Damage to a robot it hits, before the bumper. */
  readonly damagePct: number;
}

/** Weather that changes how far sensors reach, e.g. a dust storm. */
export interface LabWeatherDef {
  readonly id: string;
  readonly label: string;
  readonly atS: number;
  /** Absent = until the end. */
  readonly untilS?: number;
  /** The start moves by up to ± this many seconds with the seed. */
  readonly jitterS?: number;
  /** Multiplier on sensing range per source (missing = 1). */
  readonly rangeFactor: Partial<Record<SensorSource, number>>;
}

export type LabObjectiveDef =
  /** Be at the goal. `last`: it counts only once every other objective is done; before that the robot may end the mission there. */
  | { readonly id: string; readonly label: string; readonly type: 'reach'; readonly target: string; readonly last?: boolean }
  /** Every item of the kind delivered to its destination. */
  | { readonly id: string; readonly label: string; readonly type: 'deliver'; readonly kind: LabObjectKind }
  /** Items of the kind picked up. */
  | { readonly id: string; readonly label: string; readonly type: 'collect'; readonly kind: LabObjectKind; readonly count: number }
  /** Every check of the kind scanned. */
  | { readonly id: string; readonly label: string; readonly type: 'scan'; readonly kind: LabObjectKind }
  /** Every zone entered. */
  | { readonly id: string; readonly label: string; readonly type: 'visit' };

export interface LabScoreWeights {
  readonly base: number;
  readonly perSecond: number;
  readonly perDamagePct: number;
  readonly perEnergyPct: number;
  readonly costDivisor: number;
  /** A run that did not finish scores this × the share of the objectives done. */
  readonly dnfMax: number;
  /** Score needed for 2 stars (3 = threshold and no damage). */
  readonly starThreshold: number;
}

export interface LabAgentDef {
  readonly id: string;
  readonly label: string;
  readonly start: Cell;
  readonly heading: Dir;
}

export interface LabScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly map: LabMap;
  /** Metres per tile. Sensor ranges and speeds are in metres; the grid is this coarse. */
  readonly tileM: number;
  /** Assumed for tiles whose terrain the robot has not seen. */
  readonly defaultTerrain: TerrainId;
  /** Under a ceiling: the scout drone needs line of sight like a camera. */
  readonly indoor: boolean;
  /** The mission plan includes the floor plan: walls, doors, ramps and drops are known from the start. */
  readonly planMap: boolean;
  readonly agents: readonly LabAgentDef[];
  readonly objects: readonly LabObjectDef[];
  readonly zones: readonly LabZone[];
  readonly movers: readonly LabMoverDef[];
  readonly weather: readonly LabWeatherDef[];
  readonly objectives: readonly LabObjectiveDef[];
  /** Items a robot carries at once. */
  readonly carryLimit: number;
  /** each = every robot runs to its own end; first = the first robot to complete ends the run. */
  readonly ends: 'each' | 'first';
  /** Bumping a robot that carries an item takes the item from it (if there is room to carry it) and stuns it. */
  readonly tagSteals: boolean;
  readonly maxS: number;
  readonly score: LabScoreWeights;
}

// ---- what a robot knows

/** One tile as a robot knows it. Rangers give `blocked` only; the camera and the drone add the label and the terrain. */
export interface KnownTile {
  readonly blocked: boolean;
  readonly kind?: TileKind;
  readonly terrain?: TerrainId;
  readonly slopeDeg?: number;
  readonly visited?: boolean;
  /** One of the robot's sensors, or contact, has reported it. Absent on a tile it knows only from the mission plan. */
  readonly seen?: boolean;
  /** Learned the hard way that this build cannot enter it (too steep, bogs down). */
  readonly noGo?: boolean;
  /** The source that first reported it. */
  readonly via: SensorSource;
}

/** Per tile index; `undefined` = never sensed. */
export type KnownMap = readonly (KnownTile | undefined)[];

export interface KnownObject {
  readonly at: Cell;
  readonly t: number;
  readonly via: SensorSource;
}

export interface SeenMover {
  readonly id: string;
  readonly cell: Cell;
  /** The tile it is heading for, from tracking it. Absent for something standing still. */
  readonly next?: Cell;
  /** False when only a ranger sees it: an obstacle that moves, nothing more. */
  readonly labelled: boolean;
  readonly via: SensorSource;
}

// ---- commands and triggers

/** What a robot is doing until the next decision. The last command holds. */
export type LabCommand =
  | { readonly type: 'idle' }
  /** One tile, then idle (the arrow pad). */
  | { readonly type: 'step'; readonly dir: Dir }
  /** Drive on, following corridors and corners, until something changes. */
  | { readonly type: 'heading'; readonly dir: Dir }
  /** Follow the known path. On arrival: interact with `interact`, or carry on in `thenHeading`, or stop. */
  | { readonly type: 'goto'; readonly to: Cell; readonly interact?: string; readonly thenHeading?: Dir }
  /** Pick up, deliver, scan or end the mission at the current tile. */
  | { readonly type: 'interact'; readonly objectId?: string }
  | { readonly type: 'wait'; readonly forS: number };

export const LAB_CAUSES = [
  'start',
  // perception
  'junction_reached', 'dead_end', 'wall_ahead', 'object_seen', 'mover_seen', 'mover_ahead', 'rival_seen', 'visibility_changed', 'target_reached',
  // body
  'bumped', 'collision', 'fell', 'blocked', 'tagged',
  // energy (hysteresis, as on the rail: low under 10 %, ok again over 30 %)
  'energy_low', 'energy_ok',
  // actuator
  'objective_done', 'action_done', 'action_failed', 'idle',
] as const;
export type LabCause = (typeof LAB_CAUSES)[number];

/** Why a decision is requested. Same kinds as RR-BRAIN-V3; there is no clock. */
export interface LabTrigger {
  readonly kind: TriggerKind;
  readonly cause: LabCause;
  readonly source?: SensorSource;
  /** Display text, e.g. "LIDAR · junction: left and ahead". */
  readonly label: string;
}

// ---- state

export type BusyKind = 'bump' | 'door' | 'fall' | 'stun' | 'pick' | 'drop' | 'scan' | 'wait';

export interface TriggerMemory {
  /** Exits to the left, ahead and right at the last tile, so a junction is announced once. */
  readonly signature: string;
  readonly energyLow: boolean;
  readonly moversInView: readonly string[];
  readonly rivalsInView: readonly string[];
  /** Camera range factor last announced. */
  readonly visibility: number;
  readonly heldForMover: boolean;
  /** Sim time since which the robot has had nothing to do; -1 = busy. */
  readonly idleSinceT: number;
}

export interface AgentStats {
  readonly tiles: number;
  readonly bumps: number;
  readonly collisions: number;
  readonly falls: number;
  readonly idleS: number;
}

export type LabDnfReason = DnfReason | 'beaten';
export type AgentStatus = 'running' | 'complete' | 'partial' | 'dnf';

export interface AgentState {
  readonly id: string;
  readonly label: string;
  readonly build: Build;
  readonly robot: LabRobot;
  readonly policy?: Policy;
  readonly cell: Cell;
  readonly heading: Dir;
  /** The move in flight. `progress` 0..1 from `cell` to `to`. */
  readonly move?: { readonly to: Cell; readonly progress: number; readonly speedMps: number; readonly drawW: number };
  /** Distance left over from the last tile, carried into the next move. */
  readonly carryM: number;
  readonly busy?: { readonly kind: BusyKind; readonly untilT: number; readonly objectId?: string };
  readonly command: LabCommand;
  readonly pace: Pace;
  readonly batteryPct: number;
  readonly damagePct: number;
  readonly drawW: number;
  readonly speedMps: number;
  /** Object ids. */
  readonly carrying: readonly string[];
  readonly known: KnownMap;
  readonly knownObjects: Readonly<Record<string, KnownObject>>;
  readonly visibleMovers: readonly SeenMover[];
  readonly visibleRivals: readonly SeenMover[];
  readonly visitedZones: readonly string[];
  /** Goal ids the robot has stood on. */
  readonly reached: readonly string[];
  /** Sim time until which what it carries cannot be tagged away: it has only just picked it up or taken it. */
  readonly safeUntilT: number;
  readonly memory: TriggerMemory;
  /** Set on the step in which something fired; cleared on the next. */
  readonly trigger?: LabTrigger;
  readonly status: AgentStatus;
  readonly dnfReason?: LabDnfReason;
  readonly endT?: number;
  readonly stats: AgentStats;
}

export interface LabObjectState {
  readonly id: string;
  /** Where it is now: its tile, or its carrier's. */
  readonly at: Cell;
  readonly status: 'idle' | 'carried' | 'delivered' | 'scanned';
  /** The robot that carries, delivered or scanned it. */
  readonly by?: string;
}

export interface MoverState {
  readonly id: string;
  /** Every tile of the loop, in order. */
  readonly route: readonly Cell[];
  readonly index: number;
  /** 0..1 towards the next tile of the route. */
  readonly progress: number;
}

export type LabEvent =
  | { readonly type: 'bump'; readonly t: number; readonly agentId: string; readonly at: Cell; readonly into: 'wall' | 'robot'; readonly damagePct: number; readonly blind: boolean }
  | { readonly type: 'door'; readonly t: number; readonly agentId: string; readonly at: Cell }
  | { readonly type: 'fell'; readonly t: number; readonly agentId: string; readonly at: Cell; readonly damagePct: number }
  | { readonly type: 'collision'; readonly t: number; readonly agentId: string; readonly moverId: string; readonly at: Cell; readonly damagePct: number }
  | { readonly type: 'blocked'; readonly t: number; readonly agentId: string; readonly at: Cell; readonly reason: string }
  /** `taken`: tagged away from another robot. `dropped`: left on the tile by a robot that was tagged or is out. */
  | { readonly type: 'picked' | 'delivered' | 'scanned' | 'dropped' | 'taken'; readonly t: number; readonly agentId: string; readonly objectId: string }
  | { readonly type: 'zone'; readonly t: number; readonly agentId: string; readonly zoneId: string }
  | { readonly type: 'weather'; readonly t: number; readonly label: string; readonly active: boolean }
  | { readonly type: 'ended'; readonly t: number; readonly agentId: string; readonly status: AgentStatus; readonly dnfReason?: LabDnfReason };

export interface LabState {
  readonly scenario: LabScenario;
  readonly seed: number;
  readonly t: number;
  readonly tick: number;
  readonly agents: readonly AgentState[];
  readonly objects: readonly LabObjectState[];
  readonly movers: readonly MoverState[];
  /** Tile indexes of the doors that have been opened. */
  readonly doorsOpen: readonly number[];
  /** Weather events with their seeded start times. */
  readonly weather: readonly LabWeatherDef[];
  /** Ids of the weather events in force. */
  readonly weatherActive: readonly string[];
  /** What happened in the last step. */
  readonly events: readonly LabEvent[];
  readonly done: boolean;
}

export interface LabEntry {
  readonly agentId: string;
  readonly build: Build;
  readonly policy?: Policy;
  readonly pace?: Pace;
}

export interface LabConfig {
  readonly scenario: LabScenario;
  readonly seed: number;
  readonly entries: readonly LabEntry[];
}
