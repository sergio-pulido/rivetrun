# RivetRun — setup and how it was built

Snapshot: `main` at `7aa92cb`, Saturday 10 October 2026, 05:22, 292 commits (git log). The overnight program was still running and five sessions were committing while this was written, so later commits are not covered. Each number is quoted from the file named in parentheses. "Not verified" means no session and no person has checked it.

## 1. What RivetRun is

Build a small robot from real maker parts, then drive it, or let a decision model called Jev drive it, along rail missions with simplified physics, weather and sensors. The overnight program names four things it is meant to be (docs/OVERNIGHT.md):

| Meant to be | What exists at the snapshot | Route |
|---|---|---|
| A maker vehicle lab | 22 parts in five slots, four presets, three dials (battery cells, wheel size, gearing) and a €250 default budget (packages/sim/src/data). Part sheets show the real component behind each game part, and "Build it for real" lists a bill of materials with a "My parts" inventory (docs/MK2_BOM.md). | `/workshop`, `/workshop/part/<id>`, `/workshop/assembly`, `/workshop/real` |
| A vehicle simulator | A deterministic one-dimensional simulation in 50 ms steps over nine missions, M1 to M9, in which parts, ground, weather and sensors change the outcome (docs/SIM_MODEL.md). | `/brief/Mx` → `/run/Mx` → `/result` |
| A brain arena | The same robot, seed, sensors and question put to Jev, nine LLMs, a rule-based driver and a random driver, offline. Results are a table and a latency-against-score plot (docs/ARENA.md). | `/lab` |
| A game | Drive with analog throttle and brake against a Jev ghost, or watch Jev drive with each decision on the HUD. In a Room Race, phones join by QR code and a big screen shows the lanes. | `/`, `/run/Mx`, `/leaderboard`, `/screen` + `/race` |

Lab Missions are a second simulation: five top-down grid scenarios (maze, warehouse, Mars sample return, house inspection, capture the flag) with the same parts, sensors and battery, at `/scenarios`. The UI labels it a grid simulation. It is linked from `/lab` only, not from Home.

## 2. Run it

Prerequisites: Node >= 20 and pnpm 10 (`engines` and `packageManager` in package.json). The tunnel needs `cloudflared`. The commands were checked against package.json and scripts/; the author of this file did not execute them.

```sh
pnpm install
pnpm dev                       # next dev through Turborepo, http://localhost:3000
pnpm typecheck && pnpm test    # tsc --noEmit and vitest in every package

# Stable demo: build and serve the last commit that passed the gate, on port 3001
pnpm demo:stable -- --ref "$(git tag -l 'demo-good-*' | sort | tail -1)"

pnpm tunnel                    # Cloudflare quick tunnel to :3001
```

- `pnpm demo:stable` (scripts/demo-stable.mjs) checks the ref out in a separate git worktree, `../rivetrun-demo`, so nothing uncommitted in the working checkout reaches the demo. It copies `apps/web/.env.local` there if the file exists, installs with the frozen lockfile, builds into a candidate directory that replaces the live one only when the build succeeds, and serves on `0.0.0.0:3001` (`DEMO_PORT` overrides). Without `--ref` it builds `main`. `--build-only` builds and stops. `--tunnel` opens the tunnel first and bakes its URL into the build. `/api/version` and the `/screen` footer show the built commit and ref.
- `pnpm tunnel` (scripts/tunnel.mjs) exposes port 3001 (`PORT=3000 pnpm tunnel` for the dev server) and writes the public URL to `apps/web/.site-url`, which the QR codes read.
- `pnpm demo` builds and serves the current checkout, uncommitted edits included, on :3001.
- Serving a tag has not been done by any session: brain tested `--ref <sha> --build-only`, and the gate runs `--build-only` on `main` hourly (docs/OVERNIGHT_LOG.md).

Environment variables (names only; values belong in `apps/web/.env.local`, which is not tracked):

