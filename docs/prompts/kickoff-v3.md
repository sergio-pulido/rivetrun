# RivetRun — kickoff prompts v3

Supersedes kickoff v2. Spec: docs/GAME_SPEC.md (marker RR-SPEC-V3).
Order: run Prompt 1 (scaffold) alone. Merge it to main. Then launch Prompts 2–5 in parallel, each in its own worktree and branch.

---

## Prompt 1 — session: scaffold · branch: feat/scaffold

```
# RivetRun — monorepo scaffold + contracts (session: scaffold, branch feat/scaffold)

Hackathon build. Repo: /Users/nectios/workspace-os/hackathons/rivetrun. Spec: docs/GAME_SPEC.md.
First: grep docs/GAME_SPEC.md for "RR-SPEC-V3". STOP if missing.
Commit identity: `git config user.email` must end in @alodai.com. STOP if not.

Phase 0 — read-only, max 15 min
1. Read docs/GAME_SPEC.md fully.
2. Read the official Jev docs at docs.typesafe.ai (introduction, primitives, models, confidence, auth, rate limits, any JS/HTTP usage).
   Write docs/JEV.md: auth method, HTTP endpoint(s), request/response shape for a single-choice question with per-option probabilities, model id to pin, latency, rate limits, pricing. Write only what you read; mark unknowns as UNKNOWN.
STOP and report if Jev cannot be called over HTTP from a Node.js server, or if per-option probabilities are not exposed.

Phase 1 — scaffold
- pnpm workspaces + Turborepo. Packages:
  - packages/contracts (@rivetrun/contracts): Zod schemas + inferred types for Terrain, Segment, Track, Weather, Mission, Part, Slot, Build, Perception, RobotStatus, Action, LookaheadEntry, BrainQuestion, Policy ('jev' | 'heuristic' | 'random'), BrainDecision (probabilities, selected, policy, fallback boolean, latencyMs), Brain interface (decide(q): Promise<BrainDecision>), SimState (what the renderer reads: x, v, slopeDeg, pitch, wheelSpin, terrain, battery, damage, effects), GhostTrace (policy, frames: SimState[] at 10 Hz, outcome), RunEvent union (frame, decisionPending, decision, terrainEnter, damage, finish, dnf), Episode (includes policy), Outcome, LeaderboardEntry, and request/response schemas for /api/decide, /api/runs, /api/leaderboard, /api/stats.
  - packages/sim (@rivetrun/sim): src/data/{terrains,parts,missions,tuning}.ts with v0 values per spec; stub exports createRun, step, perceive, lookahead, detectDecisionPoint, availableActions, score, heuristicBrain, randomBrain(seed), runController, runHeadless(mission, seed, build, brain) → { episode, ghost }; Vitest wired.
  - packages/brain (@rivetrun/brain): server-only stub exporting createJevBrain().
  - packages/db (@rivetrun/db): Drizzle + Postgres schema for episodes and leaderboard; client is null when DATABASE_URL is unset.
  - apps/web: Next.js (App Router, latest stable), React 19, TypeScript, Tailwind, Zustand, three + @react-three/fiber + @react-three/drei.
- apps/web routes: /, /workshop, /brief/[mission], /run/[mission], /result, /leaderboard, /screen. Placeholder pages only.
- apps/web/app/api/{decide,runs,leaderboard,stats}/route.ts on the Node runtime returning 501, validating with contracts.
- apps/web/src/game/RunCanvas.tsx and WorkshopCanvas.tsx: client-only R3F canvases (dynamic import, no SSR) rendering a placeholder box robot on a flat strip, DPR capped at 1.5. Proves three.js works on mobile.
- .env.example with JEV_API_KEY and DATABASE_URL. .env* (except .env.example) gitignored. Never commit secrets.
- Root scripts: dev, build, test, lint, typecheck via turbo.
- README: dev, test, build, deploy commands you actually ran.
- Deploy apps/web to Vercel (root directory apps/web). If the Vercel CLI is not authenticated or not linked, STOP at that step and report the exact command for the human.

Done = pnpm build and pnpm test green; the Vercel preview renders Home and /run/M1 (rotating placeholder robot) at 390 px width.
Open PR, squash-merge to main.

Route to: Claude Code · Model tier: Opus · Effort: M · Touches: whole repo (scaffold)
```

---

## Prompt 2 — session: sim · branch: feat/sim

