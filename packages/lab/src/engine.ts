// @rivetrun/lab engine: a deterministic grid simulation. `stepLab` is pure: same state in, same state out.
// Lab simplification, stated in the UI: this is a grid, not the rail's continuous physics. Speed, energy and
// impact damage still come from the build through the rail's formulas (see robot.ts).
import type { SensorSource, TriggerKind } from '@rivetrun/contracts';
import { IDLE, SOURCE_LABEL, planNext, signature } from './autopilot';
import { energyView, navContextOf } from './context';
import { bearing, expandRoute, indexOf, inside, manhattan, sameCell, stepCell, tileAt } from './grid';
import { navigate } from './nav';
import { defOf, destinationsOf, hasRole, interactionsAt, objectivesDone } from './objectives';
import { LAB_TUNING, contactDamagePct, deriveRobot, rangeTiles, tileMotion, type Pace } from './robot';
import { mixSeed, mulberry32 } from './rng';
import { doorOpen, learnTile, planKnown, senseTiles, senseTraffic, weatherFactor } from './sensing';
import type {
  AgentState, AgentStatus, Cell, Dir, KnownMap, KnownObject, LabCommand, LabConfig, LabDnfReason, LabEvent, LabObjectState, LabState, LabTrigger, MoverState,
} from './types';

const DT = LAB_TUNING.dtS;

/** The step being built. Local to `stepLab`: the values in it are replaced, never changed in place. */
interface Draft {
  readonly base: LabState;
  readonly t: number;
  agents: AgentState[];
  objects: LabObjectState[];
  movers: MoverState[];
  /** Replaced, never copied, when a door opens or the weather turns: unchanged, they are the same arrays as last step. */
  doorsOpen: readonly number[];
  weatherActive: readonly string[];
  events: LabEvent[];
}

const view = (d: Draft): LabState => ({
  ...d.base, t: d.t, agents: d.agents, objects: d.objects, movers: d.movers, doorsOpen: d.doorsOpen, weatherActive: d.weatherActive, events: d.events,
});

const RANK: Readonly<Record<TriggerKind, number>> = { start: 5, body: 4, energy: 3, actuator: 2, perception: 1 };
/** One trigger per robot per step: the more urgent kind wins, then the first. */
const fire = (agent: AgentState, trigger: LabTrigger): AgentState =>
  agent.trigger !== undefined && RANK[agent.trigger.kind] >= RANK[trigger.kind] ? agent : { ...agent, trigger };

const hurt = (agent: AgentState, pct: number): AgentState => ({ ...agent, damagePct: Math.min(100, agent.damagePct + pct) });

/** How the robot learns of a contact: the bumper, the IMU, or the encoders noticing it did not move. */
const contactSource = (agent: AgentState): SensorSource => (agent.robot.suite.bumper ? 'bumper' : agent.robot.suite.imu ? 'imu' : 'core');

const hasEyes = (agent: AgentState): boolean => agent.robot.suite.cameraM > 0 || agent.robot.suite.droneM > 0;

const isBlind = (agent: AgentState): boolean => {
  const { suite } = agent.robot;
  return !suite.ultrasonic && suite.tofM === 0 && suite.lidarM === 0 && suite.cameraM === 0 && suite.droneM === 0;
};

function end(d: Draft, agent: AgentState, status: AgentStatus, dnfReason?: LabDnfReason): AgentState {
  d.events.push({ type: 'ended', t: d.t, agentId: agent.id, status, ...(dnfReason ? { dnfReason } : {}) });
  // A robot that is out leaves what it carried where it stands.
  if (status === 'dnf') d.objects = d.objects.map((o) => (o.status === 'carried' && o.by === agent.id ? { id: o.id, at: agent.cell, status: 'idle' } : o));
  return {
    ...agent, status, ...(dnfReason ? { dnfReason } : {}), endT: d.t, move: undefined, busy: undefined, command: IDLE, speedMps: 0,
    carrying: status === 'dnf' ? [] : agent.carrying,
  };
}

/** Ends the run for a robot whose objectives are all done. */
const settle = (d: Draft, agent: AgentState): AgentState => (objectivesDone(view(d), agent) ? end(d, agent, 'complete') : agent);

