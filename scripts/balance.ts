// Headless balance table: every build × every mission × {heuristic, random}.
// Run from the repo root:
//   node_modules/.pnpm/node_modules/.bin/tsx scripts/balance.ts [--seeds 3] [--all]
import type { Build } from '@rivetrun/contracts';
import { MISSIONS, MISSION_IDS, PRESETS, TUNING, deriveSpec, heuristicBrain, randomBrain, runHeadless } from '../packages/sim/src/index.ts';

const seedsFlag = process.argv.indexOf('--seeds');
const SEEDS = seedsFlag > 0 ? Number(process.argv[seedsFlag + 1]) : 3;

// Default: the presets plus one scout-drone build. --all adds more custom builds.
const CORE_BUILDS: Readonly<Record<string, Build>> = {
  speedster: PRESETS.speedster.build,
  mud_crawler: PRESETS.mud_crawler.build,
  all_rounder: PRESETS.all_rounder.build,
  drone_sprinter: { locomotion: 'offroad_wheels', motor: 'motor_light', battery: 'battery_large', sensors: ['scout_drone', 'ultrasonic'], extras: ['bumper'] },
  deep_diver: PRESETS.deep_diver.build,
  // Recommended for M7 Scrapyard Jumps: piston for the rampless gap, bumper for the landings.
  scrap_jumper: { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['piston_jump', 'bumper'] },
};
const EXTRA_BUILDS: Readonly<Record<string, Build>> = {
  // docs/inputs/m6-deep-water.md's build: the Deep Diver preset without the camera.
  deep_diver_doc: { locomotion: 'wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['ultrasonic'], extras: ['waterproof_case', 'thruster_kit'] },
  offroad_winch: { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['imu', 'ultrasonic'], extras: ['winch', 'bumper'] },
  camera_sprinter: { locomotion: 'offroad_wheels', motor: 'motor_light', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['bumper'] },
  drone_rounder: { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['scout_drone', 'ultrasonic'], extras: ['bumper'] },
  tracks_scout: { locomotion: 'tracks', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['bumper'] },
};

const BUILDS = process.argv.includes('--all') ? { ...CORE_BUILDS, ...EXTRA_BUILDS } : CORE_BUILDS;

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const pad = (value: string | number, width: number): string => String(value).padEnd(width);

async function main(): Promise<void> {
  console.log(`Balance — ${SEEDS} seed(s) per cell, budget €${TUNING.defaultBudgetEur}\n`);
  console.log(`| ${pad('mission', 7)} | ${pad('build', 15)} | ${pad('€', 3)} | ${pad('policy', 9)} | ${pad('finish', 6)} | ${pad('time s', 6)} | ${pad('dmg %', 5)} | ${pad('energy %', 8)} | ${pad('score', 5)} | why (seed 1)`);
  console.log(`|${'-'.repeat(9)}|${'-'.repeat(17)}|${'-'.repeat(5)}|${'-'.repeat(11)}|${'-'.repeat(8)}|${'-'.repeat(8)}|${'-'.repeat(7)}|${'-'.repeat(10)}|${'-'.repeat(7)}|---`);
  const solvedBy: Record<string, string[]> = {};
  for (const missionId of MISSION_IDS) {
    solvedBy[missionId] = [];
    for (const [name, build] of Object.entries(BUILDS)) {
      const cost = deriveSpec(build).costEur;
      for (const policy of ['heuristic', 'random'] as const) {
        const outcomes = [];
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const brain = policy === 'heuristic' ? heuristicBrain : randomBrain(seed);
          outcomes.push((await runHeadless(MISSIONS[missionId], seed, build, brain)).episode.outcome);
        }
        const finished = outcomes.filter((outcome) => outcome.finished).length;
        if (policy === 'heuristic' && finished === SEEDS && cost <= TUNING.defaultBudgetEur) solvedBy[missionId]!.push(name);
        console.log(
          `| ${pad(missionId, 7)} | ${pad(name, 15)} | ${pad(cost, 3)} | ${pad(policy, 9)} | ${pad(`${finished}/${SEEDS}`, 6)} | ${pad(mean(outcomes.map((o) => o.timeS)).toFixed(1), 6)} | ${pad(mean(outcomes.map((o) => o.damagePct)).toFixed(1), 5)} | ${pad(mean(outcomes.map((o) => o.energyUsedPct)).toFixed(1), 8)} | ${pad(Math.round(mean(outcomes.map((o) => o.score))), 5)} | ${outcomes[0]?.why ?? ''}`,
        );
      }
    }
  }
  console.log('\nSolved by (heuristic, every seed, within budget):');
  for (const missionId of MISSION_IDS) console.log(`  ${missionId}: ${solvedBy[missionId]!.join(', ') || 'NONE'}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
