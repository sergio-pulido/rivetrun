# RivetRun — QA log

Owner of this file: [MASTER] since Sat 03:45 (docs/OVERNIGHT.md). Everything from "Open regressions" down is the sim session's earlier log, tested in the Claude browser pane on `http://localhost:3000` at 390×844 with keyboard input. Nothing in this file was run on a real phone.

Status: **OPEN** = reproduces now · **FIXED** = fix retested · **REPORTED FIXED** = owner says fixed, not retested · **NOT A BUG** = explained.

## Overnight gate (RR-OVERNIGHT)

`scripts/qa.sh` gates a commit. `scripts/qa.sh --tag` tags it `demo-good-<HHMM>` and pushes the tag when every step passes. Logs: `e2e/out/<HHMM>/`. Screens: `e2e/screens/<HHMM>/` (not committed).

| Step | Runs on | Proves |
|---|---|---|
| install, typecheck, unit tests | a clean worktree of the commit (`../rivetrun-qa`) | The commit installs from the lockfile, every package typechecks and every unit test passes with nothing uncommitted helping. |
| determinism | same | Two runs of `scripts/balance.ts --seeds 2` give byte-identical tables. |
| balance | same | Every mission is finished by at least one core build within budget, and the default build finishes M1. |
| build | same | `next build` of the commit succeeds. Type errors do not fail it (`ignoreBuildErrors`), which is why typecheck is its own step. |
| e2e smoke | that production build, served by `next start` on 127.0.0.1:3100 for the length of the smoke, then stopped | Headless Chromium (Playwright, software WebGL). Phone 390×844: Home → Workshop → Brief M1 → first-run coach marks → a Drive run on M1 by keyboard (full throttle, brake a metre before the scan zone, hold for the scan, drive to the finish) → Result → the personal-best card on the Brief; Jev drives M1 from Play Now to the Result; M5 at full throttle doing only what the stuck prompt says; `/lab` and its Lab Missions tab; the Maze in `/scenarios` from the picker to "Scenario complete"; every mission's Brief; every mission's run scene for 7 s with Jev driving; Jev made to fail (brain's fault cookie, honoured by the QA server only): FALLBACK on the HUD and a finished run. 1280×720: `/screen` → Room Race on M1 with two JEV bots to FINISH; stills of Home, Workshop, Brief and `/lab`. One retry after 20 s if a step fails. |
| demo build (hourly) | `../rivetrun-demo` | `pnpm demo:stable -- --build-only`. Skipped while anything serves on :3001. |

Why the e2e does not use the dev server on :3000 (it did until 04:10): five sessions save files every few seconds, Fast Refresh re-runs the run page's effects on each save and the run restarts from 00:00.0 (measured: sim clock reset three times in 30 s, plus one "ControlSpecialSchema is not defined" from a half-saved contract). A smoke there fails on timing and says nothing about a commit. `QA_SERVER=dev scripts/qa.sh` still runs it that way.

What a `demo-good-*` tag does not prove:
- Software rendering at a few frames per second: no frame-rate, touch, sound or real-phone result. Input is keyboard.
- The MK-II kit does not load in headless Chromium (asset timeout): every screenshot shows the procedural robot.
- The Room Race had bots only: no phone joined, and only M1 is raced.
- Dev-only paths (`window.__rivetrun`, `?weather=`) are not in the build under test.
- Of the five Lab Missions only the Maze is played.

## Overnight findings

| # | Owner | Status | What | Evidence |
|---|---|---|---|---|
| Q1 | game | FIXED (51ff71a) | Committed main failed `tsc` after the weather commits: the new RunEvent `gust` had no case in `runFeed.ts` (the HUD view would become `undefined` on a gust), and `snow` was missing from the terrain look and texture tables. | Gate at c9f6f27 and 7b2bd6a red on typecheck; green at the first tag. |
| Q2 | brain | FIXED (4e29cd8) | `snow` missing from the `/screen` lane-strip colours. | Same gate runs. |
| Q3 | brain | FIXED (4ae2d81) | `apps/web/app/api/routes.test.ts` used `M9` as the unknown mission; M9 exists since e8e60f5. | Gate at 6ddf495 red on unit tests; that test passes at 4ae2d81. |
| Q4 | sim | FIXED (05d6214) | `packages/contracts/src/contracts.test.ts:137` expected `LeaderboardQuerySchema` to reject `M9`. It was the only red from 4ae2d81 to 17ba1ac and held back the first tag for 15 minutes. | Gates at 4ae2d81 and 435c338: unit-tests red, everything else green. |
| Q5 | master (tooling) | FIXED | The e2e Drive run stalled when the dev server reloaded the run page mid-run (sessions saving files it imports): the new page had no key held. The script now lets go, restarts from the start line and reports the reload as a warning. | First gate e2e at 03:59. |
| Q6 | ui | FIXED (3ed48f0) | Brief M9: the chip under the title says "COLD · BATTERY ×0.8" and the Weather card on the same screen says "Usable battery capacity ×0.6" (−20 °C). One number, two values. Chips carry the weather word only; the card carries the numbers (same for "RAIN · GRIP ×0.8" on M5). | `e2e/screens/0410/brief-M9.png` Retested in `e2e/screens/0427/brief-M9.png`: the chip says "COLD". |
| Q7 | ui | FIXED (3ed48f0) | First-run Drive coach marks teach gameplay v2 ("Hold the right side to go", "Hold the left side to brake"); v3 controls are sliders and there is no mark for scan zones (OVN-UI-6). | `e2e/screens/0410/phone-03b-coach.png` Retested in `e2e/screens/0427/phone-03b-coach.png`: slide up for throttle, slide up to brake, stop on a scan pad. |
| Q8 | ui | FIXED (7e19e69, f0f6852) | Result has no v3 breakdown: no scans done or missed, no time lost to slip, no damage by cause, no "try next" line (OVN-UI-7, needs OVN-SIM-6 fields). | `e2e/screens/0410/phone-07-result-bottom.png` Retested in `e2e/screens/0427/phone-07-result-bottom.png`: "Where the run went" with scans, wheelspin, damage by cause, biggest loss and a "try next" line. |
| Q9 | game | REPORTED FIXED in part (ee76275) | Run start on M8/M9 at 390×844: the weather chip, senses chip and first decision chip stack over the START sign and the ghost name tags (RANDOM / HEURISTIC / JEV overlap each other). Clears once the robot moves. | `e2e/screens/0410/run-M9.png`, `run-M8.png` Game raised the far ghost name tag (not re-shot); the chips still cover the START sign for the first second, left as is by game. |
| Q10 | sim | FIXED (0e802de) | Air control (2f9a3bb): a human's robot can land HARD or CRASH after a ramp; a brain's robot is not subject to air pitch. RR-GAMEPLAY-V3's first principle is one physics for the human, the heuristic and Jev. On M2, M5 (the Room Challenge) and M7 a stranger who holds the throttle takes landing damage the Jev ghost cannot take, and nothing says so (OVN-SIM-7). | [SIM]'s OVN-SIM-4 report. Not reproduced by QA yet. Sim: one air rule for brains and players; no air input lands like a brain. Brief states the rule (f714727), air chip too (ee76275). Closed on sim's tests (a player who holds or releases the throttle in the air lands exactly as a brain does on M2, M5, M7); not replayed by QA. Side effect, sim's words: on flat ground air input can now only make a landing worse. |
| Q11 | game | FIXED (927f411) | A held jump was cut after 40 ms and fired as a tap: the action button ended a hold on pointer-leave, and React fires a leave when the label under the finger changes. Found by game while building the charged jump; the winch hold used the same path. | [GAME]'s OVN-GAME-3 report. |
| Q12 | sim + game | FIXED (125bda4, 537c721) | A stranger who only holds the throttle (sim's OVN-SIM-9 table, default build): finishes M1, M2, M4 (57 % damage) and M9; stuck in mud on M3, M5 and M8; floods on M6; falls three times on M7. M5 is the Room Challenge, so a room of first-timers mostly ends "DNF · stuck". Orders: OVN-SIM-13 (stuck countdown and the way out) and OVN-GAME-9 (prompt). | `scripts/strangers.ts` (sim). Retested by the e2e at 537c721: M5 at full throttle, CLIMB tapped once when the prompt said so, Finished in 62.9 s (`e2e/screens/0445/phone-13-m5-stuck-prompt.png`). |
| Q13 | brain (+ sim) | FIXED (43a7201) | Jev never scans on M1. Jev mode from Play Now: "Scans: 0 of 1 scanned · 1 missed: +10 s", "HEURISTIC beat JEV by 46 points on this run" (801 vs 847). Drive mode: the Jev ghost takes 33.8 s. /screen chips: "PLAN · scan zone \"survivor\" in 3 m → full throttle (96 %)". The heuristic stops and scans. On the first mission every visitor plays, the AI skips the objective. | `e2e/screens/0433/phone-12-result-jev.png`, `e2e/screens/dev-a/screen-05-finish.png` Retested by the e2e at 537c721: Jev mode from Play Now finishes M1 in 26.9 s (33.4 s before, with the +10 s). Sim's 3-seed table: Jev 843 vs heuristic 847 on M1, both scan. |
| Q14 | brain | REPORTED FIXED (f4ad682) | Room Race phones show none of the v3 alerts (scan prompt and ring, hazard warning with safe speed, air chip, landing grade, "blocked"): they lived inside the solo HUD. Game exported `RunAlerts` (a69a7c9); the mount is in brain's RaceRun.tsx. | [GAME]'s OVN-GAME-6 report. Brain saw the scan and hazard alerts on a race phone at 390×844; air chip and landing grade not seen (M1 has no jump). Not retested by QA. |
| Q15 | sim + game | REPORTED FIXED (dc0904c sim, ddd9c33 game) | A visitor who has not touched the screen is counted as stuck: "STUCK IN 6 s · GIVE IT THROTTLE" 1.5 s after the start, and the run ends about 6 s later. Reading the screen is not being stuck; on the 60-second path a first-timer needs more than 7.5 s. Orders: sim starts the stuck clock at the first throttle input (30 s idle limit before it); game shows no STUCK prompt before the first touch. | [GAME]'s OVN-GAME-9 report. Sim: no countdown before the first throttle; 30 s untouched ends the run as "Never started". Game side (no prompt before the first touch) pending. Game: the prompt needs the throttle to have been used once. |
| Q16 | sim + game | FIXED (ddd9c33, b916210) | M5 at full throttle, CLIMB tapped once as the prompt said: later in the same run the prompt "THIS BUILD CANNOT PASS HERE" was shown, and the robot finished in 62.9 s. | e2e at 537c721: "prompts seen: TAP CLIMB, THIS BUILD CANNOT PASS HERE". Game re-ran the same script: only "TAP CLIMB" is seen. The gate at 5bf1572 (before the fix) still saw both; retest in the 05:03 gate. Retested by the e2e at f1a6a8c: "prompts seen: TAP CLIMB" only, Finished in 62.7 s. |
| Q17 | brain (+ ui) | OPEN | Drive run on M5 started a second after the Brief opened: the rival is "HEURISTIC", not Jev, because the Jev ghost was not ready. Nothing on the Brief says whether Jev is ready. | `e2e/screens/0445/phone-13-m5-stuck-prompt.png` ("HEURISTIC 2.2 m AHEAD"). |
| Q18 | lab | FIXED (f67f229) | Red unit test on main since 59bb8e9: apps/web/src/lab/lab.test.ts expects 4 simplification entries, there are 7. | Reported by [UI]; in the 04:53 gate. Unit tests green in the gate at 5bf1572. |
| Q19 | lab | REPORTED FIXED (9584eb8) | Lab Missions, Warehouse: a random driver beats the heuristic and Jev (607 vs 410 for Jev in brain's run; random ≈ 590 vs heuristic 497 in sim's). Each pickup option predicts only the leg to the parcel. Not to be shown as a brain comparison until fixed (OVN-LAB-4). | [BRAIN]'s OVN-BRAIN-3 report, [SIM]'s OVN-SIM-18 analysis. Lab's tests: heuristic vs random mean score over 6 seeds — maze 708 / 338, warehouse 557 / 240, mars 644 / 67, house 744 / 487, ctf 837 / 69. Jev not re-run on it yet. |
| Q20 | brain (+ ui) | OPEN (honesty) | The questions sent to every brain state the answer. Lab question lab-q3 appends a verdict to each option: "it is the correct job to start", "exploring is not correct now", "waiting is not correct now" (packages/brain/src/lab/question.ts:95–115). The rail question says "`scan` is the correct option" on a zone and, since q9-scan-approach, that slowing down is correct before one (packages/brain/src/index.ts:243–248). The verdicts are computed by the same rules the heuristic uses, so "Jev 694 vs heuristic 702" on Lab Missions and Jev scanning on M1 measure whether a model follows the stated verdict in time, not whether it can judge. Nothing on /lab or in docs/ARENA*.md says so. Before lab-q3, on facts alone, Jev scored 294 on Warehouse and 321 on Mars (brain's report). | [BRAIN]'s reports of 04:50 and 05:15; the two files. |

## Open regressions

| # | Owner | Status | What | Repro |
|---|---|---|---|---|
| R12 | human check | OPEN (needs one look on a real phone or a visible tab) | The 3D bench on Home and in the Workshop stayed on its drawn placeholder ("POWERING UP THE BENCH") after a hard load. ui found and fixed two causes (trigger waited on IntersectionObserver + requestIdleCallback, which a non-rendering page never delivers; placeholder faded out before the 3D had drawn). Neither the sim nor the ui session can confirm the result: both test panes are hidden and get no animation frames. | Hard-load `/` and `/workshop` on a phone or a visible Chrome tab. Expected: 3D within about a second. In a hidden pane the drawn robot stays up indefinitely with an unsized canvas — that is the no-frames state, not a failure. |
| R13 | game | FIXED (38c5f76; game's close screenshot of 04:30 seen by QA: no tufts in the pit) | Grass tufts were drawn inside the dark gap pit. Pit seen dark on `/run/M7` after the fix; too small in the retest screenshot to confirm the tufts are gone. | `/run/M7`, first gap after the ramp. |
| R14 | game | FIXED | M7: hopping the log leaves no piston for the bare gap, and nothing said so. The JUMP button now shows the re-arm time large while cooling (seen: "2.3 s · JUMP"). The track is unchanged. | `/run/M7` with a piston build, press jump. |
| R18 | human | OPEN (blocks phone testing on the dev server) | Phones on the LAN may not load the dev app: the laptop's address is now 192.168.0.14 (the `/screen` QR points there) but `apps/web/next.config.ts` `allowedDevOrigins` lists only 10.194.73.231, 127.0.0.1, `*.local`, `*.trycloudflare.com`. Reported by game; partly reproduced with curl: a dev chunk requested from 192.168.0.14 with an `Origin` or cross-site header returns 403, without them 200. Not confirmed on a phone. | From a phone on the same wifi open `http://192.168.0.14:3000/`. If it never becomes interactive, add `'192.168.0.14'` to `allowedDevOrigins` and restart `pnpm dev`, or use the tunnel / `pnpm demo:stable`. |

## Dev server health — 10 Oct

- Reported by game (clean headless Chromium): every page on `:3000` navigated to itself every 1–3 s and never mounted a canvas; the HMR socket sent `{"type":"restart"}` on every connect. Possible trigger, not proven: a missing public file (`/renders/parts/pi_regulator_s13v30f5.png`) being compiled as a page. Owner: human (restart `pnpm dev`).
- Seen by sim shortly after: `/run/M1` showed "3D VIEW UNAVAILABLE ON THIS DEVICE", then requests returned empty responses, then nothing was listening on port 3000. Browser QA is not possible until the server is back.
- The server came back. `assessBuild` measured in the browser (run page, dev build, `window.__rivetrunSim`): first call per mission 5.5–13 ms, worst of 84 further calls (every preset × every mission × 3) 19.7 ms on M6 with Deep Diver. Target was under 200 ms.

## Brain v3 and gameplay v3, sim side — 10 Oct

| Check | Result |
|---|---|
| A blind build is told nothing about the track ahead and hits the rock | PASS (unit test; the event reads "BLIND · hit rock at N m: no distance sensor"). |
| A build without an IMU never reports slip or tilt | PASS (unit test on M3 and M4, every decision and 400 observations). |
| No decision on a long uniform segment | PASS (100 m of asphalt: one decision, the start). |
| Same seed and same latencies give the same run | PASS (350 ms fixed latency, M4 and M7). A 900 ms answer applies 0.9 s later and costs over a metre. |
| Decisions per run, heuristic, seed 1001, 7 missions × 4 presets | 12.0 measured by sim before the energy triggers, 15.4 measured by brain after; 21.4 before v3, 62 % of those on the clock. |
| Energy makes pace matter on M5 and M6 | PASS (unit test): heavy build on the small battery runs out at 90 % of the track at full throttle, finishes at steady; the heuristic eases off and finishes. |
| Scan zones | PASS (unit test): the All-rounder stops and scans on M1; the Mud Crawler has no camera, misses it and pays 10 s. |
| Preset finish rates, M1–M7, after all of it | PASS: identical to before v3. Scores are lower (energy costs more). |
| Drive mode in the browser after the changes | One run on M1: hints arrive as chips, telemetry button present, run finishes. The 3D view showed the game session's "unavailable" fallback while they were mid-edit. |

Open, sim: none known. Not done from the v3 specs: air pitch and landing grades, charged piston jump (both P2); continuous analog throttle (the slider maps to four levels).

## Strategy layer and physical plausibility — 10 Oct

| Check | Result |
|---|---|
| `capabilities`, `missionDemands`, `assessBuild` exported with unit tests | PASS. 21 sim tests. |
| `assessBuild` agrees with the headless run on every mission | PASS (same finish and score, M1–M7). |
| Obstacles are solid: stop at the near face, event says why | PASS (unit test on M4's rock; `blockedBy`, `blocked: true`). |
| Height follows geometry: 0 everywhere except ramp, obstacle, drop deck or airborne | PASS on M1–M7 (unit test). |
| Preset balance after the changes | PASS. Core balance rows unchanged; only the piston test build moved (it now clears rocks in the air). |
| New parts (lidar, ToF, brushless motor) | PASS for tests and determinism. For the heuristic the longer obstacle range gives no measurable gain (see CHANGES / report). |

## Retests — 10 Oct

### 1. ui fixes: Brief and Home (retested, all FIXED)

| # | Check | Result |
|---|---|---|
| R7 | M7 Brief shows what the mission is about | FIXED. Chips: `2 RAMPS · 3 GAPS UP TO 0.9 M · 0.7 M DROP · LOG`; profile draws the ramp lip and breaks in the rail; `/brief/M3` shows `0.6 M DROP`. |
| R7b | M7 Brief warns a build without a piston | FIXED. "This build can't clear the gap with no ramp — needs Piston jump" + Fix in Workshop, above the fold. |
| R8 | Home copy in Drive mode | FIXED. Headline ends "Then race it."; bench readout "YOUR RIVAL · JEV · same robot, same track"; button "Mission 01 · you drive". Jev mode keeps "Watch it drive." and "JEV · STANDING BY". |
| R8b | "the AI cannot…" sensor warnings in Drive mode | FIXED. `/brief/M3`: the IMU warning shows in Jev mode and is gone in Drive mode. |

### 2. Black scene on cold load

What could be tested: hard loads (full navigation) of `/`, `/workshop`, `/run/M1`, `/screen`. **Not tested: cache disabled and Fast 4G** — the browser pane has no network throttling or cache control. That part still needs a run from Chrome DevTools or a phone.

| Route | Result on hard load |
|---|---|
| `/run/M1` | FIXED, retested twice. Causes: (a) game: `RunScene.tsx` was briefly uncompilable mid-edit (duplicate `FALL_MS` / `HEIGHT_SCALE`), never committed; (b) game: nothing covered a canvas between mount and its first drawn frame — fixed in 38c5f76 with a loading cover ("BUILDING THE TRACK" + a tip) kept up until the first frame, a plain-lights fallback and a message on a crash or lost context; (c) sim: the run started before the scene was visible, so the clock ran over the cover (measured ~4 s; game measured 1.9 s). The run page now starts the controller from `RunCanvas`'s `onReady` (first drawn frame, or 15 s if the view is given up on), with the robot on the start line and the clock at 00:00.0 until then. Retest on `/run/M7`, hard load: cover with clock 00:00.0 for 5 s, then the scene and a normal run. |
| `/` | Not black: drawn robot + "POWERING UP THE BENCH" for the 6 s watched, no 3D. This is the expected no-frames state in a hidden pane (R12): needs the human check. |
| `/workshop` | Same as `/`. |
| `/screen` | PASS. Leaderboard view has no 3D. Room Race lobby: the attract replay rendered within 6 s of creating the room (four robots on the M5 start line, rain). |

## Gameplay v2 pass — 10 Oct

Solo, Drive mode:

| Check | Result |
|---|---|
| M1, default build | PASS. Play Now → coach marks → run; Jev ghost live from the Home prefetch; "Jev wins by 0.3 s". |
| M3 | PASS. Climb mode up the 15° mud slope; 39.1 s, "You beat the AI by 7.9 s". Two earlier attempts were fair DNFs (coasting without climb mode; braking in deep mud). |
| M7: ramps, drop | PASS at full throttle. |
| M7: gap, respawn, three falls | PASS. "FELL · +5 s · 2 of 3", respawn with a run-up, third fall ends the run. |
| M7: piston | PASS. Timed jump clears the 0.9 m bare gap; 32.2 s. |
| Workshop dials | PASS. 4S + gear 1: predicted 2.0 → 3.6 m/s, €205 → €250; M1 in 12.7 s vs 21.4 s stock. |
| Result "You vs Jev" | PASS. Three verdict forms seen. |

Room Race v2 (big screen tab + one phone tab + 2 JEV bots, M1):

| Check | Result |
|---|---|
| Lobby, bots, join | PASS. |
| BUILD phase, countdown in sync | PASS. |
| Race, close countdown | PASS. "RACE CLOSES IN 42 s". |
| HUMANS vs JEV verdict | PASS. "HUMANS WIN · QA-SIM beat JEV-2 by 8.8 s"; same order and times on both screens. |

## Closed regressions

| # | Owner | Status | What |
|---|---|---|---|
| R1 | ui | FIXED | Result headline time disagreed with the Brain Duel row by 0.1 s (43.7 vs 43.6). One formatter now. |
| R2 | ui | FIXED | `/brief/M6`: the Deploy bar covered the build card. |
| R3 | sim | FIXED | HUD showed terrain distances beyond sensor range ("ahead WATER (drone) · 63 m"). Capped at range. |
| R4 | sim | FIXED | Why line said "water damage" on a mud-only course. |
| R5 | sim | FIXED | A Jev answer arriving after the finish still emitted a decision event. |
| R6 | brain | REPORTED FIXED | Careful briefing barely changed Jev's choices. Now outranks priority; brain's benchmark says Careful then fails M6 with Deep Diver (open question for the human, not retested). |
| R9 | brain | FIXED | Room Race lobby ignored the mission pick until BUILD. |
| R10 | brain | FIXED | Phone build screen: wrong mass (no chassis) and cost; hidden cells / gearing carried into the race. Dials added, numbers from `predictStats`. |
| R11 | brain | FIXED | Phone build screen: READY below the fold. Pinned bar with cost, first warning and countdown. |
| R15 | sim | FIXED | DNF progress dropped after a fall (respawn point instead of furthest point). |
| R16 | sim | FIXED | Stuck-on-slope why line blamed a missing IMU when a player was driving. |
| R17 | game | NOT A BUG | Black 3D scene on three loads: the game session's scene file was mid-edit (see Retests 2a). |

## Not covered

Share, Episode download, M2 by hand, landscape, real touch input, a real phone, more than one human in a race, Jev unavailable during a race.
