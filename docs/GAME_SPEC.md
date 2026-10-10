# RivetRun — Game Spec v3

Marker: RR-SPEC-V3 (supersedes RR-SPEC-V2: adds three swappable policies, Brain Duel ghosts and the benchmark)

## What the game is now

The spec below is the design of 9 October and is kept as written. This list is where the game on `main` differs from it, one line and one commit each (sim side; `docs/CHANGES.md` has every change, `docs/SIM_MODEL.md` the model as it stands).

- **You can drive.** Drive mode: the player's thumbs go through the same physics as the brains, against one precomputed Jev ghost; "AI drives" is the other mode. `7b79040`
- **Analog controls.** Throttle and brake are 0–1 and map to full / steady / ease / coast and hard / soft brake; nothing held coasts. `a98b083`
- **Wheelspin.** Asking for more than 1.1× the grip leaves 70 % of it; climb mode is traction control. `a98b083`
- **Safe speeds.** Contact and rough ground are free at or below a safe speed; damage grows with the square of the excess. Obstacles are solid and can block a build. `a98b083`, `bb9435c`
- **Scan zones.** Missions have objectives: stop on a zone for 1.5 s with the right sensor; a miss adds 10 s. `a98b083`
- **Triggers instead of a clock.** A brain is asked only when something changes; the 1.5 s interval is gone, and a slow answer costs sim time. `dc9c5e8`
- **The brain sees an Observation.** Built only from the fitted sensors plus the core kit (speed, distance, charge, draw, mission plan); a leak test guards it. `dc9c5e8`, `04f0e02`
- **A change of ground is told twice.** Once when seen, again at 2 m. `17ba1ac`
- **Energy matters.** Throttle levels differ in cost per metre; a heavy build on the small battery runs out at full throttle on the long missions. `a98b083`
- **Build tuning.** Battery cells, wheel size and gearing, beyond the part slots. `7b79040`
- **More parts than twelve.** Scout drone, thruster kit, piston, lidar, ToF ranger, brushless motor, NoIR camera, light sensor. `e252cea`, `b868f17`, `07c15bf`, `e8e60f5`
- **Height.** Ramps, gaps, drops, falls with a respawn, and a piston jump. `7b79040`
- **Nine missions, not five.** M6 Deep Water, M7 Earthquake Rescue, M8 Storm Ridge, M9 Polar Night. `76b9f35`, `7b79040`, `e8e60f5`
- **Weather beyond rain and cold.** Wind as drag with seeded gusts, cold by temperature, fog, night and snowfall on sensor range, snow as a surface; at night a camera scan needs a NoIR camera or headlights. `9d3db6c`, `c9f6f27`, `e8e60f5`
- **Air levelling.** The robot levels itself in the air for every driver; a player's brake or extra throttle can spoil the landing, which is graded. A held jump button charges the piston. `0e802de`, `2f9a3bb`
- **Stuck countdown.** After 1.5 s without progress the player sees the seconds left and the command that frees the build. `125bda4`, `b916210`
- **First-touch rule.** A player's stuck clock starts with their first throttle; an untouched run ends after 30 s as never started. `dc0904c`
- **A strategy layer.** `assessBuild` tells the Workshop and the Brief what a build can and cannot do on a mission before the run. `bb9435c`
- **Replayable human runs.** A Drive run's input log replays to the identical outcome, for humans in the Brain Arena. `a8b0d52`, `ad7a909`
- **The result explains itself.** Losses ranked in points, the biggest one named, and a why-line for every run. `d88704e`, `43f1d8e`
- **Not built from the spec:** progression beyond point unlocks; "while a decision is pending the run slows to 0.25×" (off by default: a live run keeps its pace).

## One line
You build the body. AI drives it. A mobile-browser game where players design a DIY robot (Arduino / Raspberry Pi-class parts) and an AI decision model (Jev) pilots it through terrain missions. Every decision the AI makes is visible on screen.

## Hackathon constraints
- Runs in a mobile browser. A stranger plays within 60 s. No login.
- Build window: Fri 18:30–23:00, Sat 08:00–16:00. Feature freeze Sat 14:00. Code freeze Sat 16:00.
- Judged on: is it good, is it finished, is it original, how hard the agents were pushed.

## Non-goals (hackathon)
Real-time multiplayer, real hardware control, accounts, a rigid-body physics engine (Rapier, cannon, etc.: the deterministic sim is the authority, and lookahead clones and steps it once per action at every decision), procedural level generation beyond seeded jitter, more than ~12 parts, imported 3D models.

## View and world
- 2.5D side view rendered with three.js: the camera looks at the track from the side; gameplay is 1D.
- Track = ordered segments: `{ terrain, lengthM, slopeDeg, obstacle?: 'rock' | 'step' | 'log', depthCm? }` (depth for water/mud).
- The robot moves 1D along track distance `x` (m) at speed `v` (m/s). Slope comes from the segment.
- Deterministic: fixed timestep 50 ms, seeded RNG (mulberry32), pure functions. Same seed + same decisions ⇒ same outcome. The renderer only reads sim state; it never computes physics.