/** Updates the robot's map from where it stands and announces what it sees for the first time. */
function look(d: Draft, agent: AgentState): AgentState {
  const { agent: seen, fresh } = senseTiles(view(d), agent);
  const first = fresh[0];
  if (first === undefined) return seen;
  const known = seen.knownObjects[first]!;
  const def = defOf(d.base.scenario, first);
  const where = sameCell(known.at, seen.cell) ? 'here' : `${manhattan(known.at, seen.cell)} tiles ${bearing(seen.cell, known.at)}`;
  return fire(seen, { kind: 'perception', cause: 'object_seen', source: known.via, label: `${SOURCE_LABEL[known.via]} · ${def.label}, ${where}` });
}

function bumpWall(d: Draft, agent: AgentState, to: Cell): AgentState {
  const { map } = d.base.scenario;
  const here = tileAt(map, agent.cell);
  const motion = tileMotion(agent.robot.spec, here.terrain, 0, agent.pace);
  const damagePct = contactDamagePct(agent.robot, motion.ok ? motion.speedMps : 0, here.terrain);
  const blind = isBlind(agent);
  const source = contactSource(agent);
  d.events.push({ type: 'bump', t: d.t, agentId: agent.id, at: to, into: 'wall', damagePct, blind });
  const known: KnownMap = learnTile(agent.known, indexOf(map, to), { blocked: true, kind: 'wall', via: source });
  return fire(
    { ...hurt(agent, damagePct), known, command: IDLE, carryM: 0, busy: { kind: 'bump', untilT: d.t + LAB_TUNING.bumpS }, stats: { ...agent.stats, bumps: agent.stats.bumps + 1 } },
    { kind: 'body', cause: 'bumped', source, label: blind ? 'BLIND · hit a wall: no distance sensor' : `${SOURCE_LABEL[source]} · hit a wall` },
  );
}

function bumpRobot(d: Draft, agent: AgentState, rivalIndex: number, to: Cell): AgentState {
  const rival = d.agents[rivalIndex]!;
  const source = contactSource(agent);
  d.events.push({ type: 'bump', t: d.t, agentId: agent.id, at: to, into: 'robot', damagePct: 0, blind: isBlind(agent) });
  const bumped = { ...agent, command: IDLE, carryM: 0, busy: { kind: 'bump' as const, untilT: d.t + LAB_TUNING.bumpS }, stats: { ...agent.stats, bumps: agent.stats.bumps + 1 } };
  if (!d.base.scenario.tagSteals || rival.carrying.length === 0 || d.t < rival.safeUntilT || rival.move !== undefined) {
    return fire(bumped, { kind: 'body', cause: 'bumped', source, label: `${SOURCE_LABEL[source]} · bumped into ${hasEyes(agent) ? rival.label : 'something'}` });
  }
  // Tagged: the carrier is stunned and loses what it holds, to the tagger as far as the tagger can carry it.
  const room = Math.max(0, d.base.scenario.carryLimit - agent.carrying.length);
  const taken = rival.carrying.slice(0, room);
  d.objects = d.objects.map((o) => {
    if (!rival.carrying.includes(o.id)) return o;
    return taken.includes(o.id) ? { id: o.id, at: agent.cell, status: 'carried', by: agent.id } : { id: o.id, at: rival.cell, status: 'idle' };
  });
  rival.carrying.forEach((objectId) => d.events.push({ type: taken.includes(objectId) ? 'taken' : 'dropped', t: d.t, agentId: taken.includes(objectId) ? agent.id : rival.id, objectId }));
  const names = rival.carrying.map((id) => defOf(d.base.scenario, id).label).join(' and ');
  d.agents[rivalIndex] = fire(
    { ...rival, carrying: [], move: undefined, command: IDLE, carryM: 0, busy: { kind: 'stun', untilT: d.t + LAB_TUNING.tagStunS } },
    { kind: 'body', cause: 'tagged', source: contactSource(rival), label: `${SOURCE_LABEL[contactSource(rival)]} · tagged by ${agent.label}: lost ${names}` },
  );
  return fire(
    { ...bumped, carrying: [...agent.carrying, ...taken], stats: agent.stats, safeUntilT: d.t + LAB_TUNING.tagGraceS },
    { kind: 'actuator', cause: 'objective_done', source, label: `${SOURCE_LABEL[source]} · tagged ${rival.label}${taken.length > 0 ? `: took ${names}` : ''}` },
  );
}

