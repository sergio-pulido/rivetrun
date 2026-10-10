// What a robot has a reason to go to, from what it knows. Shared by the question builder and the energy line.
import type { SensorSource } from '@rivetrun/contracts';
import { cellAt, manhattan } from './grid';
import { canSense, defOf, destinationsOf, finalGoal, hasRole, objectiveStatus } from './objectives';
import type { AgentState, Cell, LabObjectDef, LabState } from './types';

/** Objects the robot knows of and still has business with. */
export function openObjects(state: LabState, agent: AgentState): { def: LabObjectDef; at: Cell; via: SensorSource }[] {
  return Object.entries(agent.knownObjects).flatMap(([id, known]) => {
    const object = state.objects.find((o) => o.id === id)!;
    // Its own doing is known to it: what it carries, delivered or scanned needs no further line.
    if (object.by === agent.id && object.status !== 'idle') return [];
    return [{ def: defOf(state.scenario, id), at: known.at, via: known.via }];
  });
}

export interface Want {
  /** The option's id. */
  readonly id: string;
  readonly at: Cell;
  readonly kind: 'objective' | 'return';
  readonly label: string;
  readonly description: string;
  /** Interact with this object on arrival; absent = being there is enough. */
  readonly interact?: string;
  readonly completes?: boolean;
  /** A job to plan the order of: `jobTo` is where it leaves the robot (the bay a parcel goes to; absent = the same tile). */
  readonly job?: 'start' | 'finish';
  readonly jobTo?: Cell;
}

/**
 * What the mission still needs that the robot has not found. `find`: something is out there to find. `look`: it can
 * only be found by looking at the floor (a parcel, a sample, a checkpoint), not by mapping walls; an exit is a gap
 * in the wall, which a ranger finds too. The mission plan says how many things there are, not where.
 */
export function seeking(state: LabState, agent: AgentState): { find: boolean; look: boolean } {
  const { scenario } = state;
  const statuses = objectiveStatus(state, agent);
  const unknown = (id: string): boolean => agent.knownObjects[id] === undefined;
  const goal = finalGoal(scenario, agent.id);
  const goalHidden = goal !== undefined && unknown(goal.id) && scenario.objectives.some((objective, i) => objective.type === 'reach' && !statuses[i]!.done);
  const depotHidden = agent.carrying.some((id) => destinationsOf(scenario, defOf(scenario, id), agent.id).every((depot) => unknown(depot.id)));
  // Things the build could not pick up or scan anyway are not worth looking for.
  const thingHidden = scenario.objectives.some((objective, i) =>
    !statuses[i]!.done && (objective.type === 'deliver' || objective.type === 'collect' || objective.type === 'scan')
    && state.objects.some((object) => { const def = defOf(scenario, object.id); return object.status === 'idle' && def.kind === objective.kind && unknown(object.id) && canSense(def, agent); }));
  const look = depotHidden || thingHidden || (goalHidden && goal.kind !== 'exit');
  return { find: look || goalHidden, look };
}