## Terrains (v0 values in `packages/sim/src/data/terrains.ts`, tuned later)
asphalt, grass, sand, mud, ice, water (shallow), rock.
Each terrain: `baseFriction`, `rollingResistance`, `sinkage`, `impactRisk`, `waterDamage`.
Weather modifiers per mission:
- rain: friction ×0.8, mud sinkage ×1.3, camera range ×0.6
- cold: battery capacity ×0.8, ice friction ×0.9

## Parts (≤12, `packages/sim/src/data/parts.ts`)
Slots:
- Locomotion (exactly 1): wheels, off-road wheels, tracks.
- Motor (exactly 1): light (fast, low torque), high-torque (slower, strong, higher power draw).
- Battery (exactly 1): small (light), large (heavy).
- Sensors (0–2): ultrasonic (obstacle ahead ≤3 m), IMU (slip %, tilt), camera (terrain type of next segment ≤6 m), moisture probe (water/mud depth ahead).
- Extras (0–2): winch (enables `deploy_winch` on slopes/obstacles), waterproof case (no water damage, +mass), bumper (impact damage ×0.5, +mass).

Every part: `massKg`, `costEur`, `powerW`, plus effect fields. Default budget €250. Mass affects acceleration, sinkage and battery drain.
Presets (one tap): Speedster, Mud Crawler, All-rounder.
Locked parts unlock with points (progression).

## Perception (core mechanic)
The Brain sees ONLY what the build's sensors report, with seeded noise. No sensor ⇒ that field is `unknown`. Ground truth is never sent to the Brain. Choosing parts = choosing what the AI can know and do.

## Brains (swappable policies)
All implement `Brain.decide(question): Promise<BrainDecision>`:
- `jev`: Jev via `POST /api/decide`. Drives the player's run.
- `heuristic`: deterministic; picks the action with the best lookahead utility for the player's priority. Also Jev's fallback.
- `random`: seeded uniform choice over the available actions.

- Decision points: perceived terrain change ahead (or on entry when there is no camera), obstacle within sensor range, slip > 25 % (IMU only), damage event, otherwise every 1.5 s.
- Question: single choice over the available actions (filtered by build capabilities): `cruise`, `accelerate`, `slow_down`, `brake`, `reverse`, `climb_mode`, `deploy_winch`. Exact Jev primitive and request shape: `docs/JEV.md` (written from the official docs; never assumed).
- State sent: perceived observations + robot status (speed, battery %, damage %) + player priority (speed ↔ safety) + lookahead: for each available action, a 1.5 s forward simulation on the perceived (not true) state → predicted progress m, damage %, energy %. Rationale: Jev evaluates well when code supplies the simulation; it is weak at raw control.
- Output: probability per action; argmax is applied. `BrainDecision` carries `policy`, `fallback` (true when Jev failed and the heuristic decided) and `latencyMs`.
- Fallback: when Jev errors or exceeds 1200 ms, the heuristic decides with `fallback: true` and the HUD shows `FALLBACK`. Never hide which policy decided.
- While a decision is pending the run slows to 0.25×. HUD shows state summary, option bars with %, chosen action, policy/fallback, latency.

## Brain Duel (ghosts)
- When a run starts, the client runs the same mission, seed and build headless with `heuristic` and `random` (instant: deterministic, no network) and records a GhostTrace for each (SimState at 10 Hz + Outcome).
- The run view draws them as translucent ghost robots on parallel lanes, labelled HEURISTIC and RANDOM, played against sim time.
- Result shows a 3-row table (Jev / Heuristic / Random): finished, time, damage, energy, score. Every number is measured from the runs. If the heuristic beats Jev, the table says so.

## Benchmark (published with the setup)
`packages/brain/scripts/benchmark.ts`: every mission × every preset × N seeds × 3 policies, with real Jev calls. Writes `docs/BENCHMARK.md`: finish rate and mean time / damage / energy / score per policy, model id, total decisions, Jev latency p50/p95, date. Measured numbers only.

## Damage, energy, score
- Damage 0–100 %: impacts (speed × obstacle hardness, bumper reduces), water ingress (no case), tip-over on slope beyond the robot's limit. 100 % = DNF.
- Energy: battery Wh; drain ∝ power × load (slope, sinkage, mass). 0 % = DNF.
- Score if finished: `1000 − 4·timeS − 6·damagePct − 2·energyUsedPct − costEur/5`. DNF: `200 × progressFraction`. Constants in `packages/sim/src/data/tuning.ts`.
- Stars: 1 = finished, 2 = score ≥ mission threshold, 3 = threshold + zero damage.

