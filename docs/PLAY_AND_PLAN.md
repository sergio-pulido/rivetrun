# RivetRun — Plan slow, drive fast · 3-tap play · auto rooms (decided Sat 12:55)

Marker: RR-PLAN

Idea: a reasoning model plans before the run (parts and strategy); a fast model decides during the run. Players pick a vehicle, an agent and a strategy in 3 taps within 30 s. One QR, no room code: rooms fill up and start on their own.

Pitch line: "Think slow before. Decide fast during."

## Build on what exists (do not rebuild)
- 4 presets: `PRESETS` in packages/sim/src/data/parts.ts (speedster, mud_crawler, all_rounder, deep_diver).
- Brief the brain: `BrainQuestion.briefing` (max 140 chars), `BRIEFING_PRESETS` (daredevil, careful, eco) and `priority` 0..1 in packages/contracts/src/brain.ts. Jev already reads the briefing; the heuristic ignores it.
- Room Race: apps/web/app/api/_lib/raceStore.ts, /api/race/[code], /race/[code], JEV bots, arena bots, /screen?mode=play.
- Ghost precompute and cache: apps/web/app/api/_lib/ghostStore.ts.

## 1. Plan: "Analyze scenario" (reasoning model, before the run)
- `POST /api/plan { missionId, presetId? }` returns a Plan.
- The model sees the mission brief only: length, terrain and hazards as the Brief shows them (with safe speeds), scan zones and the sensor each needs, weather. Plus the parts catalog with effects, the 4 presets, the scoring rules and the brains' p50 latency. Never track data beyond the brief.
- Output, Zod-validated (`PlanSchema` in contracts): `{ build (valid Build), presetId (closest preset), priority 0..1, briefing (max 140 chars), rationale (max 300 chars), partsWhy: up to 4 { partId, why (max 80 chars) }, generatedBy { provider, model, ms, at } }`.
- Model: env `PLAN_MODEL`, default `claude-sonnet-5-5` with extended thinking and a small budget (target under 20 s).
- Fallback: if Anthropic returns a billing, auth or 5xx error, or takes over 30 s, use GPT-6.1 Sol through the existing OpenAI adapter, and record that in generatedBy. Invalid output: retry once with the validation error, then fall back to the pregenerated plan for the closest preset.
- Pregenerated plans: one per (hands-on mission, preset), plus the demo mission if it differs. Committed to apps/web/data/plans/<missionId>.json with model and date. /play reads only these and never calls the model.
- Keys stay server-side. Cost per call goes to the arena cost ledger; live calls count against ARENA_LIVE_CAP_USD.

## 2. The plan reaches every brain
- The plan's briefing and priority go into BrainQuestion for Jev (exists) and into the shared arena prompt for every LLM adapter. Same text for all: fairness. The heuristic uses priority only.
- Labels: "<brain> + plan" on lanes and chips when a plan is applied.
- Claim only what the rehearsal shows. If Jev + plan does not beat Jev alone on the demo mission, say "plan" without "better".

## 3. Lab: Analyze panel (the demo step)
- /lab gets "Analyze scenario": pick a mission, press Analyze (shows the model name and a thinking timer), get a card with:
  - the build as a parts list with partsWhy;
  - the rationale;
  - an editable briefing (140-char counter) and a priority slider.
- Actions:
  - "Test with heuristic": instant local run showing time, damage and energy at the finish.
  - "Open in Workshop": loads the build.
  - "Race in Arena": creates an arena room with 4 lanes (Jev + plan · Jev alone · GPT-6.1 Sol alone, reasoning while driving · GPT-6 Luna + plan) and opens /screen for it.
- Caption: "Plan by <model> in <s> s. The driver only sees what its sensors report."

## 4. /play: 3 taps in 30 s (phones)
- The QR points to /play. No room code. `POST /api/race/match` returns `{ code, endsAt }`.
- Tap 1, Vehicle: 4 preset cards (render, name, one blurb line). Default All-rounder.
- Tap 2, Agent: Jev, GPT-6 Luna, DeepSeek Flash, "You drive". Default Jev. Each card shows its p50 latency from the arena results.
- Tap 3, Strategy: "Claude's plan ★" (pregenerated for this mission and vehicle, with a one-line rationale), Daredevil, Careful, Eco. Default Claude's plan. If the plan came from another provider, the card names the real model.
- A 30-s ring shows the room's countdown. Each tap moves to the next step. No tap is required: defaults apply at 0.
- Picks are sent with `POST /api/race/[code]/pick` as a PlayerPick.
- When the room starts:
  - agent = human: the existing race drive screen;
  - any other agent: the phone shows its robot racing with decision chips (the Room Race bot path) and a strategy chip.
