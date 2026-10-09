// Question tuning: 6 fixed test states → real Jev calls → probabilities, checked against the sensible actions.
// Each state is asked twice (options in sim order and reversed) to expose option-order bias (docs/JEV.md).
//   pnpm --filter @rivetrun/brain tune
import type { Action, BrainQuestion, LookaheadEntry, Perception } from '@rivetrun/contracts';
import { createJevBrain, JEV_MODEL_ID } from '../src/index';

const UNKNOWN: Perception = {
  terrainAhead: 'unknown',
  terrainAheadDistanceM: 'unknown',
  obstacleAheadM: 'unknown',
  slipPct: 'unknown',
  tiltDeg: 'unknown',
  depthAheadCm: 'unknown',
};

interface TestState {
  readonly name: string;
  readonly sensible: readonly Action[];
  readonly question: BrainQuestion;
}

const look = (rows: readonly (readonly [Action, number, number, number])[]): LookaheadEntry[] =>
  rows.map(([action, progressM, damagePct, energyPct]) => ({ action, progressM, damagePct, energyPct }));

const state = (
  name: string,
  sensible: readonly Action[],
  partial: Pick<BrainQuestion, 'trigger' | 'perceived' | 'status' | 'priority'>,
  rows: readonly (readonly [Action, number, number, number])[],
): TestState => ({
  name,
  sensible,
  question: { missionId: 'M5', t: 10, ...partial, options: rows.map(([action]) => action), lookahead: look(rows) },
});

// States 1, 3 and 4 are taken from a traced M5 All-rounder run; 2, 5 and 6 are hand-built edge cases.
const STATES: readonly TestState[] = [
  state(
    '1 open asphalt, balanced',
    ['cruise', 'accelerate'],
    {
      trigger: 'interval',
      perceived: { ...UNKNOWN, terrainAhead: 'asphalt', terrainAheadDistanceM: 6.5, obstacleAheadM: null },
      status: { speedMps: 1.37, batteryPct: 99, damagePct: 0 },
      priority: 0.5,
    },
    [['cruise', 2.09, 0, 0.26], ['accelerate', 2.79, 0, 0.29], ['slow_down', 1.28, 0, 0.27], ['brake', 0.47, 0, 0.09], ['reverse', -0.4, 0, 0.36], ['climb_mode', 1.51, 0, 0.33]],
  ),
  state(
    '2 open asphalt, speed priority',
    ['accelerate'],
    {
      trigger: 'interval',
      perceived: { ...UNKNOWN, terrainAhead: 'asphalt', terrainAheadDistanceM: 18, obstacleAheadM: null },
      status: { speedMps: 1.2, batteryPct: 96, damagePct: 0 },
      priority: 0.1,
    },
    [['cruise', 1.8, 0, 0.3], ['accelerate', 2.6, 0, 0.6], ['slow_down', 1.1, 0, 0.2], ['brake', 0.3, 0, 0.1]],
  ),
  state(
    '3 water 1.5 m ahead, moving, balanced',
    // Every forward option has negligible damage here (≤ 0.7 %), so any of them is sensible; stopping is not.
    ['cruise', 'accelerate', 'slow_down', 'climb_mode'],
    {
      trigger: 'interval',
      perceived: { ...UNKNOWN, terrainAhead: 'water', terrainAheadDistanceM: 1.51, obstacleAheadM: null },
      status: { speedMps: 1.4, batteryPct: 96, damagePct: 0 },
      priority: 0.5,
    },
    [['cruise', 2.1, 0.4, 0.42], ['accelerate', 2.79, 0.7, 0.44], ['slow_down', 1.29, 0, 0.39], ['brake', 0.48, 0, 0.09], ['reverse', -0.61, 0, 0.5], ['climb_mode', 1.52, 0, 0.48]],
  ),
  state(
    '4 stopped in front of water, balanced',
    ['cruise', 'accelerate', 'slow_down', 'climb_mode'],
    {
      trigger: 'interval',
      perceived: { ...UNKNOWN, terrainAhead: 'water', terrainAheadDistanceM: 0.97, obstacleAheadM: null },
      status: { speedMps: 0, batteryPct: 95, damagePct: 0 },
      priority: 0.5,
    },
    [['cruise', 1.5, 0.3, 0.51], ['accelerate', 1.91, 0.5, 0.58], ['slow_down', 0.81, 0, 0.47], ['brake', 0, 0, 0.09], ['reverse', -0.81, 0, 0.47], ['climb_mode', 1.04, 0.1, 0.58]],
  ),
  state(
    '5 rock 1.2 m ahead at speed, safety priority',
    ['slow_down', 'climb_mode'],
    {
      trigger: 'obstacle',
      perceived: { ...UNKNOWN, terrainAhead: 'rock', terrainAheadDistanceM: 1.2, obstacleAheadM: 1.2, tiltDeg: 4 },
      status: { speedMps: 2.1, batteryPct: 74, damagePct: 12 },
      priority: 0.9,
    },
    [['cruise', 2.4, 9, 0.4], ['accelerate', 3.0, 16, 0.7], ['slow_down', 1.4, 2, 0.3], ['brake', 0.5, 0, 0.1], ['climb_mode', 1.0, 0, 0.9]],
  ),
  state(
    '6 slipping in mud, no camera, balanced',
    ['deploy_winch'],
    {
      trigger: 'slip',
      perceived: { ...UNKNOWN, slipPct: 41, tiltDeg: 9 },
      status: { speedMps: 0.4, batteryPct: 38, damagePct: 22 },
      priority: 0.5,
    },
    [['cruise', 0.3, 0, 1.1], ['accelerate', 0.2, 0, 2.2], ['slow_down', 0.4, 0, 0.7], ['reverse', -0.6, 0, 0.8], ['deploy_winch', 1.3, 0, 1.6]],
  ),
];

const reversed = (question: BrainQuestion): BrainQuestion => ({
  ...question,
  options: [...question.options].reverse(),
  lookahead: [...question.lookahead].reverse(),
});

async function main(): Promise<void> {
  if (!process.env.JEV_API_KEY) {
    console.error('JEV_API_KEY is not set (expected in apps/web/.env.local). No call was made.');
    process.exitCode = 1;
    return;
  }
  const brain = createJevBrain({ timeoutMs: 10_000 });
  console.info(`Jev question tuning — model ${JEV_MODEL_ID}\n`);
  let sensibleCount = 0;
  for (const test of STATES) {
    const [forward, backward] = await Promise.all([brain.decide(test.question), brain.decide(reversed(test.question))]);
    const ok = test.sensible.includes(forward.selected);
    if (ok) sensibleCount += 1;
    const row = (p: typeof forward.probabilities): string =>
      test.question.options.map((action) => `${action} ${((p[action] ?? 0) * 100).toFixed(0)}%`).join(' | ');
    console.info(`[${test.name}]  sensible: ${test.sensible.join(' / ')}`);
    console.info(`  ${ok ? 'OK ' : 'BAD'} ${forward.selected.padEnd(12)} ${row(forward.probabilities)}   (${forward.latencyMs} ms)`);
    console.info(`  reversed order → ${backward.selected.padEnd(12)} ${row(backward.probabilities)}\n`);
  }
  console.info(`${sensibleCount}/${STATES.length} sensible`);
}

await main();