/** A mover and a robot on the same tile: the robot takes the damage and is left where it stood. */
function collide(d: Draft, agent: AgentState, moverId: string, at: Cell): AgentState {
  const def = d.base.scenario.movers.find((mover) => mover.id === moverId)!;
  const damagePct = def.damagePct * agent.robot.spec.impactDamageFactor;
  const source = contactSource(agent);
  d.events.push({ type: 'collision', t: d.t, agentId: agent.id, moverId, at, damagePct });
  return fire(
    {
      ...hurt(agent, damagePct), move: undefined, command: IDLE, carryM: 0, speedMps: 0,
      busy: { kind: 'stun', untilT: d.t + LAB_TUNING.collisionS }, stats: { ...agent.stats, collisions: agent.stats.collisions + 1 },
    },
    { kind: 'body', cause: 'collision', source, label: `${SOURCE_LABEL[source]} · hit by ${hasEyes(agent) ? def.label.toLowerCase() : 'something moving'}` },
  );
}

/** Drove onto a drop it did not know about: damage, and it is put back where it came from. */
function fall(d: Draft, agent: AgentState, to: Cell): AgentState {
  const damagePct = LAB_TUNING.fallDamagePct * agent.robot.spec.impactDamageFactor;
  const source = contactSource(agent);
  const eyes = agent.robot.suite.cameraM > 0 || agent.robot.suite.droneM > 0;
  d.events.push({ type: 'fell', t: d.t, agentId: agent.id, at: to, damagePct });
  return fire(
    {
      ...hurt(agent, damagePct), move: undefined, command: IDLE, carryM: 0, speedMps: 0,
      known: learnTile(agent.known, indexOf(d.base.scenario.map, to), { blocked: false, kind: 'drop', via: source }),
      busy: { kind: 'fall', untilT: d.t + LAB_TUNING.fallS }, stats: { ...agent.stats, falls: agent.stats.falls + 1 },
    },
    { kind: 'body', cause: 'fell', source, label: `${SOURCE_LABEL[source]} · fell down a drop${eyes ? '' : ': no camera to see it (a ranger cannot)'}` },
  );
}

function tryMove(d: Draft, moving: AgentState, dir: Dir): AgentState {
  const { scenario } = d.base;
  const { map } = scenario;
  // Turning re-aims the camera and the ToF beam.
  const agent = moving.heading === dir ? moving : look(d, { ...moving, heading: dir });
  const to = stepCell(agent.cell, dir);
  // The edge of the map is on the plan: nothing to drive onto, nothing to hit.
  if (!inside(map, to)) {
    const stayed = { ...agent, command: IDLE, carryM: 0 };
    return agent.command.type === 'step' ? stayed : fire(stayed, { kind: 'perception', cause: 'wall_ahead', source: 'core', label: 'CORE · the edge of the map' });
  }
  const tile = tileAt(map, to);
  const index = indexOf(map, to);
  const known = agent.known[index];
  const closedDoor = tile.kind === 'door' && !doorOpen(view(d), to);
  // It knows it cannot go there: it does not try. A robot only hits what it has not sensed.
  if (known !== undefined && (known.noGo || known.kind === 'drop' || (known.blocked && known.kind !== 'door'))) {
    const refused = { ...agent, command: IDLE, carryM: 0 };
    return agent.command.type === 'step' ? refused : fire(refused, { kind: 'perception', cause: 'wall_ahead', source: known.via, label: `${SOURCE_LABEL[known.via]} · the way ahead is closed` });
  }
  if (tile.kind === 'wall') return bumpWall(d, agent, to);
  if (closedDoor) {
    return { ...agent, carryM: 0, known: learnTile(agent.known, index, { blocked: true, kind: 'door', via: contactSource(agent) }), busy: { kind: 'door', untilT: d.t + LAB_TUNING.doorS } };
  }
  const rival = d.agents.findIndex((other) => other.id !== agent.id && other.status === 'running' && (sameCell(other.cell, to) || (other.move !== undefined && sameCell(other.move.to, to))));
  // A robot driving off the tile is not in the way for long: wait for it rather than run into its back.
  if (rival >= 0 && d.agents[rival]!.move !== undefined && !sameCell(d.agents[rival]!.move!.to, to)) return { ...agent, carryM: 0 };
  if (rival >= 0) return bumpRobot(d, agent, rival, to);
  const mover = d.movers.find((m) => sameCell(m.route[m.index]!, to));
  if (mover !== undefined) return collide(d, agent, mover.id, to);
  const motion = tileMotion(agent.robot.spec, tile.terrain, tile.slopeDeg, agent.pace);
  if (!motion.ok) {
    const why = { grip: 'the wheels spin', torque: 'the motor stalls', tip: 'too steep for this locomotion' }[motion.reason];
    const what = tile.kind === 'ramp' ? `ramp of ${tile.slopeDeg}°` : tile.terrain;
    d.events.push({ type: 'blocked', t: d.t, agentId: agent.id, at: to, reason: `${what}: ${why}` });
    // The robot knows it did not get there. What stopped it, only a camera or an IMU can say.
    const told = hasEyes(agent) || (agent.robot.suite.imu && tile.kind === 'ramp');
    const learned = told ? { blocked: false, kind: tile.kind, slopeDeg: tile.slopeDeg, noGo: true, via: 'core' as const } : { blocked: false, noGo: true, via: 'core' as const };
    return fire(
      { ...agent, command: IDLE, carryM: 0, known: learnTile(agent.known, index, learned) },
      { kind: 'body', cause: 'blocked', source: 'core', label: told ? `CORE · cannot get onto the ${what}: ${why}` : 'CORE · cannot get onto the tile ahead: the drive stalls or spins' },
    );
  }
  return {
    ...agent,
    move: { to, progress: Math.min(0.99, agent.carryM / scenario.tileM), speedMps: motion.speedMps, drawW: motion.drawW },
    carryM: 0,
    command: agent.command.type === 'step' ? IDLE : agent.command,
  };
}

