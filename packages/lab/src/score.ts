import { completion, objectiveStatus } from './objectives';
import type { AgentState, AgentStats, AgentStatus, LabDnfReason, LabState } from './types';

export interface LabOutcome {
  readonly agentId: string;
  /** complete = every objective done · partial = ended early at the end point · dnf = did not get there. */
  readonly status: AgentStatus;
  readonly finished: boolean;
  readonly dnfReason?: LabDnfReason;
  readonly timeS: number;
  readonly damagePct: number;
  readonly energyUsedPct: number;
  readonly costEur: number;
  readonly objectivesDone: number;
  readonly objectivesTotal: number;
  /** Share of the mission done, 0–1, counted in units (each parcel, each room). */
  readonly completion: number;
  readonly score: number;
  readonly stars: number;
  /** One line on how it went, from ground truth. */
  readonly why: string;
  readonly stats: AgentStats;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function why(agent: AgentState, done: number, total: number, timeS: number): string {
  const { stats } = agent;
  const knocks = [
    stats.bumps > 0 ? `${stats.bumps} bump${stats.bumps === 1 ? '' : 's'}` : '',
    stats.falls > 0 ? `${stats.falls} fall${stats.falls === 1 ? '' : 's'}` : '',
    stats.collisions > 0 ? `${stats.collisions} collision${stats.collisions === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(', ');
  switch (agent.status === 'dnf' ? agent.dnfReason : agent.status) {
    case 'complete': return `Done in ${round1(timeS)} s with ${Math.round(agent.batteryPct)} % charge left${knocks ? ` (${knocks})` : ''}`;
    case 'partial': return `Ended early with ${done} of ${total} objectives done and ${Math.round(agent.batteryPct)} % charge left`;
    case 'battery': return `Out of charge after ${stats.tiles} tiles, ${done} of ${total} objectives done`;
    case 'damage': return `Wrecked: ${knocks || 'too much damage'}`;
    case 'beaten': return 'The other robot got there first';
    case 'stuck': return `Nothing left it could do, ${done} of ${total} objectives done`;
    default: return `Out of time, ${done} of ${total} objectives done`;
  }
}

/** The result for one robot, at any point of the run (final once the robot is no longer running). */
export function scoreLab(state: LabState, agentId: string): LabOutcome {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`@rivetrun/lab: no robot "${agentId}"`);
  const weights = state.scenario.score;
  const statuses = objectiveStatus(state, agent);
  const done = statuses.filter((s) => s.done).length;
  const share = completion(state, agent);
  const timeS = agent.endT ?? state.t;
  const energyUsedPct = 100 - agent.batteryPct;
  const costEur = agent.robot.spec.costEur;
  const full = Math.max(0, weights.base - weights.perSecond * timeS - weights.perDamagePct * agent.damagePct - weights.perEnergyPct * energyUsedPct - costEur / weights.costDivisor);
  const score = Math.round(agent.status === 'complete' ? full : agent.status === 'partial' ? full * share : weights.dnfMax * share);
  const stars = agent.status === 'complete' ? 1 + (score >= weights.starThreshold ? 1 : 0) + (score >= weights.starThreshold && agent.damagePct === 0 ? 1 : 0)
    : agent.status === 'partial' && share >= 0.5 ? 1 : 0;
  return {
    agentId, status: agent.status, finished: agent.status === 'complete', ...(agent.dnfReason ? { dnfReason: agent.dnfReason } : {}),
    timeS: round1(timeS), damagePct: round1(agent.damagePct), energyUsedPct: round1(energyUsedPct), costEur,
    objectivesDone: done, objectivesTotal: statuses.length, completion: Math.round(share * 100) / 100, score, stars,
    why: why(agent, done, statuses.length, timeS), stats: agent.stats,
  };
}
