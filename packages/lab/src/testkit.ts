// Fixtures shared by the Lab tests.
import type { Build } from '@rivetrun/contracts';
import { command, stepLab } from './engine';
import { markerCell, parseMap } from './grid';
import type { AgentState, LabCommand, LabObjectDef, LabScenario, LabState } from './types';

export const BASE: Build = { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: [], extras: [] };
export const withSensors = (...sensors: string[]): Build => ({ ...BASE, sensors });

/** A one-robot scenario from an ASCII map: `S` is the start, `E` (when present) an exit to reach. */
export function scenarioOf(rows: readonly string[], extra: Partial<LabScenario> = {}, rampDeg?: number): LabScenario {
  const map = parseMap(rows, { defaultTerrain: 'asphalt', ...(rampDeg !== undefined ? { rampDeg } : {}) });
  const exit: LabObjectDef[] = map.markers.E ? [{ id: 'exit', kind: 'exit', label: 'Exit', at: markerCell(map, 'E') }] : [];
  return {
    id: 'test', name: 'Test', description: '', map, tileM: 1, defaultTerrain: 'asphalt', indoor: true, planMap: false,
    agents: [{ id: 'you', label: 'You', start: markerCell(map, 'S'), heading: 'E' }],
    objects: exit, zones: [], movers: [], weather: [],
    objectives: [{ id: 'reach', label: 'Reach the exit', type: 'reach', target: 'exit' }],
    carryLimit: 1, ends: 'each', tagDrops: false, maxS: 120,
    score: { base: 1000, perSecond: 4, perDamagePct: 6, perEnergyPct: 2, costDivisor: 5, dnfMax: 200, starThreshold: 600 },
    ...extra,
  };
}

export const you = (state: LabState): AgentState => state.agents.find((agent) => agent.id === 'you')!;

const settled = (agent: AgentState): boolean => agent.command.type === 'idle' && agent.move === undefined && agent.busy === undefined;

/** Gives the robot a command and steps until it has nothing left to do (or the run ends). Returns every state on the way. */
export function drive(state: LabState, next: LabCommand, agentId = 'you', maxSteps = 4000): LabState[] {
  const states = [stepLab(command(state, agentId, next))];
  for (let i = 0; i < maxSteps; i += 1) {
    const last = states[states.length - 1]!;
    const agent = last.agents.find((a) => a.id === agentId)!;
    if (last.done || agent.status !== 'running' || settled(agent)) break;
    states.push(stepLab(last));
  }
  return states;
}

export const last = <T>(items: readonly T[]): T => items[items.length - 1]!;