function startInteraction(d: Draft, agent: AgentState, objectId?: string): AgentState {
  const possible = interactionsAt(view(d), agent);
  const chosen = objectId !== undefined ? possible.find((interaction) => interaction.objectId === objectId) : possible[0];
  if (chosen === undefined) return fire({ ...agent, command: IDLE }, { kind: 'actuator', cause: 'action_failed', label: 'CORE · nothing to do on this tile' });
  if (chosen.kind === 'finish') return end(d, { ...agent, command: IDLE }, 'partial');
  return { ...agent, command: IDLE, carryM: 0, busy: { kind: chosen.kind, untilT: d.t + chosen.holdS, objectId: chosen.objectId } };
}

/** Carries out the robot's command from where it stands. */
function act(d: Draft, agent: AgentState, arriving: boolean): AgentState {
  const plan = planNext(navContextOf(view(d), agent), agent);
  const planned = plan.trigger !== undefined ? fire({ ...agent, command: plan.command, memory: plan.memory }, plan.trigger) : { ...agent, command: plan.command, memory: plan.memory };
  if (plan.interact !== undefined) return startInteraction(d, planned, plan.interact.objectId);
  if (plan.waitS !== undefined) return { ...planned, carryM: 0, busy: { kind: 'wait', untilT: d.t + plan.waitS } };
  if (plan.dir === undefined) return planned;
  // A robot that has just asked for a decision waits one step before driving on, so a brain that answers at once can change its course.
  if (arriving && planned.trigger !== undefined) return planned;
  return tryMove(d, planned, plan.dir);
}

function energyCheck(d: Draft, agent: AgentState): AgentState {
  const state = view(d);
  const energy = energyView(state, agent, navigate(navContextOf(state, agent), agent.cell));
  const way = energy.returnPct !== undefined ? ` after the ${energy.returnPct} % the way to the end costs`
    : energy.workPct !== undefined ? ` after the ${energy.workPct} % the known work left needs at this pace` : '';
  const low = !agent.memory.energyLow && energy.marginPct < LAB_TUNING.energy.lowPct;
  const ok = agent.memory.energyLow && energy.marginPct > LAB_TUNING.energy.okPct;
  if (!low && !ok) return agent;
  const trigger: LabTrigger = { kind: 'energy', cause: low ? 'energy_low' : 'energy_ok', source: 'core', label: `ENERGY · ${energy.marginPct} % to spare${way}` };
  const fired = fire(agent, trigger);
  // Something more urgent went out this step: the energy line is checked again on the next tile.
  return fired.trigger === trigger ? { ...fired, memory: { ...fired.memory, energyLow: low } } : agent;
}

