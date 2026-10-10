// How a command is carried out between decisions. The last command holds (RR-BRAIN-V3, rule 2): the robot
// follows corridors and planned paths by itself and asks for a decision only when what it knows changes.
import type { SensorSource } from '@rivetrun/contracts';
import { LEFT, RIGHT, dirBetween, indexOf, inside, sameCell, stepCell } from './grid';
import { enterCost, navigate, pathTo, type NavContext } from './nav';
import type { AgentState, Cell, Dir, LabCommand, LabTrigger, TriggerMemory } from './types';

export const IDLE: LabCommand = { type: 'idle' };

export const SOURCE_LABEL: Readonly<Record<SensorSource, string>> = {
  core: 'CORE', imu: 'IMU', ultrasonic: 'ULTRASONIC', tof: 'TOF', lidar: 'LIDAR', camera: 'CAMERA', moisture_probe: 'PROBE', scout_drone: 'DRONE', bumper: 'BUMPER',
};

export interface Plan {
  readonly command: LabCommand;
  readonly memory: TriggerMemory;
  /** Drive one tile this way now. */
  readonly dir?: Dir;
  readonly interact?: { readonly objectId?: string };
  readonly waitS?: number;
  readonly trigger?: LabTrigger;
}

type Exit = 'free' | 'blocked' | 'unknown';

function exitTo(ctx: NavContext, cell: Cell): Exit {
  if (!inside(ctx.map, cell)) return 'blocked';
  const index = indexOf(ctx.map, cell);
  if (ctx.known[index] === undefined) return 'unknown';
  return enterCost(ctx, index) !== undefined ? 'free' : 'blocked';
}

interface Exits { readonly left: Exit; readonly ahead: Exit; readonly right: Exit }

const exitsAt = (ctx: NavContext, cell: Cell, dir: Dir): Exits => ({
  left: exitTo(ctx, stepCell(cell, LEFT[dir])),
  ahead: exitTo(ctx, stepCell(cell, dir)),
  right: exitTo(ctx, stepCell(cell, RIGHT[dir])),
});

/** What is open to the left, ahead and right, as the robot knows it. A junction is announced when this changes. */
export function signature(ctx: NavContext, cell: Cell, dir: Dir): string {
  const exits = exitsAt(ctx, cell, dir);
  return `${exits.left[0]}${exits.ahead[0]}${exits.right[0]}`;
}

/** True for the tile a mover in view is on and the tile it is heading for: driving onto either is how a robot gets hit. */
const moverAt = (agent: AgentState, cell: Cell): boolean =>
  agent.visibleMovers.some((mover) => sameCell(mover.cell, cell) || (mover.next !== undefined && sameCell(mover.next, cell)));

const moverTiles = (ctx: NavContext, agent: AgentState): Set<number> =>
  new Set(agent.visibleMovers.flatMap((mover) => [mover.cell, ...(mover.next ? [mover.next] : [])]).filter((cell) => inside(ctx.map, cell)).map((cell) => indexOf(ctx.map, cell)));

const moverAhead = (agent: AgentState): LabTrigger => {
  const mover = agent.visibleMovers[0];
  return { kind: 'perception', cause: 'mover_ahead', ...(mover ? { source: mover.via } : {}), label: `${mover ? SOURCE_LABEL[mover.via] : 'CORE'} · the way is blocked by something moving` };
};

