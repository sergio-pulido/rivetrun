// Prewarms every combination a phone can pick on /play (docs/PLAY_AND_PLAN.md §6, amended 10 Oct 14:00): the play
// missions × 4 vehicles × 3 AI drivers, each with Claude's stored plan for that mission and vehicle. 4 missions = 48
// runs, driven once on the served build so that no phone waits for one and no visitor request has to call a model.
// Run it against the server the audience will use, after it has started and before the demo:
//   BASE=http://localhost:3001 node scripts/prewarm-play.mjs [M7,M5,M8,M6]
// The two paid drivers (GPT-6 Luna, DeepSeek Flash) cost about one US cent a run: about US$0.30 in all. Run it from
// the presenter's machine (localhost): those calls then count against ARENA_LIVE_CAP_USD, not the visitors' budget.
const BASE = process.env.BASE ?? 'http://localhost:3001';
const MISSIONS = (process.argv[2] ?? process.env.PLAY_MISSIONS ?? 'M7,M5,M8,M6').split(',').map((id) => id.trim()).filter(Boolean);
const PRESETS = ['speedster', 'mud_crawler', 'all_rounder', 'deep_diver'];
const AGENTS = ['jev-1.13.0', 'gpt-6-luna', 'deepseek-flash'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const combos = MISSIONS.flatMap((mission) => PRESETS.flatMap((preset) => AGENTS.map((agent) => ({ mission, preset, agent, strategy: 'plan' }))));
const url = (combo) => `${BASE}/api/play/ghost?${new URLSearchParams({ ...combo, status: '1' })}`;
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
        console.log(`ready  ${combo.mission} ${combo.preset.padEnd(12)} ${combo.agent.padEnd(15)} ${body.pick?.plan ? 'plan' : 'NO PLAN STORED'} ${body.finished ? `${body.timeS} s` : 'did not finish'} · ${body.decisions} decisions, ${body.fallbacks} by the fixed rules`);
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
