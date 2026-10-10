// Views of a robot that both the engine and the question builder need.
import { indexOf } from './grid';
import { navigate, type Nav, type NavContext } from './nav';
import { finalGoal } from './objectives';
import { tileMotion } from './robot';
import type { AgentState, LabState } from './types';

/** The planner's inputs for a robot: its own map, its build and its pace. */
export function navContextOf(state: LabState, agent: AgentState): NavContext {
  const { scenario } = state;
  return { map: scenario.map, known: agent.known, robot: agent.robot, pace: agent.pace, defaultTerrain: scenario.defaultTerrain, tileM: scenario.tileM };
}

/** The energy line: the Lab's version of "projected charge at the finish". */
export interface EnergyView {
  readonly batteryPct: number;
  /** Charge the known way to the mission's end point costs at this pace. Absent when the robot knows no way there. */
  readonly returnPct?: number;
  /** Charge left after that way; the battery itself while no way is known. */
  readonly marginPct: number;
  /** Tiles of the scenario's usual ground the charge still covers at this pace. */
  readonly rangeTiles: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function energyView(state: LabState, agent: AgentState, nav?: Nav): EnergyView {
  const { scenario } = state;
  const { spec } = agent.robot;
  const usual = tileMotion(spec, scenario.defaultTerrain, 0, agent.pace);
  const perTileWh = usual.ok ? (usual.drawW * (scenario.tileM / usual.speedMps)) / 3600 : Infinity;
  const rangeTiles = Math.floor(((agent.batteryPct / 100) * spec.capacityWh) / perTileWh);
  const goal = finalGoal(scenario, agent.id);
  const known = goal !== undefined ? agent.knownObjects[goal.id] : undefined;
  const wayWh = known !== undefined ? (nav ?? navigate(navContextOf(state, agent), agent.cell)).energyWh[indexOf(scenario.map, known.at)]! : Infinity;
  if (!Number.isFinite(wayWh)) return { batteryPct: round1(agent.batteryPct), marginPct: round1(agent.batteryPct), rangeTiles };
  const returnPct = (wayWh / spec.capacityWh) * 100;
  return { batteryPct: round1(agent.batteryPct), returnPct: round1(returnPct), marginPct: round1(agent.batteryPct - returnPct), rangeTiles };
}