| Variable | Read by | Without it |
|---|---|---|
| `JEV_API_KEY` | The server only: `packages/brain` behind `/api/decide` and `/api/ghost`. | The rule-based driver decides, the HUD shows FALLBACK and the Result counts the decisions made by fallback (scripts/qa.sh, scripts/demo-stable.mjs). The gate tests this path by forcing Jev to fail; a run with no key at all is not recorded as tested. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | The arena scripts only: `pnpm --filter @rivetrun/brain arena` and `arena:lab`. | That provider's contestants are skipped and shown as "not configured" (docs/BRAIN_ARENA.md). The app does not need them: `/lab` reads docs/arena-results.json. |

## 3. Repository map

A pnpm and Turborepo monorepo. Packages export TypeScript source and `apps/web` compiles them, so there is no package build step. Owners are from docs/FAST_MODE.md and docs/OVERNIGHT.md.

| Path | What | Owner |
|---|---|---|
| `packages/contracts` | Zod schemas and inferred types shared by every package. Changes are additive, one line each in docs/CHANGES.md. | scaffold, then mostly sim |
| `packages/sim` | The rail simulation: physics, perception, triggers, weather, missions, parts, the rule-based and random drivers, build assessment, fuzz and leak tests. | sim |
| `packages/brain` | Jev client and question builder, tuning, benchmark, arena runner and provider adapters. | brain |
| `packages/lab` | The grid simulation and five scenarios for Lab Missions. | lab |
| `packages/db` | Drizzle and Neon schema from the scaffold. Not imported by the app. | nobody |
| `apps/web/app/api` | Route handlers (decide, ghost, runs, leaderboard, stats, version, race with a Server-Sent Events stream) and the in-memory stores. | brain |
| `apps/web/app/screen`, `race`, `leaderboard` | Big screen, Room Race phones, leaderboard. | brain |
| `apps/web/app/run`, `apps/web/src/state/run.ts` | The run page and its wiring to the sim. | sim |
| `apps/web/src/game` | 3D scenes (three.js through React Three Fiber), robot, HUD, controls, sound, weather visuals, attract mode, telemetry drawer. | game |
| `apps/web/app` (Home, `workshop`, `brief`, `result`, `lab`), `apps/web/src/ui`, `apps/web/src/state` | Screens, Workshop, part sheets, Brief, Result, `/lab`, inventory. | ui |
| `apps/web/app/scenarios`, `apps/web/src/lab` | Lab Missions screens. | lab |
| `apps/web/public/models`, `apps/web/public/renders`, `assets/` | 3D models, renders, Blender sources, print files. | asset agent |
| `e2e/`, `scripts/qa.sh`, docs/OVERNIGHT.md, docs/OVERNIGHT_LOG.md, docs/QA.md | Gate, smoke test, program, log, findings. | master |
| `scripts/` | `balance.ts` (balance table), `strangers.ts` (two scripted first-time players), `soak.ts` (fuzz on many seeds), `race-load.mjs` (Room Race load), `jev-smoke.ts` (three real Jev calls), `demo-stable.mjs`, `tunnel.mjs`. | sim and brain |

## 4. How it was built

One person coordinated several Claude Code sessions in one repository (docs/inputs/SETUP-draft.md). Jev is not a coding agent here: it is the model that picks the robot's commands inside the game.

### Sessions and roles

| Session | Role | Commits by subject marker (git log) |
|---|---|---|
| sim | Simulation, data, balance, missions, rule-based driver. | 32 with an `OVN-SIM` id |
| brain | Jev client and API, tuning, benchmark, arena, Room Race, big screen. | 18 with an `OVN-BRAIN` or `QA-T` id |
| game | 3D scenes, robot, HUD, controls, sound, weather visuals, attract mode. | 44 |
| ui | Screens, Workshop, Brief, Result, `/lab`, part sheets, inventory. | 65 |
| lab (from Sat 03:45) | Lab Missions grid simulation and `/scenarios`. | 7 |
| master (from Sat 03:45) | Orchestration and QA. Writes no feature code. | 18 |
| asset agent (ChatGPT with Blender) | Models, renders and print files. The sessions cannot reach it; the human relays. | 14 with scope `mk2`, `parts`, `assets` or `lab` |