function planHeading(ctx: NavContext, agent: AgentState, dir: Dir): Plan {
  const command: LabCommand = { type: 'heading', dir };
  const exits = exitsAt(ctx, agent.cell, dir);
  const memory = { ...agent.memory, signature: `${exits.left[0]}${exits.ahead[0]}${exits.right[0]}` };
  const via = (side: Dir): SensorSource | undefined => ctx.known[indexOf(ctx.map, stepCell(agent.cell, side))]?.via;
  const open = [exits.left === 'free' ? 'left' : '', exits.ahead === 'free' ? 'ahead' : '', exits.right === 'free' ? 'right' : ''].filter(Boolean);
  const source = via(exits.left === 'free' ? LEFT[dir] : RIGHT[dir]);
  const junction: LabTrigger = { kind: 'perception', cause: 'junction_reached', ...(source ? { source } : {}), label: `${SOURCE_LABEL[source ?? 'core']} · junction: ${open.join(' and ')} open` };

  if (exits.ahead !== 'blocked') {
    if (moverAt(agent, stepCell(agent.cell, dir))) {
      return { command, memory: { ...memory, heldForMover: true }, ...(agent.memory.heldForMover ? {} : { trigger: moverAhead(agent) }) };
    }
    // A side opening that was not there one tile ago: a choice. The robot keeps going until told otherwise.
    const sideOpened = memory.signature !== agent.memory.signature && (exits.left === 'free' || exits.right === 'free');
    return { command, memory: { ...memory, heldForMover: false }, dir, ...(sideOpened ? { trigger: junction } : {}) };
  }
  // The way ahead is closed. A corner has one way on: take it without asking.
  const corner = exits.left === 'free' && exits.right === 'blocked' ? LEFT[dir] : exits.right === 'free' && exits.left === 'blocked' ? RIGHT[dir] : undefined;
  if (corner !== undefined) return { command: { type: 'heading', dir: corner }, memory: { ...memory, signature: signature(ctx, agent.cell, corner) }, dir: corner };
  if (exits.left === 'free' && exits.right === 'free') return { command: IDLE, memory, trigger: junction };
  const ahead = via(dir);
  if (exits.left === 'blocked' && exits.right === 'blocked') {
    return { command: IDLE, memory, trigger: { kind: 'perception', cause: 'dead_end', ...(ahead ? { source: ahead } : {}), label: `${SOURCE_LABEL[ahead ?? 'core']} · dead end` } };
  }
  return { command: IDLE, memory, trigger: { kind: 'perception', cause: 'wall_ahead', ...(ahead ? { source: ahead } : {}), label: `${SOURCE_LABEL[ahead ?? 'core']} · the way ahead is closed` } };
}

function planGoto(ctx: NavContext, agent: AgentState, command: Extract<LabCommand, { type: 'goto' }>): Plan {
  const { memory } = agent;
  if (sameCell(agent.cell, command.to)) {
    if (command.interact !== undefined) return { command: IDLE, memory, interact: { objectId: command.interact } };
    if (command.thenHeading !== undefined) {
      // The edge of the explored map: carry on into the unknown.
      const arrived = { ...agent, memory: { ...memory, signature: signature(ctx, agent.cell, command.thenHeading) } };
      return planHeading(ctx, arrived, command.thenHeading);
    }
    return { command: IDLE, memory, trigger: { kind: 'perception', cause: 'target_reached', label: 'CORE · arrived' } };
  }
  // Keep out of the tiles where something is moving, as long as it is in view; and drive round another robot
  // rather than into it, unless there is no other way or it is the robot being chased.
  const avoid = moverTiles(ctx, agent);
  const target = indexOf(ctx.map, command.to);
  const rivals = agent.visibleRivals.map((rival) => indexOf(ctx.map, rival.cell)).filter((index) => index !== target);
  const round = rivals.length > 0 ? pathTo(navigate({ ...ctx, avoid: new Set([...avoid, ...rivals]) }, agent.cell), ctx.map, command.to) : undefined;
  const path = round ?? pathTo(navigate({ ...ctx, avoid }, agent.cell), ctx.map, command.to);
  const next = path?.[0];
  if (next !== undefined) return { command, memory: { ...memory, heldForMover: false }, dir: dirBetween(agent.cell, next)! };
  if (avoid.size > 0 && pathTo(navigate(ctx, agent.cell), ctx.map, command.to) !== undefined) {
    return { command, memory: { ...memory, heldForMover: true }, ...(memory.heldForMover ? {} : { trigger: moverAhead(agent) }) };
  }
  return { command: IDLE, memory, trigger: { kind: 'body', cause: 'blocked', label: 'CORE · no known way to the target' } };
}

/** The next thing the robot does under its command, from what it knows. Pure. */
export function planNext(ctx: NavContext, agent: AgentState): Plan {
  const { command, memory } = agent;
  switch (command.type) {
    case 'idle': return { command, memory };
    // The engine drops the command once the tile is under way, so a door opened on the way does not cancel the step.
    case 'step': return { command, memory, dir: command.dir };
    case 'interact': return { command: IDLE, memory, interact: { ...(command.objectId !== undefined ? { objectId: command.objectId } : {}) } };
    case 'wait': return { command: IDLE, memory, waitS: command.forS };
    case 'heading': return planHeading(ctx, agent, command.dir);
    case 'goto': return planGoto(ctx, agent, command);
  }
}
