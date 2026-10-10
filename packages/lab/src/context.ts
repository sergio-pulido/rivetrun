// Views of a robot that both the engine and the question builder need.
import { indexOf } from './grid';
import { navigate, type Nav, type NavContext } from './nav';
import { finalGoal } from './objectives';
import { tileMotion } from './robot';
import type { AgentState, LabState } from './types';
import { knownWorkTiles } from './wants';

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
  /**
   * Charge the known work left would cost at this pace: a rough tour of what the robot knows it still has to do,
   * the way to the end point included. Absent when it knows of nothing left.
   */
  readonly workPct?: number;
  /**
   * Projected charge at the finish: what is left after the known way to the end point; for a mission without an
   * end point, after the known work; the battery itself while neither is known. The energy trigger watches this.
   */
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
  const workTiles = knownWorkTiles(state, agent);
  const workPct = workTiles > 0 && Number.isFinite(perTileWh) ? ((workTiles * perTileWh) / spec.capacityWh) * 100 : undefined;
  const returnPct = Number.isFinite(wayWh) ? (wayWh / spec.capacityWh) * 100 : undefined;
  return {
    batteryPct: round1(agent.batteryPct),
    ...(returnPct !== undefined ? { returnPct: round1(returnPct) } : {}),
    ...(workPct !== undefined ? { workPct: round1(workPct) } : {}),
    marginPct: round1(agent.batteryPct - (returnPct ?? workPct ?? 0)),
    rangeTiles,
  };
}
