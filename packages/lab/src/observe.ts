// What a brain is told and what it may choose. Built from the robot's own map, its sensors and the core kit:
// never from the scenario's ground truth (RR-BRAIN-V3, rule 1).
import type { SensorSource } from '@rivetrun/contracts';
import { SOURCE_LABEL } from './autopilot';
import { energyView, navContextOf } from './context';
import { DIRS, DIR_NAME, bearing, cellAt, indexOf, inside, manhattan, sameCell, stepCell } from './grid';
import { enterCost, frontiers, navigate, type Nav, type NavContext } from './nav';
import { defOf, finalGoal, interactionBlockers, interactionsAt, objectiveStatus } from './objectives';
import { PACE, rangeTiles, type Pace } from './robot';
import { LAB_VERSION, type LabObservation, type LabOption, type LabPrediction, type LabQuestion } from './schema';
import { knownShare, weatherFactor } from './sensing';
import { bestTour, type TourJob } from './tour';
import type { AgentState, Cell, Dir, LabCommand, LabState, LabTrigger } from './types';
import { openObjects, seeking, wants } from './wants';

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

  const projected = energy.returnPct !== undefined || energy.workPct !== undefined;
  const way = (energy.returnPct !== undefined ? `, ${energy.marginPct} % to spare after the way to the end` : '')
    + (energy.workPct !== undefined ? `, the known work left needs about ${energy.workPct} % at this pace` : '');
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
    energy: {
      batteryPct: energy.batteryPct, ...(projected ? { projectedPct: energy.marginPct } : {}),
      ...(energy.workPct !== undefined ? { workPct: energy.workPct } : {}), rangeTiles: energy.rangeTiles,
    },
    carrying: agent.carrying.map((id) => defOf(scenario, id).label), objectives: statuses, blind, around, exploredPct, objects, moving,
    tiltDeg: suite.imu ? (here?.kind === 'ramp' ? (here.slopeDeg ?? 0) : 0) : 'unknown',
    unknown, lines,
  };
}

const sameCommand = (a: LabCommand, b: LabCommand): boolean =>
  a.type === 'goto' && b.type === 'goto' ? sameCell(a.to, b.to) && a.interact === b.interact && a.thenHeading === b.thenHeading : a.type === 'heading' && b.type === 'heading' && a.dir === b.dir;

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
export function buildOptions(state: LabState, agentId: string): LabOption[] {
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
  // The order of the jobs: driving distances between the places involved, by the robot's own map where it knows a
  // way and as the crow flies (stretched by a quarter) where it does not.
  const navs = new Map<number, typeof nav>([[indexOf(map, agent.cell), nav]]);
  const tiles = (from: number, to: number): number => {
    const known = (navs.get(from) ?? navs.set(from, navigate(ctx, cellAt(map, from))).get(from)!).tiles[to]!;
    return Number.isFinite(known) ? known : Math.ceil(manhattan(cellAt(map, from), cellAt(map, to)) * 1.25);
  };
  const jobs: TourJob[] = wanted.filter((want) => want.job === 'start').map((want) => ({ id: want.id, from: indexOf(map, want.at), to: indexOf(map, want.jobTo ?? want.at) }));
  const statuses = objectiveStatus(state, agent);
  // How many of the known jobs the mission still needs: "3 of the 5 samples" leaves a choice of which.
  const needed = Math.min(jobs.length, scenario.objectives.reduce((sum, objective, i) =>
    sum + (objective.type === 'deliver' || objective.type === 'collect' || objective.type === 'scan' ? Math.max(0, statuses[i]!.need - statuses[i]!.have - agent.carrying.filter((id) => defOf(scenario, id).kind === objective.kind && objective.type === 'deliver').length) : 0), 0));
  const closing = scenario.objectives.some((objective) => objective.type === 'reach') && goalAt !== undefined ? indexOf(map, goalAt) : undefined;
  const tour = (want: (typeof wanted)[number]): { jobSteps: number; tourSteps: number } | undefined => {
    const here = indexOf(map, agent.cell);
    const at = indexOf(map, want.at);
    if (want.job === 'finish') return { jobSteps: tiles(here, at), tourSteps: tiles(here, at) + bestTour(at, jobs, needed, closing, tiles) };
    const job = jobs.find((j) => j.id === want.id);
    if (job === undefined) return undefined;
    const jobSteps = tiles(here, job.from) + tiles(job.from, job.to);
    return { jobSteps, tourSteps: jobSteps + bestTour(job.to, jobs.filter((other) => other !== job), needed - 1, closing, tiles) };
  };

  const noWay: Cell[] = [];
  for (const want of wanted) {
    const index = indexOf(map, want.at);
    if (sameCell(want.at, agent.cell)) continue;
    if (!Number.isFinite(nav.timeS[index]!)) { noWay.push(want.at); continue; }
    const leg = predict(agent, nav, index, want.kind === 'return' ? 0 : backWh(index), scenario.defaultTerrain);
    const whole = jobs.length + agent.carrying.length > 1 || want.jobTo !== undefined ? tour(want) : undefined;
    const job = whole === undefined ? '' : whole.jobSteps !== leg.steps ? `, ${whole.jobSteps} for the whole job` : '';
    const all = whole !== undefined && whole.tourSteps !== whole.jobSteps ? `; ${whole.tourSteps} tiles for all the known work if this goes first` : '';
    add({
      id: want.id, kind: want.kind, label: want.label, description: `${leg.steps} tiles by the known way${job}${all}; ${want.description}`,
      command: { type: 'goto', to: want.at, ...(want.interact !== undefined ? { interact: want.interact } : {}) },
      predicted: { ...leg, ...(whole ?? {}) }, ...(want.completes !== undefined ? { completes: want.completes } : {}),
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

  // Waiting and changing pace are always possible. They are choices too: both cost time, eco saves charge.
  add({ id: 'wait', kind: 'wait', label: `Wait ${WAIT_S} s`, description: 'hold still and look again', command: { type: 'wait', forS: WAIT_S }, predicted: { steps: 0, timeS: WAIT_S } });
  const other: Pace = agent.pace === 'full' ? 'eco' : 'full';
  const range = energyView(state, { ...agent, pace: other }).rangeTiles;
  add({
    id: `pace:${other}`, kind: 'pace', label: `Switch to ${other} pace`, pace: other,
    description: `${Math.round(PACE[other].speed * 100)} % of top speed; about ${range} tiles of range instead of ${energyView(state, agent).rangeTiles}`,
  });
  return options;
}

/** The mission in one sentence, for the question. */
export const missionLine = (state: LabState): string =>
  `${state.scenario.name}: ${state.scenario.objectives.map((objective) => objective.label).join(', then ')}.`;

/** Everything a brain is asked: why now, what the robot knows, and the moves on offer. `undefined` = nothing to choose. */
export function buildLabQuestion(state: LabState, agentId: string, trigger: LabTrigger, briefing?: string): LabQuestion | undefined {
  const options = buildOptions(state, agentId);
  if (options.length === 0) return undefined;
  const observation = observeLab(state, agentId);
  return {
    scenarioId: state.scenario.id, objective: missionLine(state), agentId, t: state.t, trigger,
    knew: observation.lines, unknown: observation.unknown, energy: observation.energy, objectives: observation.objectives,
    options, observation, labVersion: LAB_VERSION, ...(briefing ? { briefing } : {}),
  };
}