function arrive(d: Draft, agent: AgentState, to: Cell): AgentState {
  const { scenario } = d.base;
  const mover = d.movers.find((m) => sameCell(m.route[m.index]!, to));
  if (mover !== undefined) return collide(d, agent, mover.id, to);
  if (tileAt(scenario.map, to).kind === 'drop') return fall(d, agent, to);
  d.objects = d.objects.map((o) => (o.status === 'carried' && o.by === agent.id ? { ...o, at: to } : o));
  let next = look(d, { ...agent, cell: to, move: undefined, stats: { ...agent.stats, tiles: agent.stats.tiles + 1 } });
  const index = indexOf(scenario.map, to);
  const zone = scenario.zones.find((z) => z.cells.includes(index) && !next.visitedZones.includes(z.id));
  if (zone !== undefined) {
    d.events.push({ type: 'zone', t: d.t, agentId: next.id, zoneId: zone.id });
    next = fire({ ...next, visitedZones: [...next.visitedZones, zone.id] }, { kind: 'actuator', cause: 'objective_done', label: `CORE · entered ${zone.label}` });
  }
  const goal = scenario.objects.find((o) => hasRole(o, 'goal') && sameCell(o.at, to) && (o.owner === undefined || o.owner === next.id) && !next.reached.includes(o.id));
  if (goal !== undefined) next = { ...next, reached: [...next.reached, goal.id] };
  next = settle(d, next);
  if (next.status !== 'running') return next;
  return act(d, energyCheck(d, next), true);
}

function advance(d: Draft, agent: AgentState): AgentState {
  const move = agent.move!;
  const progress = move.progress + (move.speedMps * DT) / d.base.scenario.tileM;
  const driving = { ...agent, drawW: move.drawW, speedMps: move.speedMps };
  if (progress < 1) return { ...driving, move: { ...move, progress } };
  return arrive(d, { ...driving, carryM: (progress - 1) * d.base.scenario.tileM }, move.to);
}

function finishBusy(d: Draft, agent: AgentState): AgentState {
  const { scenario } = d.base;
  const busy = agent.busy!;
  const free = { ...agent, busy: undefined };
  const object = busy.objectId !== undefined ? d.objects.find((o) => o.id === busy.objectId) : undefined;
  const def = busy.objectId !== undefined ? defOf(scenario, busy.objectId) : undefined;
  const failed = (): AgentState => fire(free, { kind: 'actuator', cause: 'action_failed', label: `CORE · ${def?.label ?? 'it'} is no longer here` });
  switch (busy.kind) {
    case 'door': {
      const at = stepCell(agent.cell, agent.heading);
      d.doorsOpen = [...d.doorsOpen, indexOf(scenario.map, at)];
      d.events.push({ type: 'door', t: d.t, agentId: agent.id, at });
      return look(d, free);
    }
    case 'wait':
      return fire(free, { kind: 'actuator', cause: 'action_done', label: 'CORE · waited' });
    case 'pick': {
      if (object === undefined || def === undefined || object.status !== 'idle' || !sameCell(object.at, agent.cell)) return failed();
      d.objects = d.objects.map((o) => (o.id === object.id ? { ...o, status: 'carried', by: agent.id } : o));
      d.events.push({ type: 'picked', t: d.t, agentId: agent.id, objectId: object.id });
      const carrying = settle(d, { ...free, carrying: [...free.carrying, object.id], safeUntilT: d.t + LAB_TUNING.tagGraceS });
      return carrying.status !== 'running' ? carrying : fire(carrying, { kind: 'actuator', cause: 'objective_done', label: `CORE · picked up ${def.label}` });
    }
    case 'drop': {
      if (def === undefined) return failed();
      const delivered = free.carrying.filter((id) => destinationsOf(scenario, defOf(scenario, id), agent.id).some((depot) => depot.id === def.id));
      if (delivered.length === 0) return failed();
      d.objects = d.objects.map((o) => (delivered.includes(o.id) ? { ...o, at: agent.cell, status: 'delivered', by: agent.id } : o));
      delivered.forEach((objectId) => d.events.push({ type: 'delivered', t: d.t, agentId: agent.id, objectId }));
      const lighter = settle(d, { ...free, carrying: free.carrying.filter((id) => !delivered.includes(id)) });
      const names = delivered.map((id) => defOf(scenario, id).label).join(' and ');
      return lighter.status !== 'running' ? lighter : fire(lighter, { kind: 'actuator', cause: 'objective_done', label: `CORE · delivered ${names} to ${def.label}` });
    }
    case 'scan': {
      if (object === undefined || def === undefined || object.status !== 'idle') return failed();
      d.objects = d.objects.map((o) => (o.id === object.id ? { ...o, status: 'scanned', by: agent.id } : o));
      d.events.push({ type: 'scanned', t: d.t, agentId: agent.id, objectId: object.id });
      const scanned = settle(d, free);
      return scanned.status !== 'running' ? scanned : fire(scanned, { kind: 'actuator', cause: 'objective_done', label: `CORE · scanned ${def.label}` });
    }
    // bump, fall, stun: the trigger went out when it happened.
    default:
      return free;
  }
}

