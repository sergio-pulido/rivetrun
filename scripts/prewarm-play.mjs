// Prewarms every combination a phone can pick on /play (docs/PLAY_AND_PLAN.md §6): 4 vehicles × 3 AI agents ×
// 4 strategies = 48 runs on the hands-on mission, driven once on the served build so no phone waits for one.
// Run it against the server the audience will use, after it has started and before the demo:
//   BASE=http://localhost:3001 node scripts/prewarm-play.mjs [missionId]
// The two paid agents (GPT-6 Luna, DeepSeek Flash) cost about half a US cent a run: about US$0.20 in all, under the
// server's ARENA_LIVE_CAP_USD.
const BASE = process.env.BASE ?? 'http://localhost:3001';
const mission = process.argv[2];
const PRESETS = ['speedster', 'mud_crawler', 'all_rounder', 'deep_diver'];
const AGENTS = ['jev-1.13.0', 'gpt-6-luna', 'deepseek-flash'];
const STRATEGIES = ['plan', 'daredevil', 'careful', 'eco'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const combos = PRESETS.flatMap((preset) => AGENTS.flatMap((agent) => STRATEGIES.map((strategy) => ({ preset, agent, strategy }))));
const url = (combo) => `${BASE}/api/play/ghost?${new URLSearchParams({ ...combo, ...(mission ? { mission } : {}), status: '1' })}`;
const state = new Map(combos.map((combo) => [JSON.stringify(combo), 'asked']));
const started = Date.now();

// Ask for all of them (the server queues and runs a few at a time), then wait until each is ready or given up on.
for (let round = 0; round < 240; round++) {
  let open = 0;
  for (const combo of combos) {
    const key = JSON.stringify(combo);
    if (state.get(key) === 'ready' || state.get(key) === 'unavailable') continue;
    try {
      const body = await (await fetch(url(combo))).json();
      if (body.status === 'ready') {
        state.set(key, 'ready');
        console.log(`ready  ${combo.preset.padEnd(12)} ${combo.agent.padEnd(15)} ${combo.strategy.padEnd(10)} ${body.finished ? `${body.timeS} s` : 'did not finish'} · ${body.decisions} decisions, ${body.fallbacks} by the fixed rules`);
      } else if (body.status === 'unavailable') {
        // The server retries a failed run after 30 s: keep asking for a while before giving up on it.
        if (round > 60) state.set(key, 'unavailable');
        else open += 1;
      } else open += 1;
    } catch {
      open += 1;
    }
  }
  if (open === 0) break;
  await sleep(2000);
}
const ready = [...state.values()].filter((value) => value === 'ready').length;
const missing = [...state].filter(([, value]) => value !== 'ready').map(([key]) => key);
console.log(`\n${ready} of ${combos.length} runs ready in ${Math.round((Date.now() - started) / 1000)} s on ${BASE}.`);
if (missing.length > 0) console.log(`Not ready:\n${missing.join('\n')}`);
const spend = await fetch(`${BASE}/api/arena/decide`).then((r) => r.json()).catch(() => null);
if (spend) console.log(`Live model spend on this server so far: US$${spend.spentUsd} of US$${spend.capUsd}.`);
process.exit(ready === combos.length ? 0 : 1);