- Result: place, time vs Jev + plan, and "Play again", which matches again.
- `PlayerPick` (contracts): `{ presetId, agent: <existing arena contestant id> | 'human', strategy: 'plan' | BriefingPresetId }`. The server resolves the briefing and priority; phones never send free text.

## 5. Auto rooms (matchmaking)
- Rooms the matchmaker creates are auto rooms:
  - Same mission (env PLAY_MISSION, from the rehearsal) and the same fixed seed for everyone, so the board compares like with like.
  - Cap: 8 humans.
  - At the start, Jev + plan bots fill the room to at least 4 lanes.
- Matching:
  - Join the oldest auto room that is in the lobby, has a free slot and has more than 8 s left.
  - Otherwise create a new room.
  - At most MAX_AUTO_ROOMS rooms (default 8) can be in the lobby or racing. Beyond that the phone shows "Next race in N s" and retries.
- The countdown is 30 s from the first join. The race starts when it ends, or earlier if the room is full and everyone has picked. Players who have not picked get the defaults.
- After the results, the room closes in 60 s. Results feed /api/arena/humans (today's board), tagged with the pick.
- Rooms with codes (/screen hosts, arena rooms) keep working unchanged.

## 6. Load through the quick tunnel
- Cloudflare Quick Tunnels do not support SSE and allow at most 200 in-flight requests (Cloudflare docs, TryCloudflare page).
- Today every phone opens an EventSource, waits 3.5 s of silence, then polls every 250 ms.
- Fix: when the page host ends with `.trycloudflare.com`, or `RACE_TRANSPORT=poll`, skip the EventSource. Phones poll every 1000 ms; /screen polls every 250 ms. Keep one request at a time per client (exists).
- Player-picked AI agents run through the ghost path. The cache key includes preset, agent, strategy, mission, seed and gameplay version.
- `scripts/prewarm-play.mjs` runs every combo for the hands-on mission (4 presets × 3 AI agents × 4 strategies = 48 runs) against the served build before the demo.
- `scripts/loadtest-play.mjs`:
  - N simulated phones (default 40) match, pick (human, or cached combos), poll and post a scripted result.
  - Its rooms are marked as test rooms and stay off every board.
  - Pass: no 429 or 5xx, every client reaches results, p95 poll under 500 ms.

## 7. /screen?mode=play
- The QR points to /play.
- A grid of live auto rooms, up to 8 tiles. Each tile shows its lanes as progress bars with name, agent and strategy chips, plus the countdown or the places.
- Today's board gains "Best combo today: <vehicle> · <agent> · <strategy>" and how many runs beat Jev + plan.

## Ownership (this item only)
- sim:
  - PlayerPick and PlanSchema in contracts first; push by 13:05.
  - Auto rooms, the match and pick routes, the countdown and auto start in raceStore. raceStore and the race routes are handed over from brain for this item.
  - The transport fix in useRaceRoom.
  - The rooms grid component, mounted with one line in /screen?mode=play.
  - The load test script.
- brain:
  - /api/plan with the provider fallback, and the pregenerated plans.
  - Briefing and priority in every arena adapter.
  - Picked-agent runs through the ghost path, with the new cache key.
  - The "Race in Arena" room with 4 lanes, and the prewarm script.
  - Does not edit raceStore or the race routes until sim reports done.
- ui: the /play picker and the Lab Analyze panel.
- game: the strategy chip on the phone HUD and the race watch view.
- master:
  - e2e for /play (match → 3 taps → result) and for Lab Analyze with a stubbed model.
  - The load test against :3000.
  - Go/no-go at 14:15.

## Timeline and cut lines
- 13:05: contracts pushed.
- 13:50: each piece green on its own route; the old flows untouched.
- 14:15: [MASTER] go/no-go per piece. Fallbacks:
  - No auto rooms: manual codes on /screen, as today.
  - No non-Jev phone agents: offer Jev and "You drive" only.
  - No live Analyze: the pregenerated plan, with its label.
- 15:00, human: run the prewarm and the load test against the tunnel URL on the served tag.
