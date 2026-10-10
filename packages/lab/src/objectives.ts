// What a robot is there to do, how far it has got, and what it can do on the tile it stands on.
import { sameCell } from './grid';
import { LAB_TUNING } from './robot';
import type { AgentState, LabObjectDef, LabObjectKind, LabObjectRole, LabScenario, LabState } from './types';

const ROLES: Readonly<Record<LabObjectKind, readonly LabObjectRole[]>> = {
  exit: ['goal'],
  lander: ['goal', 'depot'],
  home: ['goal', 'depot'],
  bay: ['depot'],
  parcel: ['item'],
  sample: ['item'],
  flag: ['item'],
  checkpoint: ['check'],
};

export const hasRole = (def: LabObjectDef, role: LabObjectRole): boolean => ROLES[def.kind].includes(role);

export function defOf(scenario: LabScenario, id: string): LabObjectDef {
  const def = scenario.objects.find((object) => object.id === id);
  if (!def) throw new Error(`@rivetrun/lab: unknown object "${id}" in scenario "${scenario.id}"`);
  return def;
}

/** True for objects that are this robot's or nobody's. */
const mine = (def: LabObjectDef, agentId: string): boolean => def.owner === undefined || def.owner === agentId;

/** The robot carries a sensor the object needs, or the object needs none. */
export const canSense = (def: LabObjectDef, agent: AgentState): boolean =>
  def.needs === undefined || def.needs.some((kind) => agent.robot.suite.kinds.includes(kind));

/** Where this robot must take an item. */
export function destinationsOf(scenario: LabScenario, item: LabObjectDef, agentId: string): LabObjectDef[] {
  return scenario.objects.filter((object) =>
    hasRole(object, 'depot') && mine(object, agentId) && (object.id === item.destId || (item.destKind !== undefined && object.kind === item.destKind)));
}

/** The objects a `reach` objective means for this robot: one by id, or its own of a kind. */
function reachTargets(scenario: LabScenario, target: string, agentId: string): LabObjectDef[] {
  return scenario.objects.filter((object) => hasRole(object, 'goal') && mine(object, agentId) && (object.id === target || object.kind === target));
}

/** Where the mission ends for this robot: the target of its last `reach` objective. */
export function finalGoal(scenario: LabScenario, agentId: string): LabObjectDef | undefined {
  const reach = [...scenario.objectives].reverse().find((objective) => objective.type === 'reach');
  return reach?.type === 'reach' ? reachTargets(scenario, reach.target, agentId)[0] : undefined;
}

export interface ObjectiveStatus {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
  /** Units done and needed: parcels delivered, rooms visited. */
  readonly have: number;
  readonly need: number;
}

export function objectiveStatus(state: LabState, agent: AgentState): ObjectiveStatus[] {
  const { scenario } = state;
  const ofKind = (kind: LabObjectKind): typeof state.objects => state.objects.filter((object) => defOf(scenario, object.id).kind === kind);
  const counted = scenario.objectives.map((objective): ObjectiveStatus | undefined => {
    const unit = (have: number, need: number): ObjectiveStatus => ({ id: objective.id, label: objective.label, have: Math.min(have, need), need, done: have >= need });
    switch (objective.type) {
      case 'deliver': return unit(ofKind(objective.kind).filter((o) => o.status === 'delivered' && o.by === agent.id).length, ofKind(objective.kind).length);
      case 'collect': return unit(ofKind(objective.kind).filter((o) => (o.status === 'carried' || o.status === 'delivered') && o.by === agent.id).length, objective.count);
      case 'scan': return unit(ofKind(objective.kind).filter((o) => o.status === 'scanned' && o.by === agent.id).length, ofKind(objective.kind).length);
      case 'visit': return unit(agent.visitedZones.length, scenario.zones.length);
      case 'reach': return objective.last ? undefined : unit(reachTargets(scenario, objective.target, agent.id).some((o) => agent.reached.includes(o.id)) ? 1 : 0, 1);
    }
  });
  const othersDone = counted.every((status) => status === undefined || status.done);
  return scenario.objectives.map((objective, i): ObjectiveStatus => {
    const status = counted[i];
    if (status !== undefined) return status;
    // A closing `reach`: being there counts only once everything else is done.
    const there = objective.type === 'reach' && reachTargets(scenario, objective.target, agent.id).some((o) => sameCell(o.at, agent.cell));
    const done = othersDone && there && agent.move === undefined;
    return { id: objective.id, label: objective.label, have: done ? 1 : 0, need: 1, done };
  });
}

