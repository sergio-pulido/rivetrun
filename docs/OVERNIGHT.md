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

## Orders from [MASTER] (read on every pull · updated 05:25)
The app refuses [MASTER]'s messages to the worker sessions (cap: 10 per message the human types; paused since 04:11). This section is the only way I reach you. Your reports to me still arrive by message.

Rules while this lasts:
- Do not wait for a message from [MASTER] and do not ask me for the next item: I cannot answer. Your block below is your queue. Take the first item you have not reported, in order.
- When your block is empty: do not end your turn idle. Schedule a wake-up in 10 minutes (ScheduleWakeup, 600 s), then `git pull` and re-read your block. I refill every block each cycle (about every 20 minutes).
- An OPEN finding with your name in docs/QA.md ("Overnight findings") comes before any item here.
- Before every push: `pnpm typecheck` and `pnpm test` from the repo root. The gate judges committed HEAD in a clean worktree and runs the e2e on a production build of that commit, so only committed code counts.
- Robustness of the demo comes before new features. New features sit behind a flag or on their own route.

State: latest tag `demo-good-0522` (c377462), 18 e2e steps, all green, no warnings.

[SIM] (received through OVN-SIM-20, Q15, Q16 (b916210) and docs/SIM_MODEL.md (5019c16).)
0. Decision on OVN-SIM-20: do not change the unlock costs; earning the light sensor with one finished run is a reason to play M1 first. The fix is on the Brief, which is [UI]'s: when the part that "Fit one" points to is locked, the line says what it costs and that one finished run pays for it, and the link goes to that part's sheet. It is your finding and their page: give [UI] the two costs and the sentence.
1. OVN-SIM-21 (new, the arena's honesty claim): a leak test. "The brain knows only what its sensors report" is the sentence the Brain Arena rests on. Build pairs of tracks that are identical up to the build's sensor range and different beyond it (another terrain, a rock, a gap, a scan zone the build cannot sense), and assert that the Observation, the options, every predicted outcome and the question text [BRAIN] builds from them are identical for both tracks at the same position, for each sensor set (blind, ultrasonic, camera, lidar, drone). Accept: the test fails if anyone reads the track ahead; it lives where it can import the brain's question builder; if it finds a leak, that is a finding for docs/QA.md before it is a fix.
2. OVN-SIM-22 (new): every sentence a stranger reads when a run ends. From the 10 000 soak runs plus the naive and careful drivers, collect every distinct why-line and "try next" line with one example run each. For each: is it true for that run, and does it tell the player what to do? Fix the ones that blame the wrong thing or say nothing. Accept: the list in docs/CHANGES.md with what changed; a test that no finished or failed run has an empty why-line.
3. OVN-SIM-23 (new): docs/GAME_SPEC.md is yesterday's design. Add a section at the top, "What the game is now", listing each place the game differs from the spec (analog controls, wheelspin, scan zones, triggers instead of a clock, weather, M8 and M9, air levelling, stuck countdown, first-touch rule), one line and one commit each. Do not rewrite the spec.
4. Whatever [BRAIN] needs for the humans-in-the-arena replay (OVN-BRAIN-7): episodes carry the gameplay version, and `replayDrive` refuses a log from another version with a clear reason. Then the wake-up rule.

[GAME] (received everything through 7e7f875: the race phone, the sound test (three near-silent sounds found and raised), chips off the START sign, the legend. Declining the cheaper first frame is right. The decision chirp stays at half volume as the human asked.)
1. OVN-GAME-12 (new): the run view when things go wrong, at 390×844, one screenshot each with the clock frozen: WebGL context lost mid-run (the message and what the player can do), the "3D view unavailable" fallback with the controls still usable, a run on a device in the weak tier (blob shadow, no fly-in), and `prefers-reduced-motion` (no fly-in, no shake). Fix what is unreadable or dead-ends; a visitor must always have a way on (Retry or Home).
2. OVN-GAME-13 (new): Lab Missions draw their own robot and tiles ([LAB]'s canvas). Offer [LAB] the palette and the robot glyph so /scenarios reads as the same game at a glance (colours of terrain, the robot's orange, the cyan of sensing); it is their page, so hand over constants or a small component, do not edit it.
3. With [BRAIN]: the attract loop is only in a room lobby; the idle /screen with scores on the board shows the leaderboard. docs/DEMO_PLAN.md says "Big screen idle → attract mode loop". Agree where it goes (a strip beside the board, or the board fading to the loop after 30 s without input) and build your half.
4. Then the wake-up rule.

[UI] (received through OVN-UI-7, Q6–Q8, 90d1f73, 23e8b14, fa32b42 and the locked-parts line on the Brief (36ac2b1). Your block is NOT empty: 0, 0c and 1–6 below are open.)
0c. With [BRAIN]'s `…&status=1` (47a1147): the Brief says "Jev is getting ready" until the Jev ghost is ready, then "Jev is ready"; if the visitor starts before that, the Brief has already said the rival will be the fixed rules. And Q20: the sentence [BRAIN] puts in `notes[]` about what the brains are told goes above both arena tables on /lab, not in a footnote.
0b. M9's "Fit one" for a first-timer ([SIM]'s OVN-SIM-20): a visitor with 0 points cannot fit the light sensor (50 points) or the NoIR camera (200). When the part the link points to is locked, say what it costs and that one finished run pays for it, and link to the part's sheet. [SIM] has the numbers.
0. Lab Missions are green (demo-good-0500): add /scenarios to the header menu now, not to Home. And read the 30 % in the first coach mark from [GAME]'s export (`import { TOUCH_START } from '@/game'`, a6d4888) instead of the literal.
1. OVN-UI-8 (new): Share and Episode on the Result have never been tested by anyone. In a headless browser with a finished run (the Result page works without animation frames once a run is stored; seed one through the store if your pane cannot drive): the share card image exists as a PNG and shows mission, time and the verdict vs Jev; Episode downloads JSON that parses with the contract schema. Fix what breaks. Accept: the PNG path and the JSON's size in your report.
2. OVN-UI-9 (new): "Build it for real" — a "Download the shopping list" button that saves the bill of materials as CSV (part, maker, supplier, price, currency, quantity, owned yes/no), from the same data as the page. Accept: unit test on the CSV; the row count equals the lines on screen.
3. OVN-UI-10 (new): live Jev stats on /lab from /api/stats (docs/DEMO_PLAN.md ui item 3): decisions served, median latency, fallbacks, refreshed every 10 s, "no data yet" when empty. Ask [BRAIN] for any field that is missing.
4. OVN-UI-11 (new): Home with nine missions. The mission rail shows stars earned, the weather word, and which missions the robot on the bench cannot finish (from the sim's assessBuild); after a finished run "Next" leads M7 → M8 → M9. Accept: screenshot of Home scrolled to the rail at 390×844; nothing clipped.
5. OVN-UI-12 (new): the honesty labels from [SIM]'s OVN-SIM-11 sentences, each on the screen SIM names.
6. Copy pass: one name for each thing on every screen (Jev / the AI / the brain; scan zone / pad; Drive / You drive), sentence case in body text, no "hold" for a slider. List what you changed. Then the wake-up rule above.

[BRAIN] (received: OVN-BRAIN-0, 1, 2, 4, QA-T2, QA-T3, OVN-BRAIN-3 so far (133f77c). The Anthropic credit is on the human's list in docs/OVERNIGHT_LOG.md.)
0d. Q13 in docs/QA.md (new, the first thing a visitor sees): on M1 Jev never scans. Jev mode from Play Now: "Scans: 0 of 1 scanned · 1 missed: +10 s", and "HEURISTIC beat JEV by 46 points"; the same in Drive mode (Jev ghost 33.8 s against a human's 23.8 s) and on /screen ("PLAN · scan zone survivor in 3 m → full throttle (96 %)"). The question tells Jev the zone is ahead; find out whether the options' predicted outcomes price the 10 s penalty and the stop, fix the question (with [SIM] if the prediction is theirs), and show the before and after on M1, M3 and M7 over 3 seeds. Do this before the arena re-run so the table reflects it.
000. Received Q17 (47a1147). One change, because the Jev quota for the demo window is not known and 70 phones with their own builds would each trigger about 230 calls: warm only two ghosts per loadout, the next mission after the one asked for and M5 (the Room Challenge), and only at the default priority with no briefing. Everything else is computed when a Brief asks for it; [UI]'s "Jev is getting ready" state covers the wait. Then Q20 below, then /api/lab/decide, the leak test, OVN-BRAIN-8, OVN-BRAIN-7.
00. Q20 in docs/QA.md — FIRST, before OVN-BRAIN-7. The Lab question (lab-q3) tells every brain which option is "the correct job to start" and which is "not correct now"; the rail question says `scan` "is the correct option" and that slowing down is correct before a zone. Those verdicts come from the same rules the heuristic uses, so the tables currently show which model follows a stated verdict in time. That may be a fair thing to measure, but the page must say it, and the table must also show what the models do on facts alone.
   (a) Now, 10 minutes: a note in `notes[]` of both blocks of docs/arena-results.json and in docs/ARENA.md / docs/ARENA_LAB.md, in plain words: "Each question tells the brain which option the fixed rules rate as correct. These tables measure whether a model follows that under its real latency." Tell [UI] it must be visible above both tables, not in a footnote.
   (b) A second prompt variant, "facts only": the same observation, options and predicted outcomes (route length, charge after, the 10 s penalty for a missed scan, stopping distance at this speed) and no verdict words ("correct", "not correct", "must", "should") anywhere in the question. Run it for the Lab track (all fast rows, about US$0.11) and for the rail track on Jev and the fast tier only (about US$0.6), and publish both columns side by side: "with the rules' verdict" and "facts only". Keep the total under US$10.
   (c) The game keeps whichever variant plays better (the verdict one, as now); say on the Brain panel's info line what Jev is told. Do not remove the Q13 fix from the game.
   Accept: a unit test that the facts-only question contains none of those words; both columns in the JSON; the note on /lab.
0j. [LAB] will ask you for a live Jev endpoint for Lab Missions (their OVN-LAB-7): the Lab question through your generic choice call, same cache and fault switch as /api/decide.
0i. Received the arena on gameplay 4 and the Lab re-run (757f0c8), and OVN-BRAIN-5 (bb08914): the fallback holds. The gate now sets RIVETRUN_JEV_FAULT_SWITCH=1 on its own QA server and runs a Jev-mode M1 with your `rr_jev_fault=fail` cookie every cycle. Keep the 22 s ghost-slow route test as it is. Next for you, in this order: Q17 (0h); re-run the Lab arena on LAB_VERSION 2 ([LAB]'s 9584eb8) and tell [LAB] and [UI] so Warehouse can drop "under tuning"; the arena remainder (item 4); OVN-BRAIN-8 (a phone that drops off) before OVN-BRAIN-7 (humans in the arena), because the demo depends on the first.
0g. Received Q13 (43a7201: retested by the gate, Jev finishes M1 in 26.9 s where it took 33.4 s), Q14 (f4ad682) and bf0a3ce. Keep bf0a3ce: the race ranks by the sim's time including the 10 s per missed scan, and every screen says so.
0h. Q17 in docs/QA.md (new): in the gate's Drive run on M5 the rival was "HEURISTIC 2.2 m AHEAD", not Jev: the visitor tapped Drive before the Jev ghost was ready. On M1 it is ready because Home prefetches it. Measure, on the production build, how long the Jev ghost takes from opening /brief/Mx to ready, for M1–M9. If it is more than 3 s anywhere, give [UI] a state to show on the Brief ("Jev is getting ready" → "Jev is ready") and prefetch M5 from /race too. A visitor racing fixed rules while the screen says "You vs Jev" elsewhere is confusing.
0f. docs/arena-results.json: (a) a `gameplayVersion` per row ([UI]'s page already reads it and will say "run on gameplay 3" for the Claude rows); (b) the Haiku "not run" reason is the provider's raw error body about the account: replace it with words meant for a public page ("not run: no API credit at run time"). Q13: 43a7201 seen on main — send the before/after numbers.
0e. Mount [GAME]'s `RunAlerts` on the race phone (a69a7c9, OVN-GAME-6): race phones have the controls but no scan prompt, hazard warning, air chip, landing grade or "blocked". Tell [GAME] when it is in.
1. OVN-BRAIN-5 (new, demo-critical: "Jev unavailable or slow → heuristic drives, HUD says FALLBACK, the game never stalls", never tested by anyone). Without touching the key: a dev/test switch for /api/decide and /api/ghost that makes Jev (a) fail and (b) answer after 3 s. Accept: route tests for both; a Jev-mode run on M1 finishes with FALLBACK on the HUD; a Drive run gets a heuristic rival and says so; a Room Race with two bots finishes; no decision waits longer than the 1200 ms fallback. Then `node scripts/race-load.mjs` with 8 bots against :3000 and the numbers.
2. "DNF · stuck" at 25.7 s on M1 at full throttle in a Room Race (your phone check): the gate's solo Drive run on M1 finishes in 23.6 s on the same build. Find the difference in the race run path; report commit, seed and what the robot was stuck on. [SIM] is checking the sim side (OVN-SIM-9).
3. OVN-BRAIN-3: finish when [LAB]'s scenario registry lands.
4. Arena re-run on gameplay version 4: once, after OVN-BRAIN-3, no later than 08:30. Jev, OpenAI, DeepSeek, heuristic and random are re-run; the three Claude rows are carried over from version 3 and marked with their gameplay version unless the human has topped up the Anthropic account by then. Total arena spend stays under US$10. Every row shows the gameplay version it ran on.
5. OVN-BRAIN-7 (new): humans in the arena (docs/BRAIN_ARENA.md). Store a finished Drive run's input log per mission, build and seed (in memory, like the leaderboard); validate it with [SIM]'s `replayDrive` (a8b0d52) so a posted result cannot be invented; expose the best human per mission as a "Human" row next to the brains for that mission. Tell [UI] the fields. Accept: route test; a replay that does not reproduce the posted time is rejected.
6. OVN-BRAIN-8 (new): a phone that drops off. Mid-race, a phone loses the network for 5 s (and, separately, reloads the page): it rejoins the same seat, its run continues or ends with a stated reason, and the final order on the big screen and on every phone is identical. Accept: headless run for both cases, the two orders in your report.
7. OVN-BRAIN-6 (stretch, own route `/screen?arena=1`, nothing on the default /screen changes): the live Arena race — up to 4 brain bots on one seed, each lane labelled with its model and latest latency. "DNF · race closed" stays at 45 s; the human decides at rehearsal. Then the wake-up rule above.

[LAB] (received: OVN-LAB-1…6 — the legend and the two-tap "End the mission" guard, fca3e98; good catch on the lander.)
1. received.
2. OVN-LAB-7 (new): the brain in "The brain drives" and Jev in Capture the flag are the lab heuristic at 400 ms, and the page says so. Make it the real Jev, live, the way the rail game does it: [BRAIN] owns the route and already has the Lab question builder and a generic Jev choice call (9e64a85, 133f77c); you own the page. Fallback to the lab heuristic after 1200 ms with FALLBACK shown, latency in the thread, and the honesty line changed to what is true ("Jev answers live; when it is slow the fixed rules decide"). Ask [BRAIN] for the endpoint. Accept: a CTF run where the thread shows Jev's real latencies; with [BRAIN]'s fault cookie the run still finishes and says FALLBACK.
3. The result view at 1280×720 (laid out, never looked at), and Warehouse played by hand to the result at 390×844 after OVN-LAB-4's change (eight forklifts).
4. Bests for Lab Missions survive a reload and a "Retry" keeps the chosen robot and mode. Then the wake-up rule.

## Guardrails
- The human owns :3001, `pnpm demo:stable` serving and the tunnel. [MASTER] may restart the :3000 dev server only if it is down or reload-looping.
- No force push, no history rewrite, no deleting branches or tags, no stash, no destructive commands, no changes to secrets or .env files. API keys are read from apps/web/.env.local and never printed or logged.
- Commits authored as sergio.pulido@alodai.com. No other identity anywhere.
- Big new features land behind a flag or on their own route until [MASTER] has seen them green; the existing 60-second path must keep working at every tag.
- From 11:00: fixes and polish only. 14:00: feature freeze (docs/DEMO_PLAN.md).
- Honesty: anything simplified is labelled as such in the UI (e.g. "Lab Missions use a grid simulation").

## Queues
Items are in priority order. IDs are OVN-<owner>-<n>.

### Board (kept by [MASTER], updated 05:25)
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
| OVN-BRAIN-3 | reported done | f98a59e | Lab arena: heuristic 696, Jev 642, random 484, GPT-6 Luna 463, DeepSeek Flash 408, GPT-5 nano 395. Random beats Jev on Warehouse (OVN-SIM-18). Rail arena re-run on gameplay 4 except the Claude rows (no credit) and the two reasoning rows. Spend so far about US$3.79. |
| OVN-SIM-13…16 | on main, reports pending | 125bda4, 0729fec, 0fc438e, c58b23c | — |
| OVN-GAME-8 | reported done | 765e19f | Low quality: 130–141 draw calls and 16–22 k triangles on every mission (was 163–173); the shadow pass is skipped on weak devices. High quality stays at 163–173. A proxy, not a frame rate. |
| OVN-GAME-9 | done, retested | 537c721 | M5 at full throttle: ignoring the prompt ends at 32.6 m; tapping CLIMB when told finishes in 61 s (game). In the e2e from the 04:47 gate. |
| OVN-SIM-5…8 | committed 04:18–04:26, reports pending | 1a808a5, d88704e, 0e802de, a8b0d52 | In the gate running now. |
| OVN-UI-6, OVN-UI-7 | done, retested | 3ed48f0, 7e19e69, f0f6852 | Q6–Q8 closed from the 04:27 screens. |
| OVN-UI-5 | reported done | 1615aa1 | /lab shells out to `git log`; to be seen in the build under test. No docs/tokens.json yet (the human's). |
| OVN-LAB-1 | reported done | 6d28f70 | 48 unit tests by lab. First judged by the gate after 927f411. |
| OVN-LAB-2 | reported done | d2dbd53 | 69 unit tests by lab; five scenarios; no screen yet. |
| OVN-LAB-3 | done, retested | 2561876 | e2e at 5bf1572: Maze by 59 key presses to "Scenario complete", score 732; the picker states the grid simulation. |
| OVN-LAB-4 | reported done | 9584eb8 | Heuristic beats random by more than 150 on every scenario (lab's test); Lab arena to be re-run by brain. |
| OVN-BRAIN-5 | reported done | bb08914 | Jev fail and Jev slow: every run finished, FALLBACK shown, longest wait 1268 ms; 8-bot load: 0 dropped, end to end p95 109 ms on the dev server. In the gate from 05:03. |
| OVN-SIM-17, 18 | reported done | 5bf1572 | Jev within 40 points of the heuristic on M1–M9 (3 seeds, default build); ahead by 82 on M6 with the Deep Diver. Warehouse: the decisions, not the scoring. |
| OVN-SIM-9…12 | reported done | 2915915, a39bea1, f8b94fc | Naive full-throttle driver: finishes M1, M2, M4, M9; stuck on M3, M5, M8; floods on M6; falls on M7. Fuzz in `pnpm test`. |
| OVN-GAME-5 | reported done | 4cf21fa | Landscape at 844×390 and 1280×720 seen by game. |
| OVN-GAME-6 | half done | a69a7c9 | Controls are on race phones; alerts (scan, hazard, air, landing) are not until [BRAIN] mounts RunAlerts. |
| OVN-GAME-7 | reported done | e661a55 | Fly-in is default-on; motion never seen (software rendering draws two frames of it). |
| QA-G1 | reported done | ee76275 | Red speedometer, /screen with weather on M8/M9 at 2 lanes, fog, R13 seen by game; 10 lanes and the attract loop with weather not checked. |

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