/** Movers and rivals: announced the first time a sensor picks each one up. */
function traffic(d: Draft, agent: AgentState): AgentState {
  const seen = senseTraffic(view(d), agent);
  const mover = seen.visibleMovers.find((m) => !agent.memory.moversInView.includes(m.id));
  const rival = seen.visibleRivals.find((r) => !agent.memory.rivalsInView.includes(r.id));
  if (mover === undefined && rival === undefined) return seen;
  const where = (cell: Cell): string => `${manhattan(cell, seen.cell)} tiles ${bearing(seen.cell, cell)}`;
  // Each mover and each robot is announced once, the first time a sensor picks it up; one announcement per step.
  if (mover !== undefined) {
    const name = mover.labelled ? d.base.scenario.movers.find((m) => m.id === mover.id)!.label.toLowerCase() : 'something moving';
    const told = { ...seen, memory: { ...seen.memory, moversInView: [...seen.memory.moversInView, mover.id] } };
    return fire(told, { kind: 'perception', cause: 'mover_seen', source: mover.via, label: `${SOURCE_LABEL[mover.via]} · ${name}, ${where(mover.cell)}` });
  }
  const name = rival!.labelled ? d.agents.find((a) => a.id === rival!.id)!.label : 'something moving';
  const told = { ...seen, memory: { ...seen.memory, rivalsInView: [...seen.memory.rivalsInView, rival!.id] } };
  return fire(told, { kind: 'perception', cause: 'rival_seen', source: rival!.via, label: `${SOURCE_LABEL[rival!.via]} · ${name}, ${where(rival!.cell)}` });
}

/** A robot standing still asks again every so often: with no command, or held up by traffic that has not cleared. */
function idleCheck(d: Draft, agent: AgentState): AgentState {
  const still = agent.move === undefined && agent.busy === undefined;
  const held = still && agent.memory.heldForMover && agent.command.type !== 'idle';
  if (!still || (agent.command.type !== 'idle' && !held)) return agent.memory.idleSinceT < 0 ? agent : { ...agent, memory: { ...agent.memory, idleSinceT: -1 } };
  const since = agent.memory.idleSinceT < 0 || agent.trigger !== undefined ? d.t : agent.memory.idleSinceT;
  const waiting = { ...agent, stats: { ...agent.stats, idleS: agent.stats.idleS + DT }, memory: { ...agent.memory, idleSinceT: since } };
  if (d.t - since < (held ? LAB_TUNING.heldRetriggerS : LAB_TUNING.idleRetriggerS)) return waiting;
  const again: LabTrigger = held
    ? { kind: 'perception', cause: 'mover_ahead', label: 'CORE · still held up by traffic' }
    : { kind: 'actuator', cause: 'idle', label: 'CORE · standing still with no command' };
  return fire({ ...waiting, memory: { ...waiting.memory, idleSinceT: d.t } }, again);
}

function tickAgent(d: Draft, i: number): void {
  const before = d.agents[i]!;
  if (before.status !== 'running') return;
  let agent: AgentState = { ...before, drawW: before.robot.spec.basePowerW, speedMps: 0 };
  if (agent.busy !== undefined) {
    if (d.t + 1e-9 >= agent.busy.untilT) agent = finishBusy(d, agent);
  } else if (agent.move !== undefined) {
    agent = advance(d, agent);
  } else {
    agent = act(d, agent, false);
    if (agent.move === undefined) agent = { ...agent, carryM: 0 };
  }
  if (agent.status === 'running') {
    const batteryPct = Math.max(0, agent.batteryPct - ((agent.drawW * DT) / 3600 / agent.robot.spec.capacityWh) * 100);
    agent = { ...agent, batteryPct };
    if (agent.damagePct >= 100) agent = end(d, agent, 'dnf', 'damage');
    else if (batteryPct <= 0) agent = end(d, agent, 'dnf', 'battery');
    else agent = idleCheck(d, traffic(d, agent));
  }
  d.agents[i] = agent;
}

