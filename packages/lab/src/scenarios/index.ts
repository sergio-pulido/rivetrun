// The five Lab Missions, and a one-call headless run for the arena.
import type { Build } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { labHeuristicDecide } from '../brains';
import { runLabEntries, type LabRunOptions, type LabRunResult } from '../controller';
import type { LabBrain } from '../schema';
import type { LabOutcome } from '../score';
import type { LabScenario } from '../types';
import { LAB_PLAYER } from './common';
import { CTF } from './ctf';
import { HOUSE } from './house';
import { MARS } from './mars';
import { MAZE } from './maze';
import { WAREHOUSE } from './warehouse';

export { LAB_PLAYER, LAB_RIVAL } from './common';

export const LAB_SCENARIO_IDS = ['maze', 'warehouse', 'mars', 'house', 'ctf'] as const;
export type LabScenarioId = (typeof LAB_SCENARIO_IDS)[number];

export const LAB_SCENARIOS: Readonly<Record<LabScenarioId, LabScenario>> = { maze: MAZE, warehouse: WAREHOUSE, mars: MARS, house: HOUSE, ctf: CTF };

/** The seeds the arena and the tests run. The seed moves the forklifts and the storm, never the map. */
export const LAB_SEEDS = [1001, 1002, 1003] as const;

/** How long the default rival takes over each decision: about what a fast model takes, so a race against it is one a brain can win or lose. */
export const LAB_RIVAL_LATENCY_MS = 400;
const defaultRival: LabBrain = { decide: async (question) => ({ ...labHeuristicDecide(question), latencyMs: LAB_RIVAL_LATENCY_MS }) };

const ALL_ROUNDER = PRESETS.all_rounder.build;

/** A build that can complete each scenario, from parts that are unlocked from the start (the Mars one needs the moisture probe). */
export const LAB_DEFAULT_BUILDS: Readonly<Record<LabScenarioId, Build>> = {
  maze: ALL_ROUNDER,
  warehouse: ALL_ROUNDER,
  mars: { ...ALL_ROUNDER, sensors: ['camera', 'moisture_probe'] },
  house: ALL_ROUNDER,
  ctf: ALL_ROUNDER,
};

export interface LabHeadlessOptions extends LabRunOptions {
  /** The player's instructions to the driver; put on every question. */
  readonly briefing?: string;
  /** Two-robot scenarios: the other robot. Default: the same build, driven by the heuristic answering in `LAB_RIVAL_LATENCY_MS`. */
  readonly rival?: { readonly build?: Build; readonly brain?: LabBrain };
}

export interface LabHeadlessResult extends LabRunResult {
  /** The result of the robot under test (`outcomes.you`). */
  readonly outcome: LabOutcome;
}

/**
 * One robot, one brain, one scenario, as fast as the brain answers. A decision is asked only when a trigger fires;
 * an answer that throws or is not on offer is a miss and the last command holds; `latencyMs` passes on the sim clock
 * before a choice takes effect. Same seed, same answers, same latencies: same run.
 */
export async function runLabHeadless(scenario: LabScenarioId | LabScenario, seed: number, build: Build, brain: LabBrain, options: LabHeadlessOptions = {}): Promise<LabHeadlessResult> {
  const resolved = typeof scenario === 'string' ? LAB_SCENARIOS[scenario] : scenario;
  if (resolved === undefined) throw new Error(`@rivetrun/lab: unknown scenario "${String(scenario)}"`);
  const { briefing, rival, ...run } = options;
  const entries = resolved.agents.map((agent) =>
    agent.id === LAB_PLAYER
      ? { agentId: agent.id, build, brain, ...(briefing ? { briefing } : {}) }
      : { agentId: agent.id, build: rival?.build ?? build, brain: rival?.brain ?? defaultRival });
  const result = await runLabEntries(resolved, seed, entries, run);
  return { ...result, outcome: result.outcomes[LAB_PLAYER]! };
}
