# [LAB] handover — Lab Missions: grid scenarios with fog of war (packages/lab, /scenarios)

Written Sat 06:50, updated 11:15, for the 16:15 demo. Checked on the dev server (:3000) by unit tests, by reading
the page and, for the sprite board, by headless screenshots at 390×844, 844×390 and 1280×720; nothing was seen on a
real phone, on :3001 or through the tunnel. The way in is "Lab Missions" in the header menu
(added by [UI] at 10:00, 27de0c8) or the card on /lab; there is no card on Home.

## Built tonight (commit)
- `@rivetrun/lab`: a deterministic grid sim, fixed 50 ms step; speed, draw, battery and contact damage come from the same build through the rail's formulas (6d28f70).
- Fog of war = sensor coverage: a robot's map holds only what its fitted sensors reported; with none it finds walls by hitting them (6d28f70).
- Five missions with objectives and a score: Maze, Warehouse delivery, Mars samples, House tour, Capture the flag (d2dbd53).
- /scenarios: picker, brief with four loadouts, board, pad, keys, tap a tile to drive there, result with the true map beside what the robot sensed, best score per mission (2561876).
- A score that tells good choices from random ones: each option predicts the whole job and the best tour, not only the next leg (9584eb8).
- Wide-screen layout, the simplification list on every brief, a map legend, two taps to end a mission (d996866, fca3e98).
- The real Jev drives, or plays the rival, through /api/lab/decide; after 1.2 s the fixed rules decide and the chip says FALLBACK (a0193a7).
- The brief says what Jev is told, with a switch to the facts-only question (4813b9f). The game's rover and ground colours (6ab4b1d).
- Review round on the page, 17 of 19 findings fixed (c8c22ae). Sideways phone, reload and back mid-run, Jev never answering (bec0ef2).
- The board drawn with the Blender agent's sprites: floors, walls, doors, stairs, parcels, bays, forklift, samples, lander, flag, the rover per locomotion; the SVG board is the fallback (88de47c).
- RR-SOUND: the recorded sound pack's generator (scripts/gen-sound.mjs), player and race cues (apps/web/src/game/audio/samples.ts, sampleCues.ts), mounted on /run, /workshop and /screen; silent until the ElevenLabs files exist (804d2b5).

## Simplified or assumed
- The list under "What is simplified" on every brief (the sim's `SIMPLIFICATIONS`, screen 'lab'): tiles instead of the track's physics, a ramp costs both ways, lidar all round, ultrasonic one tile, forklifts turn back, no cold, no night.
- Sensors have no noise: what is in range and in line of sight is known exactly.
- The score weights and the tuning are mine and calibrated against nothing: a fall costs 25 % damage and 3 s, a loaded motor is up to 60 % slower, a tag takes the flag only from a carrier standing still.
- "Told the verdict" is the default: Jev's question names the option the fixed rules rate best, so that score measures following. "Facts only" is the fair comparison; the brief says which one is on.
- When Jev cannot be reached its seat is filled by the fixed rules answering in 400 ms, and the brief says so.
- Decisions are event-driven: the last command holds until a sensor, the body or the battery reports a change.
- On the page every run of a mission uses the same map and seed (1001); the other seeds are used in tests only.
- The rover picture follows the build's locomotion only, not its sensors. The flag is drawn orange on the ground and in the colour of whoever carries it. Exit, checkpoint, base, ramp and crater have no sprite and keep their SVG marks.
- Two review findings left as they are: a call to Jev in flight is not cancelled by RETRY, and the thread title still reads "Jev decides, live" when every answer is a fallback.

## Nobody has verified
- A real phone: thumbs on the pad, rotation in the hand, iOS Safari's toolbars (844×390 was emulated).
- A production build (:3001, `pnpm demo:stable`) and the tunnel. I only used :3000.
- A full Capture the flag against the live Jev: I have the fallback path on record, not a live rival run.
- The sprite board on a real phone or iOS Safari. Its frame rate was measured in headless Chromium on the dev build under 4× CPU throttle only: 72 to 83 fps, the SVG board 58 to 70.
- The last-run note (bec0ef2) by eye: it was read from the page, not seen.
- Jev against the fixed rules over many runs: that table is [BRAIN]'s. Mine are single runs on seed 1001 (Maze 729, Warehouse 497 told and 520 facts only, Mars 552, House 759).
- A real radio drop (I cut fetch inside the page). An hour of retries in one tab. Two tabs at once.
- RR-SOUND: no call to ElevenLabs was ever made (the key was not in apps/web/.env.local) and nothing was heard. With the pack empty the app sounds as before.

## If this breaks at the demo
1. Every chip in the thread says "(FALLBACK)", or the brief says "Jev is not reachable from this page right now".
   The run still plays: the fixed rules are driving, so say that instead of "Jev". To get Jev back, open
   `/api/lab/decide` in a tab: it must show `"configured": true`. Then reload the mission page (it asks when the
   page opens). If it shows false, that server was started without the key in apps/web/.env.local.
2. The mission is back on its brief with "Your last run here stopped at N s without a result … It was not scored."
   The page was reloaded or left mid-run. Only that run is lost: press Start, it is the same map and start.
   DISMISS removes the line. A finished run leaves its heading and score there instead.
3. The robot does not move.
   With "You drive" nothing moves until an arrow or WASD is pressed or a mapped tile is tapped; click the page
   once if the keys go elsewhere. A robot stopped before a forklift is waiting for it (the thread says "the way
   is blocked by something moving"). The "Blind" loadout stops at every wall: that is its point; pick
   "Recommended" for a clean run, and "The brain drives" to show Jev.
Also useful: if the map pictures look wrong or a phone stutters, add `?sprites=0` to the address and reload: that tab
goes back to the SVG board (`?sprites=1` brings the pictures back; the board also falls back by itself when a
sprite file does not load). Esc stops the robot. Best scores live in the browser (localStorage `rivetrun.lab.bests.v1`); clear
site data for an empty board. A mission ends by itself at its time limit (120 to 240 s) with "Out of time".
Sound pack: with ELEVENLABS_API_KEY in apps/web/.env.local run `node scripts/gen-sound.mjs`; or drop the mp3s into apps/web/public/sfx and run it with `--index`. Then commit the files and apps/web/src/game/audio/samplePack.json. The HUD mute switch silences it too.