The other 94 commits cannot be attributed from the subject: 19 are `docs:` commits and 75 carry no session marker, most of them sim and brain commits from before the overnight prefix convention. Sim and brain are therefore undercounted above. Token counts per session were not recorded (docs/tokens.json does not exist).

### Models and tools

- Claude Code for all implementation. The draft names Claude Opus 5.5 for the four original sessions (docs/inputs/SETUP-draft.md), and 187 of the 292 commits carry a `Co-Authored-By: Claude Opus 5.5` trailer (git log). The master, lab and overnight brain commits carry no trailer and no file states their model: not verified.
- A planning chat wrote the spec and the kickoff prompts; Claude Design produced the mockups in docs/design/v1; ChatGPT supplied terrain and part reference data and the sound module in docs/inputs (docs/inputs/SETUP-draft.md).
- Jev, pinned to `jev-1.13.0`, called through the TypeSafe `systemone` endpoint with one Choice question per decision and a 1200 ms budget (docs/JEV.md).
- Blender for the MK-II rover: 21 GLB files validated, the assembled rover at 37,016 triangles (docs/PROJECT_STATE.md). That is asset validation, not a frame-rate or integration test.
- Playwright (`playwright-core` 1.58.2, headless Chromium with software WebGL) for the gate (e2e/package.json).
- Next.js 16, React 19, Tailwind 4, three.js with React Three Fiber, Zustand, Zod 4, Vitest, Turborepo (apps/web/package.json).

### Arena contestants

Model ids as recorded in docs/arena-results.json; each id was checked against its provider's models endpoint before its row ran (docs/ARENA.md).

| Tier | Contestant | Provider model id | Runs | Gameplay version | Finish | Mean score | Latency p50 ms |
|---|---|---|---|---|---|---|---|
| fast | Jev | `jev-1.13.0` | 30 | 4 | 80 % | 546 | 250 |
| fast | GPT-5 nano | `gpt-5-nano` | 30 | 4 | 77 % | 427 | 715 |
| fast | GPT-6 Luna | `gpt-6-luna` | 30 | 4 | 80 % | 496 | 853 |
| fast | DeepSeek Flash | `deepseek-flash` | 30 | 4 | 80 % | 476 | 817 |
| fast | Claude Haiku 5.5 | `claude-haiku-5-5` | 24 | 3 | 75 % | 481 | 890 |
| mid | GPT-5.6 Luna | `gpt-5.6-luna` | 30 | 4 | 80 % | 491 | 844 |
| mid | Claude Sonnet 5.5 | `claude-sonnet-5-5` | 24 | 3 | 71 % | 425 | 1138 |
| reasoning | GPT-6.1 Sol | `gpt-6.1-sol` | 9 | 4 | 78 % | 473 | 1169 |
| reasoning | DeepSeek V4 Pro | `deepseek-v4-pro` | 9 | 4 | 33 % | 228 | 5197 |
| reasoning | Claude Opus 5.5 | `claude-opus-5-5` | 7 | 3 | 71 % | 480 | 1682 |
| baseline | Heuristic (the rule-based driver) | — | 30 | 4 | 80 % | 554 | 0 |
| baseline | Random | — | 30 | 4 | 0 % | 41 | 0 |

Other measurements of Jev against the rule-based driver:

- Benchmark, 810 headless runs (M1–M9 × 5 builds × 3 seeds × 6 rows): Jev finishes 62 % with a mean score of 433, the heuristic 63 % and 441, random 10 % and 93. Jev answered 10096 of 10101 questions within 1200 ms, p50 243 ms and p95 302 ms (docs/BENCHMARK.md).
- By mission on the default build, 3 seeds, mean score Jev / heuristic: M1 843 / 847, M2 780 / 780, M3 611 / 650, M4 728 / 751, M5 640 / 665, M8 663 / 684, M9 584 / 601. With a build that fits: M6 with the Deep Diver 500 / 418, M7 with the piston 765 / 775 (docs/CHANGES.md).
- Lab Missions, 90 runs: heuristic 702, Jev 694, DeepSeek Flash 510, GPT-6 Luna 482, GPT-5 nano 437, random 259 (docs/ARENA_LAB.md).

Jev does not beat the rule-based driver overall. It is close to it, well ahead of random, and answers in about a third of the fast LLMs' median time. Read section 6 before quoting any of these.

### Coordination

1. The first plan was a scaffold session followed by four sessions, each in its own worktree and branch (docs/prompts/kickoff-v3.md). The scaffold merged as pull request 1 on Friday at 20:40. At 21:00 FAST MODE replaced the rest of that plan: every session on `main` in one shared checkout, no branches, no pull requests, no required gates (docs/FAST_MODE.md).
2. Ownership by path. A session never edits another owner's paths; it asks the owner. Because the git index is shared, every commit names its paths: `git add <paths> && git commit -m "…" -- <paths>`, never `git add -A`.
3. `packages/contracts` changes only by addition, with one line per change in docs/CHANGES.md, so the other sessions keep compiling.
4. One dev server on :3000, run by the human. Each session that used a browser tested on its own origin, so that browser storage stayed separate.
5. From Saturday 03:45, the overnight Protocol (docs/OVERNIGHT.md). A worker pulls, reads its orders, implements, runs unit tests and `tsc` for its paths, checks its screens headless at 390×844, commits as `[OVN-<id>]`, pushes, and reports `done OVN-<id> <hash> · verified: <what> · not verified: <what>`. The master session, every 20 to 30 minutes, pulls, runs the gate, tags on green or sends the failing check to its owner, compares screenshots with each item's acceptance line, files findings in docs/QA.md with an owner, and refills the queues.
6. At 04:11 the app capped messages between sessions at 10 per message the human types. The master session did not route around the cap: orders moved into the "Orders from [MASTER]" section of docs/OVERNIGHT.md, which every worker reads on each pull. The cost: a file cannot wake an idle session, and brain sat idle from 04:12 until its next incoming message (docs/OVERNIGHT_LOG.md).
7. Guardrails: no force push, history rewrite, stash or destructive command; no changes to secrets or `.env` files; keys never printed or logged; the human owns :3001 and the tunnel; a large new feature lands behind a flag or on its own route until the gate has seen it green.

What went wrong in the process: about 25 minutes were lost on Friday because the spec had not reached the repository (docs/inputs/SETUP-draft.md); the first weather commits turned committed `main` red in other owners' paths, and one stale test held back the first tag for 15 minutes (Q1 to Q4 in docs/QA.md); the provider account for the Claude arena rows ran out of credit at about 04:20 (docs/OVERNIGHT_LOG.md).

## 5. Quality gate

`scripts/qa.sh` gates one commit, by default the committed HEAD. Steps, in order:

1. Worktree: the commit is checked out, detached, in `../rivetrun-qa`. Nothing uncommitted in the shared checkout can help it pass.
2. Install: `pnpm install --frozen-lockfile --prefer-offline`.
3. Typecheck: `next typegen`, then `turbo run typecheck --continue`. It is a separate step because `next build` ignores type errors here (`ignoreBuildErrors` in apps/web/next.config.ts).
4. Unit tests: `turbo run test --continue` (57 test files at the snapshot).
5. Determinism: `scripts/balance.ts --seeds 2` twice; the two tables must be byte-identical.
6. Balance: every mission is finished by at least one core build within budget, and the default build finishes M1.
7. Build: `next build` of that commit.
8. End-to-end smoke: `e2e/smoke.mjs` against that build, served by `next start` on 127.0.0.1:3100 only while the smoke runs. One retry after 20 s.
9. With `--demo-build`, hourly: `pnpm demo:stable -- --build-only`, skipped while anything serves on :3001.
10. With `--tag`: if every step passed, none was skipped and the commit is on `origin/main`, an annotated tag `demo-good-<HHMM>` is created and pushed. The annotation says what was checked.