function tickMovers(d: Draft): void {
  const { scenario } = d.base;
  d.movers = d.movers.map((mover) => {
    const def = scenario.movers.find((m) => m.id === mover.id)!;
    const progress = mover.progress + (def.speedMps * DT) / scenario.tileM;
    if (progress < 1) return { ...mover, progress };
    const index = (mover.index + 1) % mover.route.length;
    const cell = mover.route[index]!;
    // A robot standing in the way is seen in time: the mover turns back (a there-and-back route) or waits (a loop).
    const standing = d.agents.some((agent) => agent.status === 'running' && agent.move === undefined && sameCell(agent.cell, cell));
    if (standing) return def.loop === 'bounce' ? { ...mover, index: (mover.route.length - mover.index) % mover.route.length, progress: 0 } : { ...mover, progress: 0 };
    // A robot driving onto the tile in front of it is not: it is hit.
    d.agents = d.agents.map((agent) => (agent.status === 'running' && agent.move !== undefined && sameCell(agent.move.to, cell) ? collide(d, agent, mover.id, cell) : agent));
    return { ...mover, index, progress: progress - 1 };
  });
}

function tickWeather(d: Draft): void {
  const { scenario } = d.base;
  const active = d.base.weather.filter((w) => d.t >= w.atS && (w.untilS === undefined || d.t < w.untilS)).map((w) => w.id);
  if (active.length === d.weatherActive.length && active.every((id) => d.weatherActive.includes(id))) return;
  const changed = d.base.weather.filter((w) => active.includes(w.id) !== d.weatherActive.includes(w.id));
  changed.forEach((w) => d.events.push({ type: 'weather', t: d.t, label: w.label, active: active.includes(w.id) }));
  d.weatherActive = active;
  // Only a robot with a camera or a drone can tell: it sees less far. Visibility is sensed, not announced.
  d.agents = d.agents.map((agent) => {
    const { suite } = agent.robot;
    const source: SensorSource | undefined = suite.cameraM > 0 ? 'camera' : suite.droneM > 0 ? 'scout_drone' : undefined;
    if (agent.status !== 'running' || source === undefined) return agent;
    const factor = weatherFactor(view(d), source);
    if (factor === agent.memory.visibility) return agent;
    const tiles = rangeTiles(source === 'camera' ? suite.cameraM : suite.droneM, factor, scenario.tileM);
    return fire(
      { ...agent, memory: { ...agent.memory, visibility: factor } },
      { kind: 'perception', cause: 'visibility_changed', source, label: `${SOURCE_LABEL[source]} · ${changed[0]?.label ?? 'weather'}: sees ${tiles} tiles now` },
    );
  });
}

function finishRun(d: Draft): void {
  const { scenario } = d.base;
  const won = scenario.ends === 'first' && d.agents.some((agent) => agent.status === 'complete');
  d.agents = d.agents.map((agent) => {
    if (agent.status !== 'running') return agent;
    if (won) return end(d, agent, 'dnf', 'beaten');
    return d.t >= scenario.maxS ? end(d, agent, 'dnf', 'timeout') : agent;
  });
}

/** One fixed step of `LAB_TUNING.dtS` seconds. Pure. */
export function stepLab(state: LabState): LabState {
  if (state.done) return state;
  const tick = state.tick + 1;
  const d: Draft = {
    base: state,
    t: tick * DT,
    agents: state.agents.map((agent) => (agent.trigger === undefined ? agent : { ...agent, trigger: undefined })),
    objects: [...state.objects],
    movers: [...state.movers],
    doorsOpen: state.doorsOpen,
    weatherActive: state.weatherActive,
    events: [],
  };
  tickWeather(d);
  tickMovers(d);
  for (let i = 0; i < d.agents.length; i += 1) tickAgent(d, i);
  finishRun(d);
  return { ...view(d), tick, done: d.agents.every((agent) => agent.status !== 'running') };
}

const START: LabTrigger = { kind: 'start', cause: 'start', source: 'core', label: 'START' };

