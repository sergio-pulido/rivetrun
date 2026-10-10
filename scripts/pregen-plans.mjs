// Pregenerates the plans /play shows (docs/PLAY_AND_PLAN.md §1): one live planning call per preset for each mission,
// written to apps/web/data/plans/<missionId>.json with the model and date of each plan. Commit the files.
//   BASE=http://localhost:3000 node scripts/pregen-plans.mjs M1 [M5 …]
// Each call costs a few US cents and counts against ARENA_LIVE_CAP_USD on the server that answers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PRESETS = ['speedster', 'mud_crawler', 'all_rounder', 'deep_diver'];
const missions = process.argv.slice(2);
if (missions.length === 0) {
  console.error('Usage: node scripts/pregen-plans.mjs <missionId> [more mission ids]');
  process.exit(1);
}
const dir = fileURLToPath(new URL('../apps/web/data/plans/', import.meta.url));
mkdirSync(dir, { recursive: true });

for (const missionId of missions) {
  const plans = {};
  for (const presetId of PRESETS) {
    // A plan the model got wrong twice, or a server hiccup, is asked for again before giving up on the file.
    let response;
    let body = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(`${BASE}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ missionId, presetId }) }).catch(() => null);
      body = response ? await response.json().catch(() => ({})) : {};
      if (response?.ok && body.source === 'model') break;
      console.error(`${missionId} ${presetId}: attempt ${attempt + 1} gave ${response?.status ?? 'no answer'} ${body.source ?? body.error ?? ''}`);
    }
    if (!response?.ok || body.source !== 'model') {
      console.error(`${missionId} ${presetId}: no plan from a model (${response?.status ?? 'no answer'} ${body.source ?? body.error ?? ''}). File not written.`);
      process.exit(1);
    }
    plans[presetId] = body.plan;
    console.log(`${missionId} ${presetId}: ${body.plan.generatedBy.model} in ${(body.plan.generatedBy.ms / 1000).toFixed(1)} s${body.fellBackBecause ? ` (fallback: ${body.fellBackBecause})` : ''} · priority ${body.plan.priority} · "${body.plan.briefing}"`);
  }
  writeFileSync(`${dir}${missionId}.json`, `${JSON.stringify({ missionId, generatedAt: new Date().toISOString(), generatedWith: 'scripts/pregen-plans.mjs', plans }, null, 2)}\n`);
  console.log(`wrote apps/web/data/plans/${missionId}.json`);
}
