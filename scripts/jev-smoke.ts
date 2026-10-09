// Three real Jev calls. Prints probabilities + latency per question.
// Run from the repo root:
//   node --experimental-strip-types --env-file-if-exists=apps/web/.env.local scripts/jev-smoke.ts
import type { BrainQuestion } from '@rivetrun/contracts';
import { createJevBrain, JEV_ENDPOINT, JEV_MODEL_ID } from '../packages/brain/src/index.ts';

const unknownPerception: BrainQuestion['perceived'] = {
  terrainAhead: 'unknown',
  terrainAheadDistanceM: 'unknown',
  obstacleAheadM: 'unknown',
  slipPct: 'unknown',
  tiltDeg: 'unknown',
  depthAheadCm: 'unknown',
};

const questions: readonly { name: string; question: BrainQuestion }[] = [
  {
    name: 'open asphalt, speed priority',
    question: {
      missionId: 'M1',
      t: 1.5,
      trigger: 'interval',
      perceived: { ...unknownPerception, terrainAhead: 'asphalt', terrainAheadDistanceM: 18, obstacleAheadM: null },
      status: { speedMps: 1.2, batteryPct: 96, damagePct: 0 },
      priority: 0.1,
      options: ['cruise', 'accelerate', 'slow_down', 'brake'],
      lookahead: [
        { action: 'cruise', progressM: 1.8, damagePct: 0, energyPct: 0.3 },
        { action: 'accelerate', progressM: 2.6, damagePct: 0, energyPct: 0.6 },
        { action: 'slow_down', progressM: 1.1, damagePct: 0, energyPct: 0.2 },
        { action: 'brake', progressM: 0.3, damagePct: 0, energyPct: 0.1 },
      ],
    },
  },
  {
    name: 'rock 1.2 m ahead, safety priority',
    question: {
      missionId: 'M5',
      t: 12.4,
      trigger: 'obstacle',
      perceived: { ...unknownPerception, terrainAhead: 'rock', terrainAheadDistanceM: 1.2, obstacleAheadM: 1.2, tiltDeg: 4 },
      status: { speedMps: 2.1, batteryPct: 74, damagePct: 12 },
      priority: 0.9,
      options: ['cruise', 'accelerate', 'slow_down', 'brake', 'climb_mode'],
      lookahead: [
        { action: 'cruise', progressM: 2.4, damagePct: 9, energyPct: 0.4 },
        { action: 'accelerate', progressM: 3.0, damagePct: 16, energyPct: 0.7 },
        { action: 'slow_down', progressM: 1.4, damagePct: 2, energyPct: 0.3 },
        { action: 'brake', progressM: 0.5, damagePct: 0, energyPct: 0.1 },
        { action: 'climb_mode', progressM: 1.0, damagePct: 0, energyPct: 0.9 },
      ],
    },
  },
  {
    name: 'slipping in mud, no camera, balanced',
    question: {
      missionId: 'M5',
      t: 27.0,
      trigger: 'slip',
      perceived: { ...unknownPerception, slipPct: 41, tiltDeg: 9 },
      status: { speedMps: 0.4, batteryPct: 38, damagePct: 22 },
      priority: 0.5,
      options: ['cruise', 'accelerate', 'slow_down', 'reverse', 'deploy_winch'],
      lookahead: [
        { action: 'cruise', progressM: 0.3, damagePct: 0, energyPct: 1.1 },
        { action: 'accelerate', progressM: 0.2, damagePct: 0, energyPct: 2.2 },
        { action: 'slow_down', progressM: 0.4, damagePct: 0, energyPct: 0.7 },
        { action: 'reverse', progressM: -0.6, damagePct: 0, energyPct: 0.8 },
        { action: 'deploy_winch', progressM: 1.3, damagePct: 0, energyPct: 1.6 },
      ],
    },
  },
];

const formatProbabilities = (probabilities: Record<string, number | undefined>): string =>
  Object.entries(probabilities)
    .map(([action, p]) => `${action} ${((p ?? 0) * 100).toFixed(1)}%`)
    .join(' | ');

async function main(): Promise<void> {
  console.log(`Jev smoke — ${JEV_ENDPOINT} — pinned model ${JEV_MODEL_ID}`);
  if (!process.env.JEV_API_KEY) {
    console.error('JEV_API_KEY is not set (expected in apps/web/.env.local). No call was made.');
    process.exitCode = 1;
    return;
  }
  // Smoke measures real latency, so it gets a generous timeout instead of the 1200 ms game budget.
  const brain = createJevBrain({ timeoutMs: 10_000 });
  let failures = 0;
  for (const { name, question } of questions) {
    try {
      const decision = await brain.decide(question);
      console.log(`\n[${name}]`);
      console.log(`  selected:      ${decision.selected}`);
      console.log(`  probabilities: ${formatProbabilities(decision.probabilities)}`);
      console.log(`  latency:       ${decision.latencyMs} ms   model: ${decision.model}`);
    } catch (error) {
      failures += 1;
      console.error(`\n[${name}] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

await main();