```
# RivetRun — simulation core (session: sim, branch feat/sim)

Read docs/GAME_SPEC.md and packages/contracts. Contracts are frozen: if you need a change, STOP and propose the diff.
Own: packages/sim/** (src, src/data, scripts, tests). Do not touch apps/web, packages/brain, packages/db.

Implement
- Deterministic fixed-step sim (50 ms, seeded mulberry32): traction, rolling resistance, sinkage, slope, mass, battery drain, damage sources, DNF. Exposes SimState for the renderer.
- Perception per sensor with seeded noise; `unknown` when the sensor is absent. Ground truth never leaves the sim.
- Decision-point detection, available-action filter by build, lookahead (1.5 s per action on perceived state).
- score + stars, "why" line generator from an Episode.
- Policies: heuristicBrain (best lookahead utility, weighted by the player priority), randomBrain(seed) (seeded uniform over available actions). Both implement Brain.
- runController: async loop step → decision point → await brain.decide → apply. Emits the RunEvent stream, slow-mo flag while pending, records the Episode. Browser-safe (no Node APIs).
- runHeadless(mission, seed, build, brain): no timers, runs to finish/DNF as fast as possible, returns { episode, ghost } with GhostTrace frames at 10 Hz. Must finish a 90 s mission in < 100 ms on a laptop.

Tests (Vitest)
- wheels slip on ice, tracks do not (same speed setting)
- no waterproof case + water ⇒ damage; case ⇒ none
- no IMU ⇒ no slip-triggered decisions
- same seed + same decisions ⇒ identical outcome
- runHeadless with heuristicBrain twice ⇒ identical ghost; randomBrain same seed ⇒ identical ghost
- every preset finishes M1 with heuristicBrain

scripts/balance.ts: headless run of every preset × every mission × {heuristic, random}; print finish / time / damage / score table.

Done = tests green; balance table pasted in the PR body.

Route to: Claude Code · Model tier: Opus · Effort: L · Touches: packages/sim
```

---

## Prompt 3 — session: brain · branch: feat/brain

```
# RivetRun — Jev brain + API + DB + benchmark (session: brain, branch feat/brain)

Read docs/GAME_SPEC.md, docs/JEV.md, packages/contracts. Contracts are frozen: STOP and propose a diff if needed.
Own: packages/brain/**, packages/db/**, apps/web/app/api/**, apps/web/src/brain/** (client-side brain), scripts/jev-smoke.ts. Do not touch packages/sim, apps/web/src/game, pages.

Implement
- packages/brain: server-only Jev client exactly per docs/JEV.md. Question text includes the player priority; options = available actions with their lookahead numbers; state = perceived fields only. Pin the model id. Measure latency.
- POST /api/decide: validate BrainQuestion (Zod) → Jev → BrainDecision (policy 'jev'). In-memory cache by hash of rounded state. Upstream timeout 1200 ms → 504. Simple per-IP token-bucket rate limit.
- apps/web/src/brain/clientBrain.ts implements Brain in the browser: POST /api/decide with AbortController at 1200 ms; on any failure delegate to heuristicBrain from @rivetrun/sim and return policy 'heuristic', fallback true.
- packages/db: Drizzle migrations for episodes + leaderboard. POST /api/runs (validate Episode, store), GET /api/leaderboard?mission=M5 (top 20, best per nickname), GET /api/stats (episode count). All degrade gracefully when DATABASE_URL is unset.
- JEV_API_KEY is never sent to the client and never logged.
- scripts/jev-smoke.ts: 3 real questions, print probabilities + latency.
- packages/brain/scripts/benchmark.ts per the spec's Benchmark section, using runHeadless from @rivetrun/sim with a server-side Jev brain. Flags: --seeds N --missions M1,M2. Writes docs/BENCHMARK.md. Tonight validate with --seeds 2 --missions M1 only.

Done = jev-smoke prints real results; route handlers covered by Vitest with Jev mocked; benchmark runs at --seeds 2; Vercel preview works.

Route to: Claude Code · Model tier: Sonnet · Effort: M · Touches: packages/brain, packages/db, apps/web/app/api, apps/web/src/brain
```

---

## Prompt 4 — session: render · branch: feat/render

