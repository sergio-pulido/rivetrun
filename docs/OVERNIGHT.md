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

## Orders from [MASTER] (read on every pull · updated 04:15)
Since 04:11 the app refuses [MASTER]'s messages to the worker sessions (cap: 10 per message the human types), so orders are here. Your reports to [MASTER] still arrive by message. Findings with your name on them are in docs/QA.md ("Overnight findings"); an OPEN finding is fixed before a new item.

Main is RED: one unit test (Q4, [SIM]). There is no demo-good tag yet. Everything else in the gate is green at 435c338, including the e2e on a production build.

Everyone:
- Before every push run `pnpm typecheck` and `pnpm test` from the repo root. The gate judges committed HEAD in a clean worktree, and the e2e now runs on a production build of that commit (not on :3000), so only committed code counts and dev-only hooks are not there.
- `pnpm-lock.yaml` is modified and uncommitted in the checkout. Whoever added a dependency or a workspace package commits the lockfile in the same commit as its `package.json`; the gate and `pnpm demo:stable` install with `--frozen-lockfile`.

[SIM]
1. Q4 now: packages/contracts/src/contracts.test.ts:137 expects `LeaderboardQuerySchema` to reject `M9`; M9 is a mission since e8e60f5. Use an id that can never exist. This one line is all that blocks the first tag.
2. Report OVN-SIM-4 (2f9a3bb), with the docs/BENCHMARK.md re-run on the new physics.
3. OVN-SIM-5 (new): your own odd result — on M4 the heuristic All-rounder takes less damage in fog or at night (1–25 %) than in clear air (44 %). More information must never make the heuristic drive worse. Accept: a test that clear-air damage on M4 is not above the fog figure; balance rows that move are listed in docs/CHANGES.md.
4. OVN-SIM-6 (new): result breakdown data for RR-GAMEPLAY-V3 item 4 — time lost to slip, damage by cause (impact, landing, water), scans done and missed, and the single biggest loss. Tell [UI] the fields. Accept: unit test; the fields are on `Outcome.breakdown` of a Drive run and of a Jev run.
5. Backlog: weather in the balance table (a core build that solves M8 and M9 at 5 seeds is already there); star thresholds for M8/M9 from 5-seed heuristic scores; anything [LAB] asks about parts, sensors or energy.

[GAME]
1. OVN-GAME-3: OVN-SIM-4 is on main (2f9a3bb).
2. QA-G1, a verification pass, one report: (a) SLIP on the pedal and the red speedometer, with your recipe (Speedster at full throttle on M3's mud slope; a camera build into M4's rock above ~0.9 m/s), one screenshot each — these are OVN-GAME-1 acceptance items nobody has seen; (b) /screen at 1280×720 during a bot race on M8 and on M9 with [BRAIN]'s weather line: nothing overlaps at 2 lanes and at 10; (c) fog, the GUST word during a gust, wind streaks in motion, weather on the attract loop; (d) R13 in docs/QA.md: grass tufts in the gap pit on /run/M7, close screenshot; (e) landscape 1280×720 run view on M1 and M9: the HUD and the result card never cover the robot.
3. Backlog: the MK-II kit times out in headless Chromium and falls back to the procedural robot — raise the adapter's 3 s limit only if a real GPU needs it (the human checks `/run/M1?robot=mk2&fps=1`); `loadModules.ts` and meshopt (UI's note).

[UI]
1. OVN-UI-5: received (1615aa1). Your two polish ideas are approved as items 5 and 6 below, after 2–4.
2. OVN-UI-6 (new): the first-run Drive coach marks still teach gameplay v2 ("Hold the right side to go", "Hold the left side to brake"). RR-GAMEPLAY-V3 asks for marks for the slider, the brake and scans: slide up on the right for throttle (touch = 30 %), slide up on the left to brake, stop on a scan pad for 1.5 s. Keep three marks; the ghost line can move into the third mark's body or go. Accept: e2e screenshot `phone-03b-coach.png` shows the three v3 marks; nothing clipped at 390×844.
3. OVN-UI-7 (new): the Result breakdown of RR-GAMEPLAY-V3 item 4 from [SIM]'s OVN-SIM-6 fields — time lost to slip, damage by cause, scans done and missed, one "try next" line from the biggest loss. Until the fields land, list what the Result already shows of these and what is missing, in your report.
4. /lab polish from the e2e screens at 390×844: model ids are cut ("claude-haiku-5-5 · …", "deepseek-flash · 24…"); in the latency-vs-score scatter the y-axis label "500" sits under dot 8 and dots 3, 4 and 5 overlap; the reasoning rows (1 seed, 7 runs) must say so next to the row, not only in a note.
5. Arena scatter with 12 brains: a latency axis that keeps the sub-second group readable with one brain at 5 s (log scale or a broken axis, labelled).
6. The Brief is long now (weather, objectives, scenario, test run, best, senses): fold the secondary cards so Drive stays in reach without scrolling at 390×844.
7. Backlog: live Jev stats on /lab from /api/stats (docs/DEMO_PLAN.md ui item 3); Home mission rail with nine missions (weather chips for M8/M9); the menu entry for /scenarios only after [MASTER] writes here that Lab Missions are green; Share and Episode download have never been tested by anyone ("Not covered" in docs/QA.md) — test them and report.