The smoke runs in headless Chromium with software WebGL and keyboard input (docs/QA.md). At 390×844: Home, Workshop, Brief M1, the first-run coach marks, a Drive run on M1 with the scan to the Result, the personal-best card; Jev driving M1 from Play Now to the Result; M5 at full throttle doing only what the stuck prompt says; `/lab` and its Lab Missions tab; the Maze in `/scenarios` to "Scenario complete"; every mission's Brief; every mission's run scene for 7 s with Jev driving; Jev forced to fail, with FALLBACK on the HUD and a finished run. At 1280×720: `/screen`, then a Room Race on M1 with two JEV bots to the finish.

| A `demo-good-*` tag certifies | It does not certify |
|---|---|
| The commit installs from the lockfile, every package typechecks and every unit test passes with nothing uncommitted helping. | Frame rate, touch, sound, or anything on a real phone: rendering is in software at a few frames per second. |
| Two runs of the balance table are byte-identical. | The MK-II kit: it does not load in headless Chromium, so every screenshot shows the procedural robot. |
| Every mission can be finished by at least one core build within budget, and the default build finishes M1. | A Room Race with people: bots only, no phone joined, and only M1 is raced. |
| `next build` succeeds. | Dev-only paths (`window.__rivetrun`, `?weather=`), which are not in the build under test. |
| The smoke path above completes on a production build of that commit. | Lab Missions other than the Maze. |

Tags so far (git tag, docs/OVERNIGHT_LOG.md):

| Tag | Commit | New in the tag or in the gate |
|---|---|---|
| `demo-good-0426` | `b5cda43` | First green: Drive run on M1 with the scan, all nine Briefs and run scenes, Room Race with two bots, `/lab`. |
| `demo-good-0432` | `ee76275` | v3 coach marks, Result breakdown, one air rule for brains and players, `packages/lab` without a screen. |
| `demo-good-0438` | `f8b94fc` | Jev drives M1 in the smoke; that run showed Jev skipping the M1 scan zone (Q13). |
| `demo-good-0452` | `537c721` | Jev scans on M1 (26.9 s, was 33.4 s); stuck prompt on M5; arena Lab track. |
| `demo-good-0500` | `5bf1572` | `/scenarios` on screen, the Maze played in the smoke; race ranking includes missed scans. |
| `demo-good-0509` | `f1a6a8c` | Jev forced to fail in the smoke: FALLBACK shown, run finished. Hourly demo build passed. |
| `demo-good-0522` | `c377462` | No log entry yet. Commits since the previous tag: `/scenarios` on a wide screen with a map legend and the simplifications on every brief; no false stuck alarm (Q16); arena results re-run on gameplay version 4. |

## 6. What is implemented and what is simplified

"Where the UI says so" refers to `SIMPLIFICATIONS` in packages/sim/src/simplifications.ts: 21 sentences, each assigned to a screen.

