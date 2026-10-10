// The stranger on every mission (OVN-SIM-9): two scripted players on the default build, on each mission's Drive seed.
//   naive   — holds full throttle, never brakes, never touches anything else
//   careful — the heuristic's commands, driven as a player (same physics as thumbs: no auto-timed jump)
//   node_modules/.pnpm/node_modules/.bin/tsx scripts/strangers.ts [--build <presetId>]
import type { Build, Outcome } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, MISSIONS, MISSION_IDS, PRESETS, carefulDrive, fullThrottleCheck, naiveDrive } from '../packages/sim/src/index.ts';

const presetArg = process.argv.indexOf('--build');
const presetId = (presetArg >= 0 ? process.argv[presetArg + 1] : DEFAULT_PRESET_ID) as keyof typeof PRESETS;
const build: Build = PRESETS[presetId].build;

const row = (missionId: string, driver: string, o: Outcome): string =>
  `| ${missionId} | ${driver.padEnd(7)} | ${o.finished ? 'yes' : `no (${o.dnfReason})`.padEnd(3)} | ${o.timeS.toFixed(1).padStart(5)} | ${o.damagePct.toFixed(0).padStart(3)} | ${o.stars} | ${o.score.toFixed(0).padStart(4)} | ${o.why ?? ''} |`;

console.log(`Build: ${presetId} · each mission on its Drive seed`);
console.log('| mission | driver | finish | time s | dmg % | stars | score | why |');
console.log('| - | - | - | - | - | - | - | - |');
for (const missionId of MISSION_IDS) {
  const mission = MISSIONS[missionId];
  console.log(row(missionId, 'naive', naiveDrive(build, mission)));
  console.log(row(missionId, 'careful', carefulDrive(build, mission)));
}
console.log('\nBrief tips in Drive mode (fullThrottleCheck):');
for (const missionId of MISSION_IDS) {
  const check = fullThrottleCheck(build, MISSIONS[missionId]);
  console.log(`  ${missionId}: ${check.finishes ? 'full throttle finishes' : check.tip ?? 'no driving saves this build here (the build warning covers it)'}`);
}