```
# RivetRun — 3D run view, ghosts, workshop model, Brain HUD (session: render, branch feat/render)

Read docs/GAME_SPEC.md and packages/contracts. Contracts are frozen.
Own: apps/web/src/game/**. Consume only SimState, GhostTrace and the RunEvent stream. Until feat/sim merges, drive it with apps/web/src/game/fakeRun.ts (scripted events + two fake GhostTraces).

Implement (React Three Fiber + drei, portrait 390×844 first, DPR ≤1.5, one shadow light max)
- RobotModel(build): procedural low-poly robot from primitives — PCB-green board, black servo blocks, orange 3D-printed brackets; wheels vs off-road wheels vs tracks clearly different; sensors, winch, case, bumper visible. Wheels spin with SimState.
- RunScene: 2.5D side view. Terrain strip extruded from segments with distinct materials (asphalt, grass, sand, mud gloss, ice sheen, water surface, rocks). Slopes. Camera follows the Jev robot smoothly.
- Ghosts: two translucent, desaturated RobotModels on parallel lanes, labelled HEURISTIC and RANDOM, interpolated from GhostTrace frames by sim time.
- Juice with instanced particles: dust on sand, splash on water, sparks on impact, slip wobble on ice, smoke as damage rises (Jev robot only).
- Personality: LED-eye face reacting to the last decision (squint on brake, wide on accelerate, X eyes on DNF), wobble on slip, parts fly off and bounce on DNF.
- WorkshopScene: robot on a workbench, slow turntable, blueprint-grid floor; exports a hook to highlight a slot.
- Brain HUD (DOM overlay): perceived state summary (unknown shown as "?"), option bars with %, chosen action highlighted, JEV or FALLBACK, latency ms. Slow-mo vignette while a decision is pending. Top bar: time, battery, damage.
- No page scroll. 60 fps target on a mid-range phone.

Done = /run/M1 plays the fake run with both ghosts end to end at 390 px; WorkshopScene swaps parts live; screenshots in the PR.

Route to: Claude Code · Model tier: Opus · Effort: L · Touches: apps/web/src/game
```

---

## Prompt 5 — session: ui · branch: feat/ui

```
# RivetRun — screens + progression (session: ui, branch feat/ui)

Read docs/GAME_SPEC.md and packages/contracts. Contracts are frozen.
Own: apps/web/app/** pages and layouts (not app/api), apps/web/src/ui/**, global styles, Zustand stores in apps/web/src/state/**. Mount 3D only through the components exported from apps/web/src/game. Do not touch packages/*, app/api.

Implement
- Home, Workshop, Brief, Result, Leaderboard, /screen exactly as in the spec's "Screens" section.
- Workshop: slot picker around the WorkshopCanvas, presets, budget/mass bars, stat bars, locked parts with point cost.
- Result: score breakdown, stars, Brain Duel table (Jev / Heuristic / Random from the Episode outcome + the two GhostTrace outcomes; stubbed until integration), "why" line, Retry / Upgrade / Submit (nickname) / Share (Web Share API, fallback copy) / Download episode (JSON).
- /screen: auto-refresh every 5 s, QR to the site URL generated client-side.
- Progression (points, unlocked parts) in localStorage, wrapped in try/catch; the game works without it.
- First-time path: Home → Play → M1 with the All-rounder preset, zero choices before the first run.
- Visual direction from the spec: maker workshop, dark slate, safety orange, blueprint grid, buttons ≥48 px, portrait. Page title "RivetRun".

Done = the full 60-second path works at 390 px with a stubbed run; Playwright mobile test covers it.

Route to: Claude Code · Model tier: Sonnet · Effort: M · Touches: apps/web/app (pages), apps/web/src/ui, apps/web/src/state
```

---

## Tonight milestone
- ~22:15 session: integrate-m1 wires sim + render + ui for M1 with heuristicBrain (Jev if brain merged). Deployed URL plays M1 end to end on a phone before 23:00. If it slips, it is the first job on Saturday.

## Saturday (prompts written in the morning against what merged)
- 08:00 integration (remaining): merge sim → brain → render → ui; on run start call runHeadless for heuristic + random and pass ghosts to RunCanvas; wire runController + clientBrain.
- balance: agent runs packages/sim/scripts/balance.ts in a loop and tunes src/data until each mission has a clear "right build".
- benchmark: full run of packages/brain/scripts/benchmark.ts → docs/BENCHMARK.md.
- qa: Playwright on mobile viewports, slow network, Jev down (fallback path).
- 14:00 feature freeze.
