// What a brain is told and what it may choose. Built from the robot's own map, its sensors and the core kit:
// never from the scenario's ground truth (RR-BRAIN-V3, rule 1).
import type { SensorSource } from '@rivetrun/contracts';
import { SOURCE_LABEL } from './autopilot';
import { energyView, navContextOf } from './context';
import { DIRS, DIR_NAME, bearing, cellAt, indexOf, inside, manhattan, sameCell, stepCell } from './grid';
import { enterCost, frontiers, navigate, type Nav, type NavContext } from './nav';
import { canSense, defOf, destinationsOf, finalGoal, hasRole, interactionBlockers, interactionsAt, objectiveStatus } from './objectives';
import { PACE, rangeTiles, type Pace } from './robot';
import { LAB_VERSION, type LabObservation, type LabOption, type LabPrediction, type LabQuestion } from './schema';
import { knownShare, weatherFactor } from './sensing';
import type { AgentState, Cell, Dir, LabCommand, LabObjectDef, LabState, LabTrigger } from './types';

const round1 = (value: number): number => Math.round(value * 10) / 10;
const WAIT_S = 2;
const MAX_RUN = 30;

type RunEnd = LabObservation['around']['N']['then'];

/** How far the robot can drive in a direction as far as it knows, and what stops it. */
function runFrom(ctx: NavContext, from: Cell, dir: Dir): { free: number; then: RunEnd } {
  let cell = from;
  for (let free = 0; free < MAX_RUN; free += 1) {
    cell = stepCell(cell, dir);
    if (!inside(ctx.map, cell)) return { free, then: 'wall' };
    const tile = ctx.known[indexOf(ctx.map, cell)];
    if (tile === undefined) return { free, then: 'unexplored' };
    if (tile.kind === 'drop') return { free, then: 'drop' };
    if (tile.blocked && tile.kind === 'door') return { free, then: 'door' };
    if (enterCost(ctx, indexOf(ctx.map, cell)) === undefined) return { free, then: 'wall' };
  }
  return { free: MAX_RUN, then: 'unexplored' };
}

/** The source the robot's knowledge of its surroundings mostly comes from, for the line's prefix. */
function surroundSource(agent: AgentState): SensorSource {
  const { suite } = agent.robot;
  return suite.lidarM > 0 ? 'lidar' : suite.droneM > 0 ? 'scout_drone' : suite.cameraM > 0 ? 'camera' : suite.tofM > 0 ? 'tof' : suite.ultrasonic ? 'ultrasonic' : 'core';
}

/** Objects the robot knows of and still has business with. */
function openObjects(state: LabState, agent: AgentState): { def: LabObjectDef; at: Cell; via: SensorSource }[] {
  return Object.entries(agent.knownObjects).flatMap(([id, known]) => {
    const object = state.objects.find((o) => o.id === id)!;
    // Its own doing is known to it: what it carries, delivered or scanned needs no further line.
    if (object.by === agent.id && object.status !== 'idle') return [];
    return [{ def: defOf(state.scenario, id), at: known.at, via: known.via }];
  });
}

