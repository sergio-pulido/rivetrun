# RivetRun — QA log

Owner of this file: sim session. Tested on `http://localhost:3000` (the human's dev server) in the Claude browser pane, phone viewport 390×844 unless stated. Input is keyboard events, not touch. Nothing here was run on a real phone.

Status: **OPEN** = reproduces now · **FIXED** = fix retested in the browser · **REPORTED FIXED** = owner says fixed, not retested by sim · **NOT A BUG** = explained.

## Open regressions

| # | Owner | Status | What | Repro |
|---|---|---|---|---|
| R12 | human check | OPEN (needs one look on a real phone or a visible tab) | The 3D bench on Home and in the Workshop stayed on its drawn placeholder ("POWERING UP THE BENCH") after a hard load. ui found and fixed two causes (trigger waited on IntersectionObserver + requestIdleCallback, which a non-rendering page never delivers; placeholder faded out before the 3D had drawn). Neither the sim nor the ui session can confirm the result: both test panes are hidden and get no animation frames. | Hard-load `/` and `/workshop` on a phone or a visible Chrome tab. Expected: 3D within about a second. In a hidden pane the drawn robot stays up indefinitely with an unsized canvas — that is the no-frames state, not a failure. |
| R13 | game | REPORTED FIXED (38c5f76) | Grass tufts were drawn inside the dark gap pit. Pit seen dark on `/run/M7` after the fix; too small in the retest screenshot to confirm the tufts are gone. | `/run/M7`, first gap after the ramp. |
| R14 | game | FIXED | M7: hopping the log leaves no piston for the bare gap, and nothing said so. The JUMP button now shows the re-arm time large while cooling (seen: "2.3 s · JUMP"). The track is unchanged. | `/run/M7` with a piston build, press jump. |
| R18 | human | OPEN (blocks phone testing on the dev server) | Phones on the LAN may not load the dev app: the laptop's address is now 192.168.0.14 (the `/screen` QR points there) but `apps/web/next.config.ts` `allowedDevOrigins` lists only 10.194.73.231, 127.0.0.1, `*.local`, `*.trycloudflare.com`. Reported by game; partly reproduced with curl: a dev chunk requested from 192.168.0.14 with an `Origin` or cross-site header returns 403, without them 200. Not confirmed on a phone. | From a phone on the same wifi open `http://192.168.0.14:3000/`. If it never becomes interactive, add `'192.168.0.14'` to `allowedDevOrigins` and restart `pnpm dev`, or use the tunnel / `pnpm demo:stable`. |

## Dev server health — 10 Oct

- Reported by game (clean headless Chromium): every page on `:3000` navigated to itself every 1–3 s and never mounted a canvas; the HMR socket sent `{"type":"restart"}` on every connect. Possible trigger, not proven: a missing public file (`/renders/parts/pi_regulator_s13v30f5.png`) being compiled as a page. Owner: human (restart `pnpm dev`).
- Seen by sim shortly after: `/run/M1` showed "3D VIEW UNAVAILABLE ON THIS DEVICE", then requests returned empty responses, then nothing was listening on port 3000. Browser QA is not possible until the server is back.
- The server came back. `assessBuild` measured in the browser (run page, dev build, `window.__rivetrunSim`): first call per mission 5.5–13 ms, worst of 84 further calls (every preset × every mission × 3) 19.7 ms on M6 with Deep Diver. Target was under 200 ms.

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