export function createLab(config: LabConfig): LabState {
  const { scenario, seed } = config;
  const random = mulberry32(mixSeed(seed, 0x1ab));
  // The seed moves the traffic and the weather, never the map.
  const movers = scenario.movers.map((def): MoverState => {
    const route = expandRoute(def.path, def.loop);
    return { id: def.id, route, index: Math.floor(random() * route.length), progress: 0 };
  });
  const weather = scenario.weather.map((w) => ({ ...w, atS: Math.max(0, w.atS + (w.jitterS ?? 0) * (random() * 2 - 1)) }));
  const base: LabState = {
    scenario, seed, t: 0, tick: 0, agents: [],
    objects: scenario.objects.map((def) => ({ id: def.id, at: def.at, status: 'idle' })),
    movers, doorsOpen: [], weather, weatherActive: weather.filter((w) => w.atS <= 0).map((w) => w.id), events: [], done: false,
  };
  const plan: KnownMap = scenario.planMap ? planKnown(base) : scenario.map.tiles.map(() => undefined);
  const planObjects: Record<string, KnownObject> = Object.fromEntries(scenario.objects.filter((o) => o.inPlan).map((o) => [o.id, { at: o.at, t: 0, via: 'core' }]));
  const agents = scenario.agents.map((def): AgentState => {
    const entry = config.entries.find((e) => e.agentId === def.id);
    if (!entry) throw new Error(`@rivetrun/lab: no build for robot "${def.id}" in scenario "${scenario.id}"`);
    return {
      id: def.id, label: def.label, build: entry.build, robot: deriveRobot(entry.build), ...(entry.policy ? { policy: entry.policy } : {}),
      cell: def.start, heading: def.heading, carryM: 0, command: IDLE, pace: entry.pace ?? 'full',
      batteryPct: 100, damagePct: 0, drawW: 0, speedMps: 0, carrying: [],
      known: plan, knownObjects: planObjects, visibleMovers: [], visibleRivals: [], visitedZones: [], reached: [], safeUntilT: 0,
      memory: { signature: '', energyLow: false, moversInView: [], rivalsInView: [], visibility: 1, heldForMover: false, idleSinceT: -1 },
      status: 'running', stats: { tiles: 0, bumps: 0, collisions: 0, falls: 0, idleS: 0 },
    };
  });
  const placed = { ...base, agents };
  return {
    ...placed,
    agents: agents.map((agent) => {
      const seen = senseTraffic(placed, senseTiles(placed, agent).agent);
      const index = indexOf(scenario.map, seen.cell);
      const zone = scenario.zones.find((z) => z.cells.includes(index));
      const eyes: SensorSource | undefined = seen.robot.suite.cameraM > 0 ? 'camera' : seen.robot.suite.droneM > 0 ? 'scout_drone' : undefined;
      return {
        ...seen, trigger: START, visitedZones: zone ? [zone.id] : [],
        memory: {
          ...seen.memory, moversInView: seen.visibleMovers.map((m) => m.id), rivalsInView: seen.visibleRivals.map((r) => r.id),
          // Weather already in force is what the robot has always seen: not a change to announce.
          visibility: eyes ? weatherFactor(placed, eyes) : 1,
        },
      };
    }),
  };
}

/** Gives a robot its next command. A move in flight finishes first. */
export function command(state: LabState, agentId: string, next: LabCommand): LabState {
  return {
    ...state,
    agents: state.agents.map((agent) => {
      if (agent.id !== agentId || agent.status !== 'running') return agent;
      const at = agent.move?.to ?? agent.cell;
      const heading = next.type === 'heading' ? { signature: signature(navContextOf(state, agent), at, next.dir) } : {};
      return { ...agent, command: next, memory: { ...agent.memory, ...heading, idleSinceT: -1 } };
    }),
  };
}

/** Full or eco. Applies from the next tile. */
export function setPace(state: LabState, agentId: string, pace: Pace): LabState {
  return { ...state, agents: state.agents.map((agent) => (agent.id === agentId && agent.status === 'running' ? { ...agent, pace } : agent)) };
}

/** Takes a robot out of the run, e.g. when its driver has nothing left to choose. What it carried stays on its tile. */
export function retire(state: LabState, agentId: string, dnfReason: LabDnfReason): LabState {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent || agent.status !== 'running') return state;
  const agents = state.agents.map((a): AgentState =>
    a.id === agentId ? { ...a, status: 'dnf', dnfReason, endT: state.t, move: undefined, busy: undefined, command: IDLE, speedMps: 0, carrying: [] } : a);
  return {
    ...state,
    agents,
    objects: state.objects.map((o) => (o.status === 'carried' && o.by === agentId ? { id: o.id, at: agent.cell, status: 'idle' } : o)),
    events: [{ type: 'ended', t: state.t, agentId, status: 'dnf', dnfReason }],
    done: agents.every((a) => a.status !== 'running'),
  };
}