/** The known places the robot has a reason to go to now. */
export function wants(state: LabState, agent: AgentState): Want[] {
  const { scenario } = state;
  const known = openObjects(state, agent);
  const statuses = objectiveStatus(state, agent);
  const open = (type: string, kind?: string): boolean => scenario.objectives.some((o, i) => o.type === type && (kind === undefined || ('kind' in o && o.kind === kind)) && !statuses[i]!.done);
  const found: Want[] = [];
  for (const id of agent.carrying) {
    const item = defOf(scenario, id);
    for (const depot of destinationsOf(scenario, item, agent.id)) {
      const at = agent.knownObjects[depot.id]?.at;
      if (at !== undefined) found.push({ id: `goto:${depot.id}`, at, kind: 'objective', label: `Deliver ${item.label} to ${depot.label}`, description: `carrying ${item.label}`, interact: depot.id, job: 'finish' });
    }
  }
  for (const { def, at } of known) {
    const wanted = open('deliver', def.kind) || open('collect', def.kind);
    if (hasRole(def, 'item') && wanted && canSense(def, agent) && agent.carrying.length < scenario.carryLimit) {
      const depot = destinationsOf(scenario, def, agent.id).map((d) => agent.knownObjects[d.id]?.at).find((cell) => cell !== undefined);
      found.push({
        id: `goto:${def.id}`, at, kind: 'objective', label: `Go and ${def.kind === 'sample' ? 'take' : 'pick up'} ${def.label}`, description: `${def.kind} for the mission`,
        interact: def.id, job: 'start', ...(depot ? { jobTo: depot } : {}),
      });
    }
    if (hasRole(def, 'check') && open('scan', def.kind) && canSense(def, agent)) {
      found.push({ id: `goto:${def.id}`, at, kind: 'objective', label: `Go and scan ${def.label}`, description: 'a checkpoint to scan', interact: def.id, job: 'start' });
    }
  }
  // Something the robot is after, in another robot's hands. Who holds what is public (the referee says so);
  // where that robot is, only the sensors can tell.
  if (scenario.tagSteals && agent.carrying.length < scenario.carryLimit) {
    for (const object of state.objects) {
      const def = defOf(scenario, object.id);
      const holder = object.status === 'carried' && object.by !== agent.id ? state.agents.find((a) => a.id === object.by) : undefined;
      if (holder === undefined || !(open('deliver', def.kind) || open('collect', def.kind))) continue;
      const seen = agent.visibleRivals.find((rival) => rival.id === holder.id);
      const base = destinationsOf(scenario, def, holder.id)[0];
      const baseAt = base !== undefined ? agent.knownObjects[base.id]?.at : undefined;
      if (seen !== undefined) found.push({ id: `tag:${holder.id}`, at: seen.cell, kind: 'objective', label: `Tag ${holder.label} and take ${def.label}`, description: `${holder.label} is in view with ${def.label}` });
      else if (base !== undefined && baseAt !== undefined) found.push({ id: `goto:${base.id}`, at: baseAt, kind: 'objective', label: `Cut ${holder.label} off at ${base.label}`, description: `${holder.label} holds ${def.label} and is out of view` });
    }
  }
  const goal = finalGoal(scenario, agent.id);
  const goalAt = goal !== undefined ? agent.knownObjects[goal.id]?.at : undefined;
  const reach = scenario.objectives.find((o) => o.type === 'reach');
  if (goal !== undefined && goalAt !== undefined && reach?.type === 'reach') {
    const othersDone = statuses.every((s, i) => s.done || scenario.objectives[i] === reach);
    const done = statuses.filter((s) => s.done).length;
    if (!reach.last || othersDone) found.push({ id: `goto:${goal.id}`, at: goalAt, kind: 'return', label: `Go to ${goal.label}`, description: 'completes the mission', completes: true });
    else found.push({ id: `goto:${goal.id}`, at: goalAt, kind: 'return', label: `Go to ${goal.label} and end the mission`, description: `ends it with ${done} of ${statuses.length} objectives done`, interact: goal.id, completes: false });
  }
  return found;
}

/** Known ways are longer than straight lines: aisles, corners, a door to go round to. */
const DETOUR = 1.25;

/**
 * Tiles of driving the known work still takes, as a rough tour: what is in hand to its depot, then the nearest
 * known thing to pick up or scan and on to where it goes, the rooms still to enter, and last the way to the end
 * point. Straight-line distances stretched by a quarter. 0 = the robot knows of nothing left to do.
 */
export function knownWorkTiles(state: LabState, agent: AgentState): number {
  const { scenario } = state;
  const statuses = objectiveStatus(state, agent);
  const at = (id: string): Cell | undefined => agent.knownObjects[id]?.at;
  let here = agent.cell;
  let tiles = 0;
  const go = (to: Cell | undefined): void => {
    if (to === undefined) return;
    tiles += manhattan(here, to);
    here = to;
  };
  const depotOf = (item: LabObjectDef): Cell | undefined => destinationsOf(scenario, item, agent.id).map((depot) => at(depot.id)).find((cell) => cell !== undefined);
  for (const id of agent.carrying) go(depotOf(defOf(scenario, id)));

  // Each open objective names a kind and how many more of it are needed.
  const stops: { def: LabObjectDef; cell: Cell }[] = [];
  scenario.objectives.forEach((objective, i) => {
    const status = statuses[i]!;
    if (status.done || objective.type === 'reach' || objective.type === 'visit') return;
    const role = objective.type === 'scan' ? 'check' : 'item';
    const known = openObjects(state, agent)
      .filter(({ def }) => def.kind === objective.kind && hasRole(def, role) && canSense(def, agent) && state.objects.find((o) => o.id === def.id)?.status === 'idle')
      .map(({ def, at: cell }) => ({ def, cell }));
    const carried = objective.type === 'deliver' ? agent.carrying.filter((id) => defOf(scenario, id).kind === objective.kind).length : 0;
    stops.push(...known.sort((a, b) => manhattan(agent.cell, a.cell) - manhattan(agent.cell, b.cell)).slice(0, Math.max(0, status.need - status.have - carried)));
  });
  while (stops.length > 0) {
    stops.sort((a, b) => manhattan(here, a.cell) - manhattan(here, b.cell));
    const next = stops.shift()!;
    go(next.cell);
    if (hasRole(next.def, 'item')) go(depotOf(next.def));
  }
  if (scenario.objectives.some((objective, i) => objective.type === 'visit' && !statuses[i]!.done)) {
    for (const zone of scenario.zones.filter((z) => !agent.visitedZones.includes(z.id))) go(cellAt(scenario.map, zone.cells[Math.floor(zone.cells.length / 2)]!));
  }
  const goal = finalGoal(scenario, agent.id);
  if (goal !== undefined && scenario.objectives.some((objective, i) => objective.type === 'reach' && !statuses[i]!.done)) go(at(goal.id));
  return Math.round(tiles * DETOUR);
}