export function observeLab(state: LabState, agentId: string): LabObservation {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`@rivetrun/lab: no robot "${agentId}"`);
  const { scenario } = state;
  const { suite } = agent.robot;
  const ctx = navContextOf(state, agent);
  const energy = energyView(state, agent);
  const blind = !suite.ultrasonic && suite.tofM === 0 && suite.lidarM === 0 && suite.cameraM === 0 && suite.droneM === 0;
  const eyes = suite.cameraM > 0 || suite.droneM > 0;
  const around = { N: runFrom(ctx, agent.cell, 'N'), E: runFrom(ctx, agent.cell, 'E'), S: runFrom(ctx, agent.cell, 'S'), W: runFrom(ctx, agent.cell, 'W') };
  const exploredPct = Math.round(knownShare(agent) * 100);
  const sighting = (id: string, label: string, at: Cell, source: SensorSource): LabObservation['objects'][number] =>
    ({ id, label, tiles: manhattan(at, agent.cell), bearing: bearing(agent.cell, at), source });
  const objects = openObjects(state, agent).map(({ def, at, via }) => sighting(def.id, def.label, at, via));
  const moving = [
    ...agent.visibleMovers.map((m) => sighting(m.id, m.labelled ? scenario.movers.find((def) => def.id === m.id)!.label : 'Something moving', m.cell, m.via)),
    ...agent.visibleRivals.map((r) => sighting(r.id, r.labelled ? state.agents.find((a) => a.id === r.id)!.label : 'Something moving', r.cell, r.via)),
  ];
  const here = agent.known[indexOf(scenario.map, agent.cell)];
  const statuses = objectiveStatus(state, agent);

  const way = energy.returnPct !== undefined ? `, ${energy.marginPct} % to spare after the way to the end` : '';
  const describe = (run: { free: number; then: RunEnd }): string => (run.free === 0 ? run.then : `${run.free} free then ${run.then}`);
  const lines = [
    `CORE · battery ${energy.batteryPct} %, about ${energy.rangeTiles} tiles of range at ${agent.pace} pace${way}`,
    `CORE · ${statuses.map((s) => `${s.label} ${s.have}/${s.need}`).join(' · ')}`,
    ...(agent.carrying.length > 0 ? [`CORE · carrying ${agent.carrying.map((id) => defOf(scenario, id).label).join(', ')}`] : []),
    // Who holds what is public: the referee announces it. Where they are is not.
    ...state.objects.flatMap((o) => (o.status === 'carried' && o.by !== agent.id ? [`CORE · ${state.agents.find((a) => a.id === o.by)?.label ?? 'another robot'} holds ${defOf(scenario, o.id).label}`] : [])),
    `${blind ? 'BLIND' : SOURCE_LABEL[surroundSource(agent)]} · ${DIRS.map((dir) => `${DIR_NAME[dir]} ${describe(around[dir])}`).join(' · ')}`,
    ...objects.map((o) => `${SOURCE_LABEL[o.source]} · ${o.label}, ${o.tiles === 0 ? 'here' : `${o.tiles} tiles ${o.bearing}`}`),
    ...moving.map((m) => `${SOURCE_LABEL[m.source]} · ${m.label.toLowerCase()}, ${m.tiles} tiles ${m.bearing}`),
    ...(suite.imu ? [`IMU · ${here?.kind === 'ramp' ? `on a ramp of ${here.slopeDeg ?? 0}°` : 'level'}`] : []),
    ...(eyes && state.weatherActive.length > 0
      ? [`${suite.cameraM > 0 ? 'CAMERA' : 'DRONE'} · sees ${rangeTiles(suite.cameraM || suite.droneM, weatherFactor(state, suite.cameraM > 0 ? 'camera' : 'scout_drone'), scenario.tileM)} tiles in this weather`]
      : []),
  ];
  const unknown = [
    ...(blind ? ['what is around the robot: no distance sensor and no camera, so walls are found by driving into them'] : []),
    ...(eyes ? [] : ['what things are (doors aside): no camera or drone, so parcels, drops and the ground type go unseen until the robot is on them']),
    ...(suite.imu ? [] : ['slope under the robot: no IMU']),
    ...(exploredPct < 100 ? [`${100 - exploredPct} % of the map: not sensed yet`] : []),
    ...interactionBlockers(state, agent),
  ];
  return {
    sources: [...suite.sources], t: state.t, cell: agent.cell, heading: agent.heading, pace: agent.pace, speedMps: round1(agent.speedMps), drawW: round1(agent.drawW),
    damagePct: round1(agent.damagePct),
    energy: { batteryPct: energy.batteryPct, ...(energy.returnPct !== undefined ? { projectedPct: energy.marginPct } : {}), rangeTiles: energy.rangeTiles },
    carrying: agent.carrying.map((id) => defOf(scenario, id).label), objectives: statuses, blind, around, exploredPct, objects, moving,
    tiltDeg: suite.imu ? (here?.kind === 'ramp' ? (here.slopeDeg ?? 0) : 0) : 'unknown',
    unknown, lines,
  };
}

const sameCommand = (a: LabCommand, b: LabCommand): boolean =>
  a.type === 'goto' && b.type === 'goto' ? sameCell(a.to, b.to) && a.interact === b.interact && a.thenHeading === b.thenHeading : a.type === 'heading' && b.type === 'heading' && a.dir === b.dir;

interface Want {
  /** The option's id. */
  readonly id: string;
  readonly at: Cell;
  readonly kind: 'objective' | 'return';
  readonly label: string;
  readonly description: string;
  /** Interact with this object on arrival; absent = being there is enough. */
  readonly interact?: string;
  readonly completes?: boolean;
}

/**
 * What the mission still needs that the robot has not found. `find`: something is out there to find. `look`: it can
 * only be found by looking at the floor (a parcel, a sample, a checkpoint), not by mapping walls; an exit is a gap
 * in the wall, which a ranger finds too. The mission plan says how many things there are, not where.
 */
