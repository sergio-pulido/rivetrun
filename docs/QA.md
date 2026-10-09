# RivetRun — QA log

Owner of this file: sim session. Tested on `http://localhost:3000` (the human's dev server) in the Claude browser pane, phone viewport 390×844 unless stated. Input is keyboard events, not touch. Nothing here was run on a real phone.

Status: **OPEN** = reproduces now · **FIXED** = fix retested in the browser · **REPORTED FIXED** = owner says fixed, not retested by sim · **NOT A BUG** = explained.

## Open regressions

| # | Owner | Status | What | Repro |
|---|---|---|---|---|
| R12 | human check | OPEN (needs one look on a real phone or a visible tab) | The 3D bench on Home and in the Workshop stayed on its drawn placeholder ("POWERING UP THE BENCH") after a hard load. ui found and fixed two causes (trigger waited on IntersectionObserver + requestIdleCallback, which a non-rendering page never delivers; placeholder faded out before the 3D had drawn). Neither the sim nor the ui session can confirm the result: both test panes are hidden and get no animation frames. | Hard-load `/` and `/workshop` on a phone or a visible Chrome tab. Expected: 3D within about a second. In a hidden pane the drawn robot stays up indefinitely with an unsized canvas — that is the no-frames state, not a failure. |
| R13 | game | OPEN (cosmetic) | Grass tufts are drawn inside the dark gap pit, along one wall. | `/run/M7`, first gap after the ramp. |
| R14 | sim | OPEN (design) | M7: the log sits 4 m before the bare 0.9 m gap and the piston re-arms in 3 s, so hopping the log costs the gap jump. Hint requested from game (re-arm seconds on the JUMP button). | `/run/M7` with a piston build, jump the log at 2 m/s. |

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
| `/run/M1` | FIXED. Two causes found. (a) game: `RunScene.tsx` was briefly uncompilable mid-edit (duplicate `FALL_MS` / `HEIGHT_SCALE`), confirmed by the game session, never committed. (b) sim: the run started as soon as the code was ready, so while the 3D chunk was still loading the clock ran over a dark screen (measured: canvas unsized for ~4 s, timer already at 00:05). Now the robot waits on the start line with the clock at 00:00.0 under the game session's "BUILDING THE TRACK" overlay, and the run starts two frames after the canvas is sized (`app/run/[mission]/sceneReady.ts`, commit `ba3a9b3`). Retested: clock held for ~4 s, then a full Drive run finished normally (20.6 s). |
| `/run/M7` | PASS. Scene fully drawn at the 5 s mark. |
| `/` | See R12: placeholder only after 8 s, no canvas. Not black. |
| `/workshop` | See R12: placeholder only after 8 s, no canvas. Not black. |
| `/screen` | PASS for the leaderboard view (no 3D on it). The attract replay in the Room Race lobby was black once during the mid-edit window above and rendered on the next visit. |

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
