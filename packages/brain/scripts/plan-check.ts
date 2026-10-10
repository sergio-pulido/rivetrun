// Does the pregenerated plan help the driver? Jev alone against Jev + plan (the plan's briefing and priority) on the
// plan's mission, same build and seeds, headless, with Jev's real latency applied in sim time (as in the arena).
//   pnpm --filter @rivetrun/brain exec tsx --env-file-if-exists=../../apps/web/.env.local scripts/plan-check.ts M1 [seeds]
import { readFileSync } from 'node:fs';
import type { MissionId, Plan, PresetId } from '@rivetrun/contracts';
import { heuristicBrain, MISSIONS, PRESETS, runHeadless } from '@rivetrun/sim';
import { createJevBrain } from '../src/index';

const missionId = (process.argv[2] ?? 'M1') as MissionId;
const seeds = Array.from({ length: Number(process.argv[3] ?? 5) }, (_, i) => 1001 + i);
const file = JSON.parse(readFileSync(new URL(`../../../apps/web/data/plans/${missionId}.json`, import.meta.url), 'utf8')) as { plans: Record<PresetId, Plan> };
const jev = createJevBrain({ timeoutMs: 10_000 });
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

for (const presetId of Object.keys(file.plans) as PresetId[]) {
  const plan = file.plans[presetId]!;
  const rows: Record<string, { score: number[]; time: number[]; finished: number; scans: number }> = {};
  for (const [name, brain, build, options] of [
    ['Jev alone', jev, PRESETS[presetId].build, { priority: 0.5 }],
    ['Jev + plan', jev, plan.build, { priority: plan.priority, briefing: plan.briefing }],
    ['Fixed rules', heuristicBrain, PRESETS[presetId].build, { priority: 0.5 }],
  ] as const) {
    const row: { score: number[]; time: number[]; finished: number; scans: number } = { score: [], time: [], finished: 0, scans: 0 };
    rows[name] = row;
    for (const seed of seeds) {
      const { episode } = await runHeadless(MISSIONS[missionId], seed, build, brain, { ...options, policy: 'jev' });
      row.score.push(episode.outcome.score);
      if (episode.outcome.finished) { row.finished += 1; row.time.push(episode.outcome.timeS); }
      row.scans += episode.outcome.breakdown?.scansDone ?? 0;
    }
  }
  console.info(`${missionId} ${presetId} (plan by ${plan.generatedBy.model}, priority ${plan.priority}): ` + Object.entries(rows).map(([name, r]) => `${name} score ${Math.round(mean(r.score))}, ${r.time.length ? mean(r.time).toFixed(1) + ' s' : 'no finish'}, finished ${r.finished}/${seeds.length}, scans ${r.scans}`).join(' · '));
}
