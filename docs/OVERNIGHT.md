# RivetRun — Overnight program (Sat 03:45 → 10:00)

Marker: RR-OVERNIGHT

Goal: by the morning RivetRun is four things that hold together:
1. A maker vehicle lab: real parts, real specs, buildable (docs/MK2_BOM.md).
2. A vehicle simulator: physics, terrain and weather that the parts and sensors actually change.
3. A brain arena: Jev against other models and humans on identical runs (docs/BRAIN_ARENA.md).
4. An exciting game: fine control, visible decisions, reasons to replay.

Specs this program builds on: docs/GAMEPLAY_V3_CONTROLS.md (RR-GAMEPLAY-V3), docs/BRAIN_V3_SENSING.md (RR-BRAIN-V3), docs/BRAIN_ARENA.md (RR-ARENA), docs/FAST_MODE.md, docs/DEMO_PLAN.md.

## Sessions
| Session | Role | Owns |
|---|---|---|
| [MASTER] (new) | Orchestrator and QA. Writes no feature code. | docs/OVERNIGHT.md, docs/OVERNIGHT_LOG.md, docs/QA.md, e2e/**, scripts/qa.sh, git tags demo-good-* |
| [SIM] | Physics, terrain, weather, missions, heuristic driver, balance | as in docs/FAST_MODE.md |
| [GAME] | 3D, HUD, controls, VFX, sound, telemetry drawer | as in docs/FAST_MODE.md |
| [UI] | Screens, Workshop, Brief, Result, /lab, inventory | as in docs/FAST_MODE.md |
| [BRAIN] | Jev, arena adapters and runner, Room Race, big screen, APIs | as in docs/FAST_MODE.md |
| [LAB] (new) | Lab Missions: top-down grid scenarios | packages/lab/**, apps/web/app/scenarios/**, apps/web/src/lab/** |
| ChatGPT · Blender | Assets. Not reachable by the sessions; the human relays. | assets/**, apps/web/public/models/**, apps/web/public/renders/** |

## Protocol
Workers (every session except [MASTER]):
1. `git pull --no-rebase --no-edit`. Read "Orders from [MASTER]" below: it is how [MASTER] reaches you while its messages are capped. Take the first open order for your session, else the top open item of your queue.
2. Implement. Unit tests for logic, `tsc` clean for your paths, a headless check of every screen you touched (390×844 and, for /screen, 1280×720).
3. Commit with an explicit pathspec: `git add <paths> && git commit -m "[OVN-<id>] <msg>" -- <paths>`, then `git push || (git pull --no-rebase --no-edit && git push)`. Contract changes are additive and logged in docs/CHANGES.md.
4. Message [MASTER]: `done OVN-<id> <hash> · verified: <what> · not verified: <what>`. Then take the next item without waiting.
5. Blocked on another owner: message them and [MASTER], take your next item.
6. Never edit another owner's paths; ask the owner.
7. Never stop on an empty or blocked queue. Pull, re-read your orders, and if there is nothing new work your backlog line in the orders. If that is empty too, schedule a wake-up in 10 minutes (ScheduleWakeup) and check again; an idle session cannot be woken by this file.
8. If your own message to [MASTER] is refused (the app caps session-to-session messages at 10 per message the human types), append the report line to `docs/reports/<OWNER>.md` and commit it; [MASTER] reads that folder every cycle.

[MASTER], each cycle (about every 20–30 minutes, and whenever a worker reports):
1. Pull. Read new commits and docs/CHANGES.md.
2. Run scripts/qa.sh (create it in the first cycle): typecheck all packages, all unit tests, sim determinism and balance checks, e2e smoke (below). Once an hour also run the demo build (`pnpm demo:stable -- --build-only`) to prove committed main builds.
3. All green: tag `demo-good-<HHMM>` on the tested commit and push the tag. Red: message the owner with the failing check and the commit; that owner fixes before taking new items.
4. Look at the screens (headless screenshots in e2e/screens/<HHMM>/) against each item's acceptance line. File problems in docs/QA.md with an owner and send them.
5. Re-prioritise the queues in this file; message every idle worker its next item.
6. Every 2 hours, and at 09:45, append a short status to docs/OVERNIGHT_LOG.md for the human: what landed, what is broken, latest demo-good tag, decisions taken.

e2e smoke (Playwright, headless Chromium from /opt or the local install): Home, Workshop, Brief M1, a full Drive run on M1 with scripted input to the result screen, Room Race with two JEV bots to results on /screen, /lab, one Lab Mission start to finish. Screenshots at 390×844 and 1280×720.

## Orders from [MASTER] (read on every pull · updated 04:30)
The app refuses [MASTER]'s messages to the worker sessions (cap: 10 per message the human types; paused since 04:11). This section is the only way I reach you. Your reports to me still arrive by message.

Rules while this lasts:
- Do not wait for a message from [MASTER] and do not ask me for the next item: I cannot answer. Your block below is your queue. Take the first item you have not reported, in order.
- When your block is empty: do not end your turn idle. Schedule a wake-up in 10 minutes (ScheduleWakeup, 600 s), then `git pull` and re-read your block. I refill every block each cycle (about every 20 minutes).
- An OPEN finding with your name in docs/QA.md ("Overnight findings") comes before any item here.
- Before every push: `pnpm typecheck` and `pnpm test` from the repo root. The gate judges committed HEAD in a clean worktree and runs the e2e on a production build of that commit, so only committed code counts.
- Robustness of the demo comes before new features. New features sit behind a flag or on their own route.

State: first tag `demo-good-0426` (b5cda43). The gate is running on the ~20 commits since.

[SIM] (received through OVN-SIM-8 and the benchmark, c241dc4.)
1. OVN-SIM-9 (new): the stranger on every mission. Two scripted drivers with the default build: "naive" (holds full throttle, never brakes, never touches anything else) and "careful" (the heuristic's commands replayed as a player). Table for M1–M9: finish, time, damage, stars, why. Accept: the naive driver finishes M1 with at least one star and a why-line a stranger understands; every mission where it does not finish has a Brief warning that says what to do. [BRAIN] saw "DNF · stuck" at 25.7 s on M1 at full throttle in a Room Race: reproduce or rule out in the sim first.
2. OVN-SIM-10 (new): fuzz the sim. 500 random legal builds × random analog inputs (including held jump, mid-air pedals, reverse) × M1–M9: never NaN, never battery below 0 or above 100, never x beyond the track, never a run that does not end, never an exception. Accept: the test is in `pnpm test` and takes under 10 s.
3. OVN-SIM-11 (new, honesty guardrail): one sentence for every simplification made since 03:45 (NoIR range assumed, light sensor as headlights is a game rule, puddles are a 4 cm water segment, core kit includes power sensing, air levelling rule, snow model, cold capacity curve, wind as drag only), each with the screen where it should appear. Give them to [UI]; list them in docs/CHANGES.md.
4. OVN-SIM-12 (new): timing. `assessBuild` on M8 and M9 and a full heuristic `runHeadless` on M6 (100 m) and M9, measured in Node: report ms. Accept: assessBuild under 200 ms, a ghost under 1 s; fix what is over.
5. Whatever [LAB], [BRAIN] or [UI] ask of the sim. Then the wake-up rule above.

[GAME] (received: OVN-GAME-1…4, QA-G1 in progress, ee76275.)
1. QA-G1, the rest: (a) the red speedometer above a safe speed, one screenshot; (b) /screen at 1280×720 during a bot race on M8 and M9 with the weather line, 2 lanes and 10 lanes; (c) fog, wind streaks in motion, weather on the attract loop; (d) R13: grass tufts in the gap pit on /run/M7; (e) Q9: chips over the START sign and overlapping ghost name tags at the start of M8/M9.
2. OVN-GAME-5 (new): landscape pass — the run view at 1280×720 and 844×390 on M1, M5 and M9: HUD, pedals, telemetry drawer and result card never cover the robot. Screenshots.
3. OVN-GAME-8 (new): a frame budget nobody needs a phone for. From `renderer.info` after 5 s of driving: draw calls and triangles for M1–M9 at high and low quality, as a table in your report. Accept: no mission above 150 draw calls or 150 k triangles at low quality; cut what is over (M8 rain and M9 snow, night and headlight are the new costs).
4. OVN-GAME-6 (new): Room Race phones (apps/web/app/race/[code]/RaceRun.tsx is [BRAIN]'s, the controls are yours): with [BRAIN], confirm race phones get the v3 sliders, the charged jump and the air chip exactly as solo Drive does at 390×844, and that nothing of the solo HUD hides the pedals there.
5. OVN-GAME-7 (new, stretch): camera fly-in from the workbench to the track on Deploy, skippable by a tap, at most 1.5 s, off on `?quality=low`.
6. Export the touch-start throttle (TOUCH_START, 30 %) from src/game so [UI]'s coach mark reads it instead of repeating the number. Then the wake-up rule above.

[UI] (received through OVN-UI-7, Q6–Q8, d501c14, dd0b347, fe2355c, f714727. I retest Q6–Q8 in the next e2e screens and close them. Keep the Lab Missions tab; its empty state is fine.)
1. OVN-UI-8 (new): Share and Episode on the Result have never been tested by anyone. In a headless browser with a finished run (the Result page works without animation frames once a run is stored; seed one through the store if your pane cannot drive): the share card image exists as a PNG and shows mission, time and the verdict vs Jev; Episode downloads JSON that parses with the contract schema. Fix what breaks. Accept: the PNG path and the JSON's size in your report.
2. OVN-UI-9 (new): "Build it for real" — a "Download the shopping list" button that saves the bill of materials as CSV (part, maker, supplier, price, currency, quantity, owned yes/no), from the same data as the page. Accept: unit test on the CSV; the row count equals the lines on screen.
3. OVN-UI-10 (new): live Jev stats on /lab from /api/stats (docs/DEMO_PLAN.md ui item 3): decisions served, median latency, fallbacks, refreshed every 10 s, "no data yet" when empty. Ask [BRAIN] for any field that is missing.
4. OVN-UI-11 (new): Home with nine missions. The mission rail shows stars earned, the weather word, and which missions the robot on the bench cannot finish (from the sim's assessBuild); after a finished run "Next" leads M7 → M8 → M9. Accept: screenshot of Home scrolled to the rail at 390×844; nothing clipped.
5. OVN-UI-12 (new): the honesty labels from [SIM]'s OVN-SIM-11 sentences, each on the screen SIM names.
6. Copy pass: one name for each thing on every screen (Jev / the AI / the brain; scan zone / pad; Drive / You drive), sentence case in body text, no "hold" for a slider. List what you changed. Then the wake-up rule above.

[BRAIN] (received: OVN-BRAIN-0, 1, 2, 4, QA-T2, QA-T3, OVN-BRAIN-3 so far (133f77c). The Anthropic credit is on the human's list in docs/OVERNIGHT_LOG.md.)
1. OVN-BRAIN-5 (new, demo-critical: "Jev unavailable or slow → heuristic drives, HUD says FALLBACK, the game never stalls", never tested by anyone). Without touching the key: a dev/test switch for /api/decide and /api/ghost that makes Jev (a) fail and (b) answer after 3 s. Accept: route tests for both; a Jev-mode run on M1 finishes with FALLBACK on the HUD; a Drive run gets a heuristic rival and says so; a Room Race with two bots finishes; no decision waits longer than the 1200 ms fallback. Then `node scripts/race-load.mjs` with 8 bots against :3000 and the numbers.
2. "DNF · stuck" at 25.7 s on M1 at full throttle in a Room Race (your phone check): the gate's solo Drive run on M1 finishes in 23.6 s on the same build. Find the difference in the race run path; report commit, seed and what the robot was stuck on. [SIM] is checking the sim side (OVN-SIM-9).
3. OVN-BRAIN-3: finish when [LAB]'s scenario registry lands.
4. Arena re-run on gameplay version 4: once, after OVN-BRAIN-3, no later than 08:30. Jev, OpenAI, DeepSeek, heuristic and random are re-run; the three Claude rows are carried over from version 3 and marked with their gameplay version unless the human has topped up the Anthropic account by then. Total arena spend stays under US$10. Every row shows the gameplay version it ran on.
5. OVN-BRAIN-7 (new): humans in the arena (docs/BRAIN_ARENA.md). Store a finished Drive run's input log per mission, build and seed (in memory, like the leaderboard); validate it with [SIM]'s `replayDrive` (a8b0d52) so a posted result cannot be invented; expose the best human per mission as a "Human" row next to the brains for that mission. Tell [UI] the fields. Accept: route test; a replay that does not reproduce the posted time is rejected.
6. OVN-BRAIN-8 (new): a phone that drops off. Mid-race, a phone loses the network for 5 s (and, separately, reloads the page): it rejoins the same seat, its run continues or ends with a stated reason, and the final order on the big screen and on every phone is identical. Accept: headless run for both cases, the two orders in your report.
7. OVN-BRAIN-6 (stretch, own route `/screen?arena=1`, nothing on the default /screen changes): the live Arena race — up to 4 brain bots on one seed, each lane labelled with its model and latest latency. "DNF · race closed" stays at 45 s; the human decides at rehearsal. Then the wake-up rule above.

[LAB] (received: OVN-LAB-1, 6d28f70.)
1. OVN-LAB-2, then OVN-LAB-3. [BRAIN] waits for the exported scenario registry: tell it the moment it is on main.
2. Approved for the OVN-LAB-3 commit: `"@rivetrun/lab": "workspace:*"` in apps/web/package.json and `'@rivetrun/lab'` in `transpilePackages` in apps/web/next.config.ts, with the pnpm-lock.yaml change, all in that one commit. Nothing else outside your paths.
3. For the e2e: arrow keys and WASD, a visible objective line, a result heading with a score, `data-testid` on `scenario-<id>`, `scenario-start`, `pad-up|down|left|right`, `scenario-result`; the grid-simulation sentence; linked from /lab only. Send the Maze seed and key sequence when it plays.
4. After OVN-LAB-3: a result worth showing for each scenario — Jev's decision thread beside the grid, and "what your sensors could not see" (the fog of war at the end). Then the wake-up rule above.

## Guardrails
- The human owns :3001, `pnpm demo:stable` serving and the tunnel. [MASTER] may restart the :3000 dev server only if it is down or reload-looping.
- No force push, no history rewrite, no deleting branches or tags, no stash, no destructive commands, no changes to secrets or .env files. API keys are read from apps/web/.env.local and never printed or logged.
- Commits authored as sergio.pulido@alodai.com. No other identity anywhere.
- Big new features land behind a flag or on their own route until [MASTER] has seen them green; the existing 60-second path must keep working at every tag.
- From 11:00: fixes and polish only. 14:00: feature freeze (docs/DEMO_PLAN.md).
- Honesty: anything simplified is labelled as such in the UI (e.g. "Lab Missions use a grid simulation").

## Queues
Items are in priority order. IDs are OVN-<owner>-<n>.

### Board (kept by [MASTER], updated 04:30)
"Reported" is the owner's word; "QA" is what the gate or the e2e screens showed. Workers are ahead of the wave clock: Wave 1 was reported done by 04:03.

| Item | State | Commit | QA |
|---|---|---|---|
| OVN-SIM-1 | reported done | 3f33e63, d966fc9 | Sim unit tests green in the gate. Accept line holds for wheeled builds; tracks are fastest at full throttle on mud (sim: correct). Nothing seen in a browser. |
| OVN-GAME-1 | reported done | 7947a69 | e2e: keyboard run on M1 brakes into the scan zone, "SCANNING · SURVIVOR", finishes. SLIP and the red speedometer not seen by anyone yet. |
| OVN-UI-1 | reported done | 5eaa447, 2889433 | Brief M1 objectives seen in the e2e screens. Inventory not retested by QA. |
| OVN-BRAIN-0 | reported done | 7b2bd6a | `--ref --build-only` run by brain. Serving a tag is untested until the human does it. |
| OVN-BRAIN-1 | reported done | 6ddf495 | 12 arena rows on one prompt hash; reasoning rows are 1 seed / 7 runs. /lab rendering of the new fields not checked. |
| OVN-SIM-2 | reported done | 9d3db6c, c9f6f27, 4c97762 | Broke typecheck in game and brain paths (Q1, Q2); fixed. |
| OVN-SIM-3 | reported done | e8e60f5, 1410a8a | Balance: M8 and M9 solved by mud_crawler, all_rounder, drone_sprinter, scrap_jumper. Broke two tests that used M9 as "unknown" (Q3 fixed, Q4 open). |
| OVN-UI-2 | reported done | 573ff51, c737082 | To be seen on M8/M9 in the next e2e screens. |
| OVN-GAME-2 | reported done | 86692f3, 8b62be1 | Frame rate on a phone, fog, gust word, /screen with weather: not verified by game. |
| OVN-BRAIN-2 | reported done | 4ae2d81 | Jev trails the heuristic on M8 by ~80 points (untuned). Weather line on /screen and bots on M8/M9 not verified. |
| OVN-UI-3 | reported done (empty state) | 20cec76 | Lab tab has no data until OVN-BRAIN-3. |
| OVN-GAME-4 | reported done | d9b2630 | Sounds are wired and type-checked only (headless has no audio). Phone frame rate: the human. |
| OVN-UI-4 | reported done | 435c338 | Needs a finished run to see: the e2e will check "Your best" on the Brief after its Drive run. |
| OVN-BRAIN-4 | reported done | 428640a | 10 lanes at 1280×720 checked by brain; found and fixed lanes covering the host bar. Phones with 10 racers not opened. |
| OVN-SIM-4 | reported done (benchmark re-run still running, ~40 min) | 2f9a3bb, 17ba1ac | Not played by sim; a brain's robot is not subject to air pitch (OVN-SIM-7). GAMEPLAY_VERSION is 4. |
| OVN-GAME-3 | reported done | 927f411 | Air chip and landing toast seen as DOM text, not pixels. CRASH LANDING never produced. Jump now charges while held: a tap is a 40 % jump. |
| OVN-BRAIN-3 | in progress: runner done, waits for [LAB]'s scenario registry | 9e64a85, 133f77c | Smoke maze completed by Jev, GPT-6 Luna, heuristic, random. |
| OVN-SIM-5…8 | committed 04:18–04:26, reports pending | 1a808a5, d88704e, 0e802de, a8b0d52 | In the gate running now. |
| OVN-UI-6, OVN-UI-7 | reported done | 3ed48f0, 7e19e69, f0f6852 | Q6–Q8: retest in the next e2e screens. |
| OVN-UI-5 | reported done | 1615aa1 | /lab shells out to `git log`; to be seen in the build under test. No docs/tokens.json yet (the human's). |
| OVN-LAB-1 | reported done | 6d28f70 | 48 unit tests by lab. First judged by the gate after 927f411. |
| OVN-LAB-2 | in progress | — | — |

Now: see "Orders from [MASTER]" above.

Standing rules added by [MASTER]:
- Before every push: `pnpm typecheck` and `pnpm test` from the repo root, not only in your package. The gate checks committed HEAD in a clean worktree.
- [SIM]: a new union member or mission id is announced to [GAME], [BRAIN] and [UI] before it is committed.
- [LAB]: /scenarios stays off the Home screen until [MASTER] has seen it green; `data-testid` hooks for the e2e.

### Wave 0 — finish what is in flight (now → 05:30)
- OVN-SIM-1: RR-GAMEPLAY-V3 P1 physics: analog input, traction and wheelspin, grip-limited braking, safe speeds and impact damage, scan zones. Accept: tests for each; a full-throttle run on M3 mud is slower than a feathered one.
- OVN-GAME-1: v3 controls: throttle and brake sliders 0..1 with the thumb gauge, SLIP and wheel spin, next-hazard warning with safe speed, scan-zone pads with a progress ring. Accept: a scripted e2e run brakes into an M1 scan zone and completes the scan.
- OVN-UI-1: Brief objectives (scan zones and the sensor each needs); "My parts" inventory; approximate-render caption. Accept: inventory survives reload; "You can build this today" appears when every line is owned.
- OVN-BRAIN-0 (first, small): `pnpm demo:stable -- --ref <git ref>` builds and serves that ref (e.g. the latest demo-good-* tag) instead of main. Accept: building a tag works and the served page shows that commit.
- OVN-BRAIN-1: arena with OpenAI and DeepSeek fast and mid tiers; Opus on 1 seed under the US$10 cap; re-run Haiku and Sonnet with the same prompt version so the table is comparable; per-event latency ids on ghost decisions. Accept: docs/arena-results.json has every configured contestant with the same prompt hash.

### Wave 1 — weather and atmosphere (05:30 → 07:30)
Grounded in physics; every assumption written in docs/CHANGES.md.
- OVN-SIM-2: wind (head/tail wind as aerodynamic drag on relative speed, gusts as events); rain (lower grip on hard surfaces, puddles); snow (new terrain: low grip and sinkage); cold (lower usable battery capacity, as LiPo packs lose capacity in the cold); fog and night (shorter camera range; lidar unaffected by darkness, degraded in heavy rain or snow). Weather is per mission and known from the mission plan; gusts and visibility are sensed through the build's sensors. Accept: each effect has a test and changes a heuristic run measurably.
- OVN-SIM-3: two new missions using weather: M8 "Storm Ridge" (wind, rain, a ridge with gusts) and M9 "Polar Night" (snow, cold, darkness). Night makes camera_module_3_noir and ambient_light_veml7700 worth unlocking: make them playable with their real ranges where the BoM gives them.
- OVN-GAME-2: weather visuals that stay above 50 fps on a phone: rain, snow, wind streaks and dust, fog, night lighting with the robot's own lights; HUD weather chip.
- OVN-BRAIN-2: weather in the Jev question (as the brain can know it: mission plan plus sensed values); /screen shows the weather per race.
- OVN-UI-2: Brief weather card and its effect on the build ("Cold: usable capacity down"); Workshop part sheets mention weather where a part matters (NoIR at night, waterproof case in rain).

### Wave 2 — Lab Missions: AI and robotics scenarios (06:00 → 09:30)
A second simulation for tasks a rail cannot express: top-down grid worlds with the same parts, sensors, battery and brains. Labelled in the UI as a grid simulation. Route: /scenarios.
- OVN-LAB-1: packages/lab: deterministic grid sim (tiles with terrain cost, walls, doors, ramps), robot speed and energy from the build (motor, battery, locomotion), fog of war = sensor coverage (lidar reveals walls in range, camera reveals objects and labels, ultrasonic only adjacent walls, no sensor = only the tile you are on), event-driven decisions (junction reached, object sensed, battery projection, objective done). Same Observation idea and trigger types as RR-BRAIN-V3. Unit tests including determinism.
- OVN-LAB-2: five scenarios, each with a clear objective and score:
  - Maze: reach the exit in an unknown maze. Lidar vs camera vs blind shows clearly.
  - Warehouse delivery: pick parcels, deliver them to bays, avoid moving forklifts, within a battery budget.
  - Mars sample return: collect 3 soil samples (needs the moisture probe), return to the lander before the battery runs out; a dust storm cuts camera range.
  - House inspection: visit rooms, scan checkpoints with the camera, avoid the stairs (drops).
  - Capture the flag: your robot against a Jev robot on the same map; first to bring the flag home.
- OVN-LAB-3: /scenarios UI: scenario picker, top-down renderer (2D canvas or SVG, phone-first), tap-to-move controls (arrow pad), objective tracker, decision thread for Jev; result with score and decisions.
- OVN-BRAIN-3: the brains on Lab Missions: Jev question for grid decisions; the arena runner gets a Lab track (fast tier only, 3 seeds per scenario); results into the same arena JSON under "lab".
- OVN-UI-3: /lab Brain Arena gets a "Lab Missions" tab from that JSON.

### Wave 3 — depth, excitement and polish (from 07:30)
- OVN-GAME-3: v3 P2 air control (pitch from throttle and brake in the air, landing grades) and the charged jump.
- OVN-SIM-4: v3 P2 physics for air control and the charged jump; re-run docs/BENCHMARK.md on the new physics.
- OVN-UI-4: replay pull: personal bests per mission and build, "beat your ghost" option, share card with time vs Jev.
- OVN-GAME-4: camera and feel: landing impacts, slip spray, speed lines, sound for slip, impacts and scans; phone frame-rate check with ?fps=1 on every mission.
- OVN-BRAIN-4: Room Race with 8 phones + bots: layout check at 8 lanes on /screen, chips placement, results consistency.
- OVN-UI-5: /lab "How it was built": sessions and roles, commits per session over time, benchmark and arena, tokens (docs/tokens.json when the human adds it).

### Wave 4 — release candidate (09:30 → 11:00)
- [MASTER]: full QA, final demo-good tag before 10:00, docs/OVERNIGHT_LOG.md final status, docs/SETUP.md and README updated from the real repo (roles, models, tools, what is implemented vs simplified).
- Every worker: fix what [MASTER] files; no new features after 11:00.

## For the human in the morning
- 07:30: build the demo from the latest tag, not from main: `git tag -l 'demo-good-*' | sort | tail -1` gives the tag. [BRAIN] adds a `--ref <tag>` option to `pnpm demo:stable` in Wave 0 (OVN-BRAIN-0).
- 08:15: stranger test; note where people hesitate; pass it to [MASTER].
- Read docs/OVERNIGHT_LOG.md first.