export const objectivesDone = (state: LabState, agent: AgentState): boolean => objectiveStatus(state, agent).every((status) => status.done);

/** Share of the mission done, 0–1, counted in units (each parcel, each room, each goal). */
export function completion(state: LabState, agent: AgentState): number {
  const statuses = objectiveStatus(state, agent);
  const need = statuses.reduce((sum, status) => sum + status.need, 0);
  return need === 0 ? 1 : statuses.reduce((sum, status) => sum + status.have, 0) / need;
}

export interface Interaction {
  /** finish = end the mission here with what has been done so far. */
  readonly kind: 'pick' | 'drop' | 'scan' | 'finish';
  readonly objectId: string;
  readonly label: string;
  readonly holdS: number;
}

/** What the robot can do on the tile it stands on, most useful first. */
export function interactionsAt(state: LabState, agent: AgentState): Interaction[] {
  const { scenario } = state;
  const here = state.objects.filter((object) => sameCell(object.at, agent.cell) && agent.knownObjects[object.id] !== undefined);
  const carried = agent.carrying.map((id) => defOf(scenario, id));
  const found: Interaction[] = [];
  for (const object of here) {
    const def = defOf(scenario, object.id);
    const accepts = carried.filter((item) => destinationsOf(scenario, item, agent.id).some((depot) => depot.id === def.id));
    if (hasRole(def, 'depot') && accepts.length > 0) {
      found.push({ kind: 'drop', objectId: def.id, label: `Deliver ${accepts.map((item) => item.label).join(' and ')} to ${def.label}`, holdS: LAB_TUNING.dropS });
    }
  }
  for (const object of here) {
    const def = defOf(scenario, object.id);
    if (hasRole(def, 'item') && object.status === 'idle' && canSense(def, agent) && agent.carrying.length < scenario.carryLimit) {
      found.push({ kind: 'pick', objectId: def.id, label: `${def.kind === 'sample' ? 'Take' : 'Pick up'} ${def.label}`, holdS: def.kind === 'sample' ? LAB_TUNING.sampleS : LAB_TUNING.pickS });
    }
    if (hasRole(def, 'check') && object.status === 'idle' && canSense(def, agent)) {
      found.push({ kind: 'scan', objectId: def.id, label: `Scan ${def.label}`, holdS: LAB_TUNING.scanS });
    }
  }
  const goal = finalGoal(scenario, agent.id);
  const closing = scenario.objectives.some((objective) => objective.type === 'reach' && objective.last);
  if (closing && goal !== undefined && sameCell(goal.at, agent.cell) && !objectivesDone(state, agent)) {
    const statuses = objectiveStatus(state, agent);
    found.push({ kind: 'finish', objectId: goal.id, label: `End the mission here (${statuses.filter((s) => s.done).length} of ${statuses.length} objectives done)`, holdS: 0 });
  }
  return found;
}

/** Why something on this tile cannot be used, e.g. a soil sample without the probe. For the HUD and the question. */
export function interactionBlockers(state: LabState, agent: AgentState): string[] {
  const { scenario } = state;
  return state.objects.flatMap((object) => {
    const def = defOf(scenario, object.id);
    if (!sameCell(object.at, agent.cell) || object.status !== 'idle' || agent.knownObjects[object.id] === undefined) return [];
    if ((hasRole(def, 'item') || hasRole(def, 'check')) && !canSense(def, agent)) return [`${def.label}: needs ${(def.needs ?? []).join(' or ')}, not fitted`];
    if (hasRole(def, 'item') && agent.carrying.length >= scenario.carryLimit) return [`${def.label}: already carrying ${agent.carrying.length}`];
    return [];
  });
}