| Area | Implemented | Simplified or assumed (and where the UI says so) |
|---|---|---|
| Physics | One-dimensional track, 50 ms steps, the same seed and commands give the same run. Traction limit (friction × weight; spinning wheels keep 70 %), grip-limited braking, soft-ground drag, slopes, solid obstacles with a safe contact speed and damage growing with the square of the excess, flooding, ballistic flight, falls (docs/SIM_MODEL.md). Fuzz: 10 000 runs on 20 seeds, 0 violations (docs/CHANGES.md). | No steering and no side slip. Formulas, not a rigid-body engine. Stated in docs/SIM_MODEL.md; there is no entry for it in `SIMPLIFICATIONS`, so no screen is known to say it. |
| Weather | Rain (grip ×0.8, camera range ×0.6), wind as drag with seeded gusts, cold (1 % of usable battery per °C below 20 °C), fog, night and snowfall; missions M8 Storm Ridge and M9 Polar Night; weather visuals and a HUD chip. | Range factors are chosen for the game, not measured. Wind acts along the track only, on an estimated 0.04 m². Cold is a rule of thumb, snow is one surface, the M8 puddle is 4 cm of water. Shown on the Brief weather card and the part sheet. |
| Sensing and triggers | A brain gets an Observation built only from the sensors fitted, with seeded noise; a missing sensor reads `unknown`. Decisions are requested when something changes, never on a clock, and a slow answer costs sim time. Jev has 1200 ms before the rule-based driver decides, marked FALLBACK. A leak test (8 sensor sets × 7 pairs of tracks) landed at `04f0e02`; it found and fixed one leak, a legacy field whose presence revealed a gap beyond sensor range and which the Jev question text did not use (docs/CHANGES.md). A second test for the question text and the arena prompt landed at `7aa92cb`. | Sensors never fail. The core kit assumes wheel encoders and a power sensor (Workshop senses). The NoIR camera's 6 m is the game camera's range with IR lamps assumed, and headlights from the light sensor are a game rule (part sheet). Both leak tests are later than the last tag. |
| Energy | Draw follows the command and the load. Per metre, steady throttle costs about 70 % of full and ease about 57 %. Capacity comes from the battery and the cell count; an empty battery ends the run. Tuned so that a heavy build on the small battery runs out at 90 % of M5 and M6 at full throttle (docs/CHANGES.md). | Game stats for mass, cost and power are tuned for play and are not the real parts' specs (docs/MK2_BOM.md). There is no cell model. |
| Air control | Ramps, drops and the piston launch the robot. The body levels itself at 60°/s for every driver; a player's brake or extra throttle changes the pitch; landings are graded clean, hard or crash. Holding the jump for 0.3 to 1 s gives 40 to 100 % of the push. | Self-levelling and the charge curve are game rules (Drive coach marks). A crash landing was never produced in a browser, and the air chip was seen as DOM text, not pixels (docs/OVERNIGHT.md, the Board). |
| Scan zones | Stop under 0.1 m/s for 1.5 s with a sensor the zone accepts. A miss adds 10 s; a centred stop adds 15 points. Zones on M1 (1), M3 (2), M7 (3), M8 and M9 (1 each). | "A camera scan in the dark needs a NoIR camera or headlights" is a game rule (Brief objectives). |
| Room Race | Rooms in server memory. Phones receive state over Server-Sent Events with a polling fallback and post 5 times a second. The host opens 4, 6 or 8 human seats and up to 2 JEV bots. The server stamps finish times and closes the race 45 s after the leader; ranking includes 10 s per missed scan (apps/web/app/race/_lib/protocol.ts). Load: 8 scripted bots, 0 dropped, 109 ms p95 end to end, on the dev server (docs/OVERNIGHT_LOG.md). | The server does not validate the progress a phone posts (comment in scripts/race-load.mjs). Tested with bots only. A phone that drops off and rejoins (OVN-BRAIN-8) is queued, not done. |
| Lab Missions | `packages/lab`: a deterministic grid simulation with fog of war from the build's sensors and decisions on events; five scenarios with objectives and scores; `/scenarios` with an arrow pad, objective tracker, decision thread and result. | A separate grid simulation that does not use the rail physics: nine `lab_*` sentences, shown on every scenario brief. At the snapshot commit, Jev's seat on the page is filled by the lab's own heuristic answering in 400 ms, and the page says so (apps/web/src/lab/labBrain.ts). The server route for live Jev, `POST /api/lab/decide`, landed at `7aa92cb`; the page side (OVN-LAB-7) was being edited, uncommitted. |
| Arena | One shared question, provider adapters, latency applied in sim time, no fallback for anyone, a 10 s deadline. Rail track 283 runs, Lab track 90 runs. `/lab` shows the table, the plot and each row's gameplay version. Spend about US$3.79 under a US$10 cap when last reported (docs/OVERNIGHT.md). | Samples are small: 30 runs per fast, mid and baseline row (3 seeds), 9 runs on 1 seed for the reasoning rows. The three Claude rows (24, 24 and 7 runs) are carried over from gameplay version 3 with an older prompt, because the provider account had no credit when the arena was re-run; they are marked and not comparable. Rows ran on different sim commits. In places the question states which option the rules consider correct (Q20, open, section 7). `/lab` carries the line "Our sim, our prompts, N runs, date. Not a general model ranking." |
| Parts and bill of materials | Game parts mapped to real components with official links checked on 2026-10-10; part sheets, "Build it for real", inventory, printed parts (docs/MK2_BOM.md). | "Designed, not yet built or test-printed." The thruster and the jump piston are marked experimental. Renders the manifest marks approximate are captioned "Illustrative render, dimensions not published". |
| Persistence | Runs, leaderboard, Jev answer cache, ghosts and race rooms live in the Next server's memory and are lost on restart (apps/web/app/api/_lib). Builds, progress, inventory and personal bests live in the browser's storage, per device. | No database is in use: `packages/db` is not imported by the app. |
| Security | The Jev key stays on the server. | None otherwise: no accounts, no rate limiting, no hardening. A local proof of concept (docs/FAST_MODE.md). |