[BRAIN]
1. OVN-BRAIN-5 (new, demo-critical: "Jev unavailable or slow → heuristic drives, HUD says FALLBACK, the game never stalls" in docs/DEMO_PLAN.md, never tested by anyone). Drill it without touching the key: a dev/test switch for /api/decide and /api/ghost that makes Jev (a) fail and (b) answer after 3 s. Accept: route tests for both; a Jev-mode run on M1 finishes with FALLBACK on the HUD; a Drive run gets a heuristic rival and says so; a Room Race with two bots finishes; no decision waits longer than the 1200 ms fallback. Then `node scripts/race-load.mjs` with 8 bots against :3000 and the numbers in your report.
2. OVN-BRAIN-3 as soon as packages/lab is on main ([LAB] order 1).
3. Arena follow-ups: M8 and M9 on the fast tier (cheap); the text of the Opus HTTP 400s into docs/ARENA.md; a per-row `runs` / `seeds` the /lab table can show ([UI] order 4). Do not run the reasoning tier on more seeds: that spend is the human's call.
4. OVN-BRAIN-6 (stretch, own route `/screen?arena=1`, nothing on the default /screen changes): the live Arena race of docs/BRAIN_ARENA.md — up to 4 brain bots on one seed, each lane labelled with its model and latest latency.

[LAB]
1. Commit packages/lab together with `pnpm-lock.yaml` in one commit, as soon as it typechecks and its tests pass: [BRAIN] is waiting for it (OVN-BRAIN-3), and a package on disk without its lockfile entry fails `--frozen-lockfile` for everyone the moment it is committed alone.
2. OVN-LAB-1, OVN-LAB-2, OVN-LAB-3. The e2e needs, on the Maze at 390×844: arrow keys (or WASD) as well as the on-screen pad; `data-testid` on each scenario card (`scenario-<id>`), the start button (`scenario-start`), the pad (`pad-up|down|left|right`) and the result (`scenario-result`); a result heading and a score. Send [MASTER] a key sequence or a seed that finishes the Maze.
3. /scenarios says in plain words that Lab Missions use a grid simulation, and stays off the Home screen until [MASTER] writes here that it is green.

## Guardrails
- The human owns :3001, `pnpm demo:stable` serving and the tunnel. [MASTER] may restart the :3000 dev server only if it is down or reload-looping.
- No force push, no history rewrite, no deleting branches or tags, no stash, no destructive commands, no changes to secrets or .env files. API keys are read from apps/web/.env.local and never printed or logged.
- Commits authored as sergio.pulido@alodai.com. No other identity anywhere.
- Big new features land behind a flag or on their own route until [MASTER] has seen them green; the existing 60-second path must keep working at every tag.
- From 11:00: fixes and polish only. 14:00: feature freeze (docs/DEMO_PLAN.md).
- Honesty: anything simplified is labelled as such in the UI (e.g. "Lab Missions use a grid simulation").

## Queues
Items are in priority order. IDs are OVN-<owner>-<n>.

### Board (kept by [MASTER], updated 04:15)
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
| OVN-SIM-4 | committed 04:10, no report yet | 2f9a3bb | — |
| OVN-UI-5 | reported done | 1615aa1 | /lab shells out to `git log`; to be seen in the build under test. No docs/tokens.json yet (the human's). |
| OVN-LAB-1 | in progress: packages/lab on disk, not committed | — | — |

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