function seeking(state: LabState, agent: AgentState): { find: boolean; look: boolean } {
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
function wants(state: LabState, agent: AgentState): Want[] {
  const { scenario } = state;
  const known = openObjects(state, agent);
  const statuses = objectiveStatus(state, agent);
  const open = (type: string, kind?: string): boolean => scenario.objectives.some((o, i) => o.type === type && (kind === undefined || ('kind' in o && o.kind === kind)) && !statuses[i]!.done);
  const found: Want[] = [];
  for (const id of agent.carrying) {
    const item = defOf(scenario, id);
    for (const depot of destinationsOf(scenario, item, agent.id)) {
      const at = agent.knownObjects[depot.id]?.at;
      if (at !== undefined) found.push({ id: `goto:${depot.id}`, at, kind: 'objective', label: `Deliver ${item.label} to ${depot.label}`, description: `carrying ${item.label}`, interact: depot.id });
    }
  }
  for (const { def, at } of known) {
    const wanted = open('deliver', def.kind) || open('collect', def.kind);
    if (hasRole(def, 'item') && wanted && canSense(def, agent) && agent.carrying.length < scenario.carryLimit) {
      found.push({ id: `goto:${def.id}`, at, kind: 'objective', label: `Go and ${def.kind === 'sample' ? 'take' : 'pick up'} ${def.label}`, description: `${def.kind} for the mission`, interact: def.id });
    }
    if (hasRole(def, 'check') && open('scan', def.kind) && canSense(def, agent)) {
      found.push({ id: `goto:${def.id}`, at, kind: 'objective', label: `Go and scan ${def.label}`, description: 'a checkpoint to scan', interact: def.id });
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

function predict(agent: AgentState, nav: Nav, index: number, backWh: number | undefined, defaultTerrain: string): LabPrediction {
  const capacityWh = agent.robot.spec.capacityWh;
  const energyPct = (nav.energyWh[index]! / capacityWh) * 100;
  const batteryAfterPct = agent.batteryPct - energyPct;
  const marginAfterPct = backWh !== undefined && Number.isFinite(backWh) ? batteryAfterPct - (backWh / capacityWh) * 100 : undefined;
  const risk = batteryAfterPct <= 0 ? 'not enough charge to get there'
    : marginAfterPct !== undefined && marginAfterPct <= 0 ? 'not enough charge to get to the end afterwards'
    : nav.assumed[index] ? `crosses ground not seen yet (assumed ${defaultTerrain})` : undefined;
  return {
    steps: nav.tiles[index]!, timeS: round1(nav.timeS[index]!), energyPct: round1(energyPct), batteryAfterPct: round1(batteryAfterPct),
    ...(marginAfterPct !== undefined ? { marginAfterPct: round1(marginAfterPct) } : {}),
    ...(nav.assumed[index] ? { assumed: true } : {}),
    ...(risk !== undefined ? { risk } : {}),
  };
}

/** The named moves the build can make now, each with what the robot expects of it. */
export function buildOptions(state: LabState, agentId: string, trigger?: LabTrigger): LabOption[] {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent || agent.status !== 'running') return [];
  const { scenario } = state;
  const { map } = scenario;
  const ctx = navContextOf(state, agent);
  const nav = navigate(ctx, agent.cell);
  const goal = finalGoal(scenario, agent.id);
  const goalAt = goal !== undefined ? agent.knownObjects[goal.id]?.at : undefined;
  // Cost of the way on to the end point from anywhere, taken as the cost of the way from it.
  const back = goalAt !== undefined ? navigate(ctx, goalAt) : undefined;
  const backWh = (index: number): number | undefined => back?.energyWh[index];
  const options: LabOption[] = [];
  const add = (option: LabOption): void => {
    if (!options.some((o) => o.id === option.id)) options.push(option.command && sameCommand(option.command, agent.command) ? { ...option, current: true } : option);
  };

  for (const interaction of interactionsAt(state, agent)) {
    add({
      id: `do:${interaction.objectId}`, kind: interaction.kind === 'finish' ? 'return' : 'interact', label: interaction.label,
      description: interaction.kind === 'finish' ? 'ends the mission now with what is done' : `on this tile, ${interaction.holdS} s`,
      command: { type: 'interact', objectId: interaction.objectId }, predicted: { steps: 0, timeS: interaction.holdS },
      ...(interaction.kind === 'finish' ? { completes: false } : {}),
    });
  }

  const wanted = wants(state, agent);
  const noWay: Cell[] = [];
  for (const want of wanted) {
    const index = indexOf(map, want.at);
    if (sameCell(want.at, agent.cell)) continue;
    if (!Number.isFinite(nav.timeS[index]!)) { noWay.push(want.at); continue; }
    const predicted = predict(agent, nav, index, want.kind === 'return' ? 0 : backWh(index), scenario.defaultTerrain);
    add({
      id: want.id, kind: want.kind, label: want.label, description: `${predicted.steps} tiles by the known way; ${want.description}`,
      command: { type: 'goto', to: want.at, ...(want.interact !== undefined ? { interact: want.interact } : {}) },
      predicted, ...(want.completes !== undefined ? { completes: want.completes } : {}),
    });
  }

  // Rooms still to enter. The mission plan says where they are; the way in has to be on the robot's own map.
  if (scenario.objectives.some((objective) => objective.type === 'visit')) {
    for (const zone of scenario.zones.filter((z) => !agent.visitedZones.includes(z.id))) {
      const index = zone.cells.filter((cell) => Number.isFinite(nav.timeS[cell]!)).sort((a, b) => nav.timeS[a]! - nav.timeS[b]!)[0];
      if (index === undefined) { noWay.push(cellAt(map, zone.cells[Math.floor(zone.cells.length / 2)]!)); continue; }
      const predicted = predict(agent, nav, index, backWh(index), scenario.defaultTerrain);
      add({
        id: `goto:zone:${zone.id}`, kind: 'objective', label: `Go into ${zone.label}`, description: `${predicted.steps} tiles by the known way; a room to visit`,
        command: { type: 'goto', to: cellAt(map, index) }, predicted,
      });
    }
  }

  // Exploring: one option per way out of this tile, to the nearest edge of the explored map that way.
  const toward = (cell: Cell): { towardTiles?: number } => (noWay.length > 0 ? { towardTiles: Math.min(...noWay.map((at) => manhattan(at, cell))) } : {});
  // Exploring needs a reason: something still to find, or a known place with no known way to it.
  const sought = seeking(state, agent);
  const edges = sought.find || noWay.length > 0 ? frontiers(ctx, nav, sought.look) : [];
  for (const dir of sought.find || noWay.length > 0 ? DIRS : []) {
    const next = stepCell(agent.cell, dir);
    if (!inside(map, next)) continue;
    const nextIndex = indexOf(map, next);
    if (agent.known[nextIndex] === undefined) {
      add({
        id: `explore:${dir}`, kind: 'explore', label: `Explore ${DIR_NAME[dir]}`, description: 'not sensed yet from the next tile on',
        command: { type: 'heading', dir }, predicted: { steps: 0 }, visited: false, ...toward(next),
      });
      continue;
    }
    const score = (edge: (typeof edges)[number]): number => edge.tiles + (toward(edge.cell).towardTiles ?? 0);
    const edge = edges.filter((e) => e.first === dir).sort((a, b) => score(a) - score(b))[0];
    if (edge === undefined) continue;
    const predicted = predict(agent, nav, indexOf(map, edge.cell), backWh(indexOf(map, edge.cell)), scenario.defaultTerrain);
    add({
      id: `explore:${dir}`, kind: 'explore', label: `Explore ${DIR_NAME[dir]}`, description: `${edge.tiles} tiles of known ground, then not sensed yet`,
      ...(edge.unknown === 0 ? { description: `${edge.tiles} tiles to ground a ranger has mapped but nothing has looked at` } : {}),
      command: { type: 'goto', to: edge.cell, thenHeading: edge.into }, predicted, visited: agent.known[nextIndex]?.visited === true, ...toward(edge.cell),
    });
  }

  if (agent.visibleMovers.length > 0 || agent.visibleRivals.length > 0 || trigger?.cause === 'mover_ahead') {
    add({ id: 'wait', kind: 'wait', label: `Wait ${WAIT_S} s`, description: 'hold still and look again', command: { type: 'wait', forS: WAIT_S }, predicted: { steps: 0, timeS: WAIT_S } });
  }
  // Pace is offered when it matters: on the energy line, and after driving into a wall (a slower hit costs less).
  if (trigger?.kind === 'energy' || (trigger?.cause === 'bumped' && agent.damagePct > 0)) {
    const other: Pace = agent.pace === 'full' ? 'eco' : 'full';
    const range = energyView(state, { ...agent, pace: other }).rangeTiles;
    add({
      id: `pace:${other}`, kind: 'pace', label: `Switch to ${other} pace`, pace: other,
      description: `${Math.round(PACE[other].speed * 100)} % of top speed; about ${range} tiles of range instead of ${energyView(state, agent).rangeTiles}`,
    });
  }
  return options;
}

/** The mission in one sentence, for the question. */
export const missionLine = (state: LabState): string =>
  `${state.scenario.name}: ${state.scenario.objectives.map((objective) => objective.label).join(', then ')}.`;

/** Everything a brain is asked: why now, what the robot knows, and the moves on offer. `undefined` = nothing to choose. */
export function buildLabQuestion(state: LabState, agentId: string, trigger: LabTrigger, briefing?: string): LabQuestion | undefined {
  const options = buildOptions(state, agentId, trigger);
  if (options.length === 0) return undefined;
  const observation = observeLab(state, agentId);
  return {
    scenarioId: state.scenario.id, objective: missionLine(state), agentId, t: state.t, trigger,
    knew: observation.lines, unknown: observation.unknown, energy: observation.energy, objectives: observation.objectives,
    options, observation, labVersion: LAB_VERSION, ...(briefing ? { briefing } : {}),
  };
}