## 7. Known gaps and what was never tested

Never tested by anyone (docs/QA.md, docs/OVERNIGHT_LOG.md):

- A real phone. No session has one; nothing in docs/QA.md was run on a real phone.
- Touch input. The gate drives with the keyboard.
- Frame rate. Not measured. The only figure is a proxy: 130–141 draw calls per frame at low quality and 163–173 at high. Headless Chromium renders at 0–3 frames per second.
- Sound. Nobody has heard it: headless has no audio. Since `3432d00` a unit test renders every effect offline and checks that it is not silent, does not clip and lasts under 2 s.
- The MK-II kit on a real GPU. It sits behind `?robot=mk2` with a procedural fallback and times out in headless Chromium, so no session has seen it.
- Serving a tag with `pnpm demo:stable -- --ref <tag>`. Only `--build-only` runs were made.
- More than one human in a race, and any phone joining a room.
- The first drawn frame of the run page on a phone. Transfer was measured once on a 9 Mbps / 170 ms link (749 kB, all code by 1.5 s); the 3D start-up that follows takes 5–6 s under software rendering and is unknown on a phone's GPU.
- Share and Episode download on the Result (OVN-UI-8 queued). Lab Missions other than the Maze, by the gate.
- `pnpm lint` is not part of the gate: not verified.

Findings open or not retested in docs/QA.md at the snapshot:

| # | Status | What |
|---|---|---|
| Q20 | open (honesty) | The questions sent to every brain state the answer in places. The Lab question appends a verdict to each option; the rail question says `scan` is the correct option on a zone and that slowing down is correct before one. The verdicts come from the same rules the heuristic uses, so "Jev 694 against heuristic 702" on Lab Missions and Jev scanning on M1 measure whether a model follows a stated verdict in time, not whether it can judge. On facts alone, before that change, Jev scored 294 on Warehouse and 321 on Mars. Nothing on `/lab` says so yet. |
| Q17 | open | Starting a Drive run a second after the Brief opens gives a heuristic rival, not Jev, because the Jev ghost is not ready, and the Brief does not say so. A warm-up of the ghost and a readiness status landed on the server at `47a1147`; the Brief side is not committed. |
| Q9 | reported fixed in part | On M8 and M9 at 390×844 the chips cover the START sign for the first second. A further fix landed at `7e7f875`, not retested. |
| Q14, Q15, Q19 | reported fixed, not retested | Alerts on race phones; no stuck clock before the first touch; Warehouse scoring that let a random driver win. |
| R12 | open, needs a human look | The 3D bench on Home and in the Workshop may stay on its placeholder after a hard load. |
| R18 | open in docs/QA.md | Phones on the LAN against the dev server. The file says the laptop's address is missing from `allowedDevOrigins`; apps/web/next.config.ts lists it. Not confirmed on a phone. |
| R6 | reported fixed, not retested | The Careful briefing now changes Jev's choices; with it Jev scores 290 on M6 with the Deep Diver against 498 without a briefing (docs/BENCHMARK.md). |

Also open for the human (docs/OVERNIGHT_LOG.md): asset files under `apps/web/public/models`, `apps/web/public/renders` and `assets/` are uncommitted and in no tag, so a demo built from a tag ships the older models; the Claude arena rows cannot be re-run until the provider account has credit; a first-timer who only holds the throttle finishes M1, M2, M4 and M9 and gets stuck in mud on M3, M5 (the mission named Room Challenge) and M8. Since `demo-good-0452` a prompt tells a stuck player the way out, and the gate plays M5 that way, with the keyboard.

## 8. Timeline

Times are commit times (git log). The hackathon opened on Friday at 18:30 (docs/inputs/SETUP-draft.md); the first commit is at 20:18.

| Phase | Window | What landed |
|---|---|---|
| Spec and scaffold | Fri 20:18–21:00 | Game spec v3 and kickoff prompts; monorepo scaffold and contracts; Jev client and `/api/decide`; sim core; FAST MODE adopted. |
| First playable | Fri 21:00–22:00 | Run page wired end to end (21:02); 2.5D scene and HUD; Home, Workshop, Brief, Result; tuned Jev question and first benchmark; briefings; Room Race over Server-Sent Events (21:25); scout drone; sound; `pnpm demo` and the tunnel; M6 Deep Water. |
| Gameplay v2 | Fri 22:00–23:30 | Attract replay; benchmark with briefings; Drive mode, ramps, gaps and the three dials; Room Race with server-stamped results; `pnpm demo:stable`; the Jev ghost from `/api/ghost`. |
| QA and real parts | Sat 00:00–03:00 | Race fixes; first QA log (00:59); black scene on cold load fixed (01:41); seat cap; MK-II adapter behind a flag; bill of materials (02:04); real parts on part sheets and "Build it for real"; build assessment and solid obstacles (02:40); lidar, ToF ranger and brushless motor. |
| Brain v3, gameplay v3, arena | Sat 03:00–03:45 | Both specs (03:09); Observation and triggers (03:20); telemetry console and reaction duel; analog controls, wheelspin and scan zones (03:29); first arena results (03:30). |
| Overnight program | Sat 03:45–05:22 (snapshot) | Master session and the gate (04:00); weather, M8 and M9; air control and the charged jump; `packages/lab` and five Lab Missions; `/scenarios` (04:46); stuck prompt; Jev fault switch (04:58); seven `demo-good` tags from 04:26 to 05:22; arena re-run on gameplay version 4 (05:12); leak tests (05:18, 05:22); a live Jev route for Lab Missions (05:22). |
| Planned, not done at the snapshot | Sat 05:22 onward | The program runs to 10:00. Feature freeze 14:00, rehearsal 15:30, code freeze 16:00, demos 16:15 (docs/DEMO_PLAN.md). |

Commits per hour: Fri 20h 4 · 21h 34 · 22h 21 · 23h 14 · Sat 00h 14 · 01h 11 · 02h 27 · 03h 56 · 04h 91 · 05h 20 (to 05:22).