## Missions (`packages/sim/src/data/missions.ts`)
- M1 Garage Test — asphalt, grass, small step. Teaches the HUD.
- M2 Beach Run — asphalt, sand, shallow water, sand.
- M3 Mud Run — grass, mud slope 15°, mud, rock.
- M4 Frozen Pass — cold. Asphalt, ice slope 12°, rock field, ice.
- M5 Room Challenge — rain, all terrains. Fixed seed shared by every player. Leaderboard.

Practice missions jitter friction ±10 % and sensor noise by a random seed. Room Challenge uses its fixed seed.

## Screens (the 60-second path)
1. Home: Play (→ M1 with All-rounder preset) · Room Challenge · Leaderboard · "N episodes logged".
2. Workshop: 3D robot on a workbench (slow turntable, tap a slot to swap parts, the model updates live), budget and mass bars, stat bars (speed, grip, endurance, perception), presets, locked parts with point cost.
3. Brief: terrain strip, conditions, priority slider, Deploy.
4. Run: 2.5D side view with the Jev robot + two ghosts, Brain HUD, top bar (time, battery, damage).
5. Result: score breakdown, stars, Brain Duel table, one-line "why" derived from the episode (e.g. "Slipped 6 s on ice — no IMU"), Retry / Upgrade / Submit (nickname) / Share / Download episode (JSON). Share uses the Web Share API with score, build and URL; fallback copies the text.
6. `/screen`: big-screen Room Challenge leaderboard, auto-refresh, QR to the game. Footer: "Today a game. Tomorrow a benchmark."

First-time path: Home → Play → run starts with the preset; zero choices required before the first run.

## Episode (logged per run)
`{ id, missionId, seed, policy, build, environment, decisions[{ t, perceived, options, probabilities, selected, policy, fallback, latencyMs }], outcome{ finished, timeS, damagePct, energyUsedPct, costEur, score } }`
Stored in Postgres on submit. Download as JSON from Result. No claim of real-robot export or of training-grade data.

## API (Next.js route handlers, Node runtime, in apps/web)
- `POST /api/decide` — BrainQuestion → BrainDecision (server-side Jev call; the key never reaches the client).
- `POST /api/runs` — submit Episode.
- `GET /api/leaderboard?mission=M5` — top 20, best per nickname.
- `GET /api/stats` — episodes count.
Without `DATABASE_URL` the game still works: runs are not stored, leaderboard returns empty, stats return 0.

## Stack
- pnpm workspaces + Turborepo.
- apps/web: Next.js (App Router, latest stable) + React 19 + TypeScript + Tailwind + Zustand (client game state).
- 3D: three.js via @react-three/fiber + @react-three/drei. Client-only components (dynamic import, no SSR). Procedural low-poly geometry only (boxes, cylinders, extrusions), no imported models.
- Mobile performance budget: DPR capped at 1.5, at most one shadow-casting light, instanced particles, 60 fps target on a mid-range phone.
- Zod in packages/contracts is the single source of truth for every shape.
- Drizzle + Postgres (Neon) in packages/db, optional until provisioned.
- Vitest (packages), Playwright (mobile viewport, apps/web).
- Deploy: Vercel, root directory apps/web.

## Layout and ownership
- `packages/contracts` — frozen after scaffold; changes need a proposed diff.
- `packages/sim` (src, src/data, scripts/balance.ts) — sim session. Pure TS, no DOM, no React.
- `packages/brain` (server-only Jev client, scripts/benchmark.ts), `packages/db`, `apps/web/app/api/**`, `apps/web/src/brain/**` — brain session.
- `apps/web/src/game/**` (R3F run scene, ghosts, workshop robot model, HUD) — render session.
- `apps/web/app/**` pages and `apps/web/src/ui/**` — ui session.
- `docs/` — GAME_SPEC.md, JEV.md, BENCHMARK.md, prompts/.

## Priorities and cuts
- Must ship: M1 + M5, Workshop with presets, Jev + fallback HUD, ghosts, Result with Brain Duel table, leaderboard, /screen.
- Cut first if behind at Sat 12:00: progression locks, M2–M4 balancing (keep them playable), moisture probe, winch.
- Stretch: one persistent 3D scene where the camera flies from the workbench to the track on Deploy.

## Visual direction
Maker workshop: dark slate, safety-orange accents, blueprint grid, chunky tactile buttons ≥48 px. Robot parts look like real maker parts made of primitives: PCB-green boards, black servo blocks, orange 3D-printed brackets, rubber wheels. Terrain materials clearly distinct (ice sheen, water surface, mud gloss, sand grain). Ghost robots: translucent, desaturated, labelled.
Robot personality: an LED-eye face that reacts to the last decision (squint on brake, wide on accelerate, X eyes on DNF), body wobble on slip, parts fly off and bounce on DNF. Crashes are exaggerated and funny.
