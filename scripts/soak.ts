// Soak run (OVN-SIM, outside `pnpm test`): the sim fuzz on many seeds.
//   node_modules/.pnpm/node_modules/.bin/tsx scripts/soak.ts [--seeds 20] [--runs 500]
import { fuzz } from '../packages/sim/src/fuzz.ts';

const arg = (flag: string, fallback: number): number => {
  const index = process.argv.indexOf(`--${flag}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
};
const seeds = arg('seeds', 20);
const runs = arg('runs', 500);
const started = Date.now();
let finished = 0;
const violations: string[] = [];
for (let i = 0; i < seeds; i += 1) {
  const result = fuzz(1000 + i, runs);
  finished += result.finished;
  violations.push(...result.violations);
}
console.log(`${seeds * runs} runs on ${seeds} seeds in ${((Date.now() - started) / 1000).toFixed(1)} s · ${finished} finished · ${violations.length} violations`);
for (const line of violations.slice(0, 20)) console.log(`  ${line}`);
process.exitCode = violations.length > 0 ? 1 : 0;
