# RivetRun — setup and how it was built

Snapshot: `main` at `1cd92fe`, Saturday 10 October 2026, 08:21, 374 commits and 16 `demo-good-*` tags (git log, git tag). A seventeenth tag, `demo-good-0928`, was cut at 09:28 on `4a8d9e1`, which adds only documentation to this snapshot. Each number is quoted from the file named in parentheses. "Not verified" means no session and no person has checked it.

## 1. What RivetRun is

Build a small robot from real maker parts, then drive it, or let a decision model called Jev drive it, along rail missions with simplified physics, weather and sensors. The overnight program names four things it is meant to be (docs/OVERNIGHT.md):

| Meant to be | What exists at the snapshot | Route |
|---|---|---|
| A maker vehicle lab | 22 parts in five slots, four presets, three dials (battery cells, wheel size, gearing) and a €250 default budget (packages/sim/src/data). Part sheets show the real component behind each game part, and "Build it for real" lists a bill of materials with a "My parts" inventory (docs/MK2_BOM.md). | `/workshop`, `/workshop/part/<id>`, `/workshop/assembly`, `/workshop/real` |
| A vehicle simulator | A deterministic one-dimensional simulation in 50 ms steps over nine missions, M1 to M9, in which parts, ground, weather and sensors change the outcome (docs/SIM_MODEL.md). | `/brief/Mx` → `/run/Mx` → `/result` |
| A brain arena | The same robot, seed, sensors and question put to Jev, nine LLMs, a rule-based driver and a random driver, offline, with two score columns (docs/ARENA.md). Verified human runs are listed beside the brains. A live race puts one bot per brain on the big screen. | `/lab`, `/screen?room=CODE&arena=1` |
| A game | Drive with analog throttle and brake against a Jev ghost, or watch Jev drive with each decision on the HUD. In a Room Race, phones join by QR code and a big screen shows the lanes. | `/`, `/run/Mx`, `/leaderboard`, `/screen` + `/race` |

Lab Missions are a second simulation: five top-down grid scenarios (maze, warehouse, Mars sample return, house inspection, capture the flag) with the same parts, sensors and battery, at `/scenarios`. Jev drives there live, with the fixed rules as fallback. The UI labels it a grid simulation. It is linked from `/lab` only, not from Home.

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

- For the venue, read docs/DEMO_RUNBOOK.md: the commands in order (it adds `--tunnel` to the stable-demo command), four ten-second health checks, and what to do when Jev is slow, the tunnel drops, a room is stuck or the laptop's address changes. Nobody has walked through it on a served build (docs/OVERNIGHT_LOG.md).
- `pnpm demo:stable` (scripts/demo-stable.mjs) checks the ref out in a separate git worktree, `../rivetrun-demo`, so nothing uncommitted in the working checkout reaches the demo. It copies `apps/web/.env.local` there if the file exists, installs with the frozen lockfile, builds into a candidate directory that replaces the live one only when the build succeeds, and serves on `0.0.0.0:3001` (`DEMO_PORT` overrides). Without `--ref` it builds `main`. `--build-only` builds and stops. `--tunnel` opens the tunnel first and bakes its URL into the build. `/api/version` and the `/screen` footer show the built commit and ref.
- `pnpm tunnel` (scripts/tunnel.mjs) exposes port 3001 (`PORT=3000 pnpm tunnel` for the dev server) and writes the public URL to `apps/web/.site-url`, which the QR codes read.
- `pnpm demo` builds and serves the current checkout, uncommitted edits included, on :3001.
- Serving a tag has not been done by any session: brain tested `--ref <sha> --build-only`, and the gate's `--build-only` on `main` last passed at 07:09 (docs/OVERNIGHT_LOG.md).

Environment variables (names only; values belong in `apps/web/.env.local`, which is not tracked and is copied into the stable demo, so it must be complete before that build):

| Variable | Read by | Without it |
|---|---|---|
| `JEV_API_KEY` | The server only: `packages/brain` behind `/api/decide`, `/api/ghost` and `/api/lab/decide`. | The rule-based driver decides, the HUD shows FALLBACK and the Result counts the decisions made by fallback (scripts/qa.sh, scripts/demo-stable.mjs). On Lab Missions the brief says Jev is not reachable and the fixed rules drive (docs/reports/LAB.md). The gate tests this path by forcing Jev to fail; a run with no key at all is not recorded as tested. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | The arena scripts (`pnpm --filter @rivetrun/brain arena` and `arena:lab`), and the live Brain Arena race on the big screen (`/screen?room=CODE&arena=1`) through `/api/arena/decide`. | In the scripts that provider's contestants are skipped and shown as "not configured" (docs/BRAIN_ARENA.md). In the live race a model whose key is missing or whose account has no credit is not offered, and a line says which and why (docs/DEMO_RUNBOOK.md). The tables on `/lab` need no key: they read docs/arena-results.json. |
| `ARENA_LIVE_CAP_USD` | `/api/arena/decide`. | Defaults to 1. A live Arena race costs about one US cent, and the server stops calling paid models after US$1 since its start; `GET /api/arena/decide` shows the running total (docs/reports/BRAIN.md). |

## 3. Repository map

A pnpm and Turborepo monorepo. Packages export TypeScript source and `apps/web` compiles them, so there is no package build step. Owners are from docs/FAST_MODE.md, docs/OVERNIGHT.md and docs/reports.

| Path | What | Owner |
|---|---|---|
| `packages/contracts` | Zod schemas and inferred types shared by every package. Changes are additive, one line each in docs/CHANGES.md. | scaffold, then mostly sim |
| `packages/sim` | The rail simulation: physics, perception, triggers, weather, missions, parts, the rule-based and random drivers, build assessment, replay of human runs, fuzz, leak and review tests. | sim |
| `packages/brain` | Jev client, the two wordings of the question (with the rules' verdict, facts only), tuning, benchmark, arena runner and provider adapters. | brain |
| `packages/lab` | The grid simulation and five scenarios for Lab Missions. | lab |
| `packages/db` | Drizzle and Neon schema from the scaffold. Not imported by the app. | nobody |
| `apps/web/app/api` | Route handlers (decide, ghost, runs, leaderboard, stats, version, race with a Server-Sent Events stream, `lab/decide`, `arena/decide`, `arena/humans`) and the in-memory stores. | brain |
| `apps/web/app/screen`, `race`, `leaderboard` | Big screen, Room Race phones, leaderboard. | brain |
| `apps/web/app/run`, `apps/web/src/state/run.ts` | The run page and its wiring to the sim. | sim |
| `apps/web/src/game` | 3D scenes (three.js through React Three Fiber), robot, HUD, controls, sound, weather visuals, attract mode, telemetry drawer. | game |
| `apps/web/app` (Home, `workshop`, `brief`, `result`, `lab`), `apps/web/src/ui`, `apps/web/src/state` | Screens, Workshop, part sheets, Brief, Result, `/lab`, inventory. | ui |
| `apps/web/app/scenarios`, `apps/web/src/lab` | Lab Missions screens. | lab |
| `apps/web/public/models`, `apps/web/public/renders`, `assets/` | 3D models, renders, Blender sources, print files. | asset agent |
| `e2e/`, `scripts/qa.sh`, docs/OVERNIGHT.md, docs/OVERNIGHT_LOG.md, docs/QA.md | Gate, smoke test, program, log, findings. | master |
| `scripts/` | `balance.ts` (balance table), `strangers.ts` (two scripted first-time players), `soak.ts` (fuzz on many seeds) by sim; `race-load.mjs` (Room Race load), `jev-smoke.ts` (three real Jev calls), `demo-stable.mjs`, `tunnel.mjs` by brain. | sim and brain |
| docs/reports, docs/DEMO_RUNBOOK.md | One handover file per session (brain, game, sim, lab) and the venue runbook. | each session; brain |

## 4. How it was built

One person coordinated several Claude Code sessions in one repository (docs/inputs/SETUP-draft.md). Jev is not a coding agent here: it is the model that picks the robot's commands inside the game.

### Sessions and roles

Commits are counted at the snapshot (Saturday 08:21) from the commit subject.

| Session | Role | Commits by subject marker (git log) |
|---|---|---|
| sim | Simulation, data, balance, missions, rule-based driver. | 43 with an `OVN-SIM` id |
| brain | Jev client and API, tuning, benchmark, arena, Room Race, big screen. | 39 with an `OVN-BRAIN` or `QA-T` id |
| game | 3D scenes, robot, HUD, controls, sound, weather visuals, attract mode. | 56 |
| ui | Screens, Workshop, Brief, Result, `/lab`, part sheets, inventory. | 69 |
| lab (from Sat 03:45) | Lab Missions grid simulation and `/scenarios`. | 14 |
| master (from Sat 03:45) | Orchestration and QA. Writes no feature code. | 45 |
| asset agent (ChatGPT with Blender) | Models, renders and print files. The sessions cannot reach it; the human relays. | 14 with scope `mk2`, `parts`, `assets` or `lab` |

The other 94 commits cannot be attributed from the subject: 19 are `docs:` commits and 75 carry no session marker, most of them sim and brain commits from before the overnight prefix convention. Sim and brain are therefore undercounted. Token counts per session are in "Tokens" below.

### Models and tools

- Claude Code (desktop app) for all implementation. Each session's local transcript records its model: `claude-opus-5-5` for the main conversation of all seven sessions (the Friday scaffold session and the six roles). The subagents of the scaffold, sim, brain and lab sessions ran on `claude-sonnet-5-5` and the master's on `claude-opus-5-5`; game and ui used no subagents (docs/tokens.json, `mainModels` and `subagentModels`). 198 of the 374 commits at the 08:21 snapshot carry a `Co-Authored-By: Claude Opus 5.5` trailer (git log).
- A planning chat wrote the spec and the kickoff prompts; Claude Design produced the mockups in docs/design/v1; ChatGPT supplied terrain and part reference data and the sound module in docs/inputs (docs/inputs/SETUP-draft.md).
- Jev, pinned to `jev-1.13.0`, called through the TypeSafe `systemone` endpoint with one Choice question per decision and a 1200 ms budget (docs/JEV.md).
- Blender for the MK-II rover: 21 GLB files validated, the assembled rover at 37,016 triangles (docs/PROJECT_STATE.md). That is asset validation, not a frame-rate or integration test.
- The asset agent (ChatGPT / Codex; its model and version are not recorded in this repository) drove Blender and the Bambu Studio command line, which slices the printable MK-II parts for a Bambu Lab A1 mini and reports print time and filament (assets/print/mk2/slice_parts.py, slicer-results.json).
- Playwright (`playwright-core` 1.58.2, headless Chromium with software WebGL) for the gate (e2e/package.json).
- Next.js 16, React 19, Tailwind 4, three.js with React Three Fiber, Zustand, Zod 4, Vitest, Turborepo (apps/web/package.json).

### Tokens

<!-- tokens:start -->
Measured at 2026-10-10T12:44+02:00, counting from 2026-10-09T18:00+02:00 (docs/tokens.json, written by `python3 scripts/tokens.py`). The sessions were still running, so the figures keep growing until they stop.

| Claude Code session | Model in its transcript | Total tokens | Input | Output | Cache write | Cache read | API responses |
|---|---|---|---|---|---|---|---|
| RivetRun monorepo scaffold | `claude-opus-5-5`; subagents `claude-sonnet-5-5` | 6,647,589 | 97 | 64,784 | 244,415 | 6,338,293 | 46 |
| [BRAIN] | `claude-opus-5-5`; subagents `claude-sonnet-5-5` | 347,912,854 | 1,587 | 819,830 | 2,114,154 | 344,977,283 | 718 |
| [SIM] | `claude-opus-5-5`; subagents `claude-sonnet-5-5` | 371,071,945 | 1,689 | 898,095 | 1,775,889 | 368,396,272 | 757 |
| [GAME] | `claude-opus-5-5` | 525,787,435 | 1,895 | 1,259,690 | 3,587,812 | 520,938,038 | 872 |
| [UI] | `claude-opus-5-5` | 433,493,918 | 1,701 | 1,070,397 | 3,064,753 | 429,357,067 | 788 |
| [MASTER] | `claude-opus-5-5`; subagents `claude-opus-5-5` | 282,696,600 | 1,230 | 632,061 | 1,779,419 | 280,283,890 | 523 |
| [LAB] | `claude-opus-5-5`; subagents `claude-sonnet-5-5` | 194,726,615 | 985 | 963,539 | 1,949,133 | 191,812,958 | 452 |
| **All sessions** | | **2,162,336,956** | **9,184** | **5,708,396** | **14,515,575** | **2,142,103,801** | **4,156** |

- Measured total: 2,168,755,993 tokens = 2,162,336,956 in Claude Code + 6,419,037 in the arena tables.
- 99.1% of the Claude Code figure is cache reads: the conversation so far, re-read from the cache on every turn. Total = input + output + cache write + cache read, the sum `ccusage` reports.
- Arena API: 6,331,971 input and 87,066 output tokens over the 12 paid rows of the published tables, US$3.65; the facts-only columns cost another US$0.53 and their tokens were not recorded.
- Jev is counted in calls, not tokens: 10,101 in the last benchmark run and 1,687 in the published arena tables. Its tokens: not measured (the API returns usage with every answer, docs/JEV.md, but nothing recorded it).
- Not measured, and not estimated: The asset agent (ChatGPT / Codex driving Blender and the Bambu Studio command line) (runs outside Claude Code; no token log reaches this repository); The orchestration chat that wrote the specs and the prompts the human pasted into the sessions (a separate chat; no token log reaches this repository); Claude Design (the mockups in docs/design/v1) (no token log reaches this repository); Any Claude Code session for this project that did not run from this checkout on this Mac (only this checkout's transcripts are read). Also: Tokens of the facts-only columns (their cost is recorded, their tokens are not), and every arena call that is not in the published tables: superseded arena runs and the live Arena races on the big screen. Jev calls made by the game itself (play, ghosts, Room Race bots, the QA gate, tuning tables): counted in server memory only and lost on restart.
<!-- tokens:end -->

How it was counted: Claude Code keeps a transcript of every session on the machine that ran it, and each API response in it carries its token usage. `scripts/tokens.py` sums those for this checkout's sessions and their subagents, once per response. The same files are what `npx ccusage` reads; the script was used instead so that no third-party package ran over the logs of every project on the machine. To cross-check, run `npx ccusage@latest session --json` and compare the rows for this project.

### Agents did, human did by hand

The same lists feed `/lab` (docs/how-built.json).

Agents did:

- The application code: simulator, 3D game, screens, brain integration, Room Race, Lab Missions.
- The unit tests, the QA gate and the end-to-end smoke; every demo-good tag.
- The benchmark and arena runs and their published tables.
- The 3D model, printable parts, backdrops, props and sprites (the asset agent).
- The overnight run from 03:46 to about 09:45 with the human away: order queues, gating, findings, status log.
- README, docs/SETUP.md, the runbook, the handover reports and this accounting.

Human did by hand:

- Product decisions: what the game is, what to cut, what the demo shows.
- The specs and the prompts for each session, written with the orchestration chat.
- Relaying between sessions, and between the sessions and the asset agent, which cannot message each other.
- Tests on a real phone.
- Committing docs.
- Kept the API keys and .env files; ran the demo server on :3001 and the tunnel.

### Arena contestants and results

Each question tells the brain which option the fixed rules rate as correct, so the "with the rules' verdict" score measures whether a model follows that under its real latency. "Facts only" is the same missions and seeds with a second wording: the same state, options and predicted numbers, what a missed scan or an empty battery costs, and no sentence that rates an option. It was run for Jev and the fast tier (docs/ARENA.md, docs/arena-results.json). Each model id was checked against its provider's models endpoint before its row ran.

| Tier | Contestant | Provider model id | Runs | Gameplay version | Finish | Score with the rules' verdict | Score, facts only (scans) | Latency p50 ms |
|---|---|---|---|---|---|---|---|---|
| fast | Jev | `jev-1.13.0` | 30 | 4 | 80 % | 546 | 436 (12) | 250 |
| fast | GPT-5 nano | `gpt-5-nano` | 30 | 4 | 77 % | 427 | 449 (0) | 715 |
| fast | GPT-6 Luna | `gpt-6-luna` | 30 | 4 | 80 % | 496 | 474 (4) | 853 |
| fast | DeepSeek Flash | `deepseek-flash` | 30 | 4 | 80 % | 476 | 472 (4) | 817 |
| fast | Claude Haiku 5.5 | `claude-haiku-5-5` | 24 | 3 | 75 % | 481 | — | 890 |
| mid | GPT-5.6 Luna | `gpt-5.6-luna` | 30 | 4 | 80 % | 491 | — | 844 |
| mid | Claude Sonnet 5.5 | `claude-sonnet-5-5` | 24 | 3 | 71 % | 425 | — | 1138 |
| reasoning | GPT-6.1 Sol | `gpt-6.1-sol` | 9 | 4 | 78 % | 473 | — | 1169 |
| reasoning | DeepSeek V4 Pro | `deepseek-v4-pro` | 9 | 4 | 33 % | 228 | — | 5197 |
| reasoning | Claude Opus 5.5 | `claude-opus-5-5` | 7 | 3 | 71 % | 480 | — | 1682 |
| baseline | Heuristic (the rule-based driver, 15 scans) | — | 30 | 4 | 80 % | 554 | same | 0 |
| baseline | Random | — | 30 | 4 | 0 % | 41 | same | 0 |

Lab Missions, 15 runs per row, verdict → facts only (docs/ARENA_LAB.md): Jev 704 → 581, heuristic 702, DeepSeek Flash 517 → 491, GPT-6 Luna 502 → 457, GPT-5 nano 483 → 333, random 259. On facts alone Jev scores 178 on Warehouse and completes Mars once in three runs.

How to read it. With the fixed rules' verdict in the question, Jev is level with the rules (546 against 554 on the rail, 704 against 702 on Lab Missions) and answers in about 250 ms, about a third of the next model's median. On facts alone it scores about 110 points lower on the rail, makes 12 of the rules' 15 scans and drives a slower pace: 85.3 s per finished run against 50.2 s (docs/arena-results.json). On the rail the other fast models lose less (22 and 4 points) or gain (GPT-5 nano, 22), while scanning 4, 4 and 0 times. What the game can claim, in the log's words: Jev follows a stated policy in a quarter of a second; it does not yet judge the track by itself. The game keeps the verdict question because it plays better, and the Brain sheet says what Jev is told (docs/OVERNIGHT_LOG.md).

Other measurements:

- Benchmark, 810 headless runs (M1–M9 × 5 builds × 3 seeds × 6 rows): Jev finishes 62 % with a mean score of 433, the heuristic 63 % and 441, random 10 % and 93; Jev answered 10096 of 10101 questions within 1200 ms, p50 243 ms (docs/BENCHMARK.md). Its Jev rows were measured at `17ba1ac`, before the later question changes (docs/reports/SIM.md).
- By mission with the verdict, default build, 3 seeds, Jev / heuristic: M1 843 / 847, M2 780 / 780, M3 611 / 650, M4 728 / 751, M5 640 / 665, M8 663 / 684, M9 584 / 601; M6 with the Deep Diver 500 / 418. On facts alone / with the verdict / heuristic: M1 806 / 842 / 847, M3 573 / 637 / 650, M7 with the piston 474 / 765 / 775 (docs/CHANGES.md).
- Spend on the arena: about US$7.6 of a US$10 cap, and no more paid runs. The three Claude rows are still carried over from gameplay version 3, because the provider account has had no credit since about 04:20 (docs/OVERNIGHT_LOG.md).

### Coordination

1. The first plan was a scaffold session followed by four sessions, each in its own worktree and branch (docs/prompts/kickoff-v3.md). The scaffold merged as pull request 1 on Friday at 20:40. At 21:00 FAST MODE replaced the rest of that plan: every session on `main` in one shared checkout, no branches, no pull requests, no required gates (docs/FAST_MODE.md).
2. Ownership by path. A session never edits another owner's paths; it asks the owner. Because the git index is shared, every commit names its paths: `git add <paths> && git commit -m "…" -- <paths>`, never `git add -A`.
3. `packages/contracts` changes only by addition, with one line per change in docs/CHANGES.md, so the other sessions keep compiling.
4. One dev server on :3000, run by the human. Each session that used a browser tested on its own origin, so that browser storage stayed separate.
5. From Saturday 03:45, the overnight Protocol (docs/OVERNIGHT.md). A worker pulls, reads its orders, implements, runs unit tests and `tsc` for its paths, checks its screens headless at 390×844, commits as `[OVN-<id>]`, pushes, and reports `done OVN-<id> <hash> · verified: <what> · not verified: <what>`. The master session, every 20 to 30 minutes, pulls, runs the gate, tags on green or sends the failing check to its owner, compares screenshots with each item's acceptance line, files findings in docs/QA.md with an owner, and refills the queues.
6. At 04:11 the app capped messages between sessions at 10 per message the human types. The master session did not route around the cap: from then on every order went through the "Orders from [MASTER]" section of docs/OVERNIGHT.md. Sim, game, brain and lab followed the file: pull, read the block, wake up every 10 minutes when it is empty. The ui session acted only on messages, so it worked on what other sessions asked of it and its own block in the file stayed untouched; that is why the open findings are all ui's (section 7). A file cannot wake an idle session either: brain sat idle from 04:12 until its next incoming message (docs/OVERNIGHT_LOG.md).
7. Guardrails: no force push, history rewrite, stash or destructive command; no changes to secrets or `.env` files; keys never printed or logged; the human owns :3001 and the tunnel; a large new feature lands behind a flag or on its own route until the gate has seen it green. Between 06:46 and the 07:30 build only fixes for open findings were to land.

### Review rounds and handovers

Between 05:30 and 06:00 each owner had a fresh agent, one that had not seen its reasoning, review its package for bugs (docs/OVERNIGHT.md). What each round found (docs/QA.md, docs/OVERNIGHT_LOG.md, docs/reports):

| Owner | Found | Outcome |
|---|---|---|
| sim | 1 high, 4 medium, 5 low. The high one: a pedal held through a piston jump counted as an air input, so every jump with the throttle held landed HARD (Q23). | Fixed with regression tests (`9759fe6`). |
| game | Climb mode and the jump timer carried into the next race on the same phone (Q24). | Fixed (`ee4752a`). |
| lab | 2 in the package at 04:45; then on the page 4 high, 4 medium, 9 low: Enter or Space also drove the robot, the two-tap "End the mission" guard could be bypassed, the flag vanished without a word, a robot with no sensors "sensed 100 % of the map" (Q25). | 17 of 19 page findings fixed (`c8c22ae`); two left as they are. |
| brain | A race could put an unverified score on the leaderboard; no limit on body size; an unbounded ghost queue; the mission missing from the decision cache key; stale snapshots. Also three trust findings. | The first group fixed (`6fcc8c1`, `b7d1fcf`). The three trust findings are left open on purpose (section 6, Security). |
| ui | No round reported: the order sits in its untouched block. | — |

Handover files: docs/reports/BRAIN.md, GAME.md, SIM.md and LAB.md each list what the session built with the commits, what is simplified or assumed, what nobody verified, and the three likeliest failures at the demo with what to do. There is no UI.md.

What went wrong in the process: about 25 minutes were lost on Friday because the spec had not reached the repository (docs/inputs/SETUP-draft.md); the first weather commits turned committed `main` red in other owners' paths (Q1 to Q4); the arena question stated the rules' verdict from 04:45 until QA filed it at 05:13 (Q20); a gate went red at 05:57 only because unit tests timed out on a loaded machine (Q22); the ghost warm-up competed with a visitor's live Jev decisions until the gate's warnings showed it (Q31).

## 5. Quality gate

`scripts/qa.sh` gates one commit, by default the committed HEAD. Steps, in order:

1. Worktree: the commit is checked out, detached, in `../rivetrun-qa`. Nothing uncommitted in the shared checkout can help it pass.
2. Install: `pnpm install --frozen-lockfile --prefer-offline`.
3. Typecheck: `next typegen`, then `turbo run typecheck --continue`. It is a separate step because `next build` ignores type errors here (`ignoreBuildErrors` in apps/web/next.config.ts).
4. Unit tests: `turbo run test --continue`, two packages at a time. If that fails, one serial retry after 15 s, and the gate notes when only the retry passed. 69 test files at the snapshot.
5. Determinism: `scripts/balance.ts --seeds 2` twice; the two tables must be byte-identical.
6. Balance: every mission is finished by at least one core build within budget, and the default build finishes M1.
7. Build: `next build` of that commit.
8. End-to-end smoke: `e2e/smoke.mjs` against that build, served by `next start` on 127.0.0.1:3100 only while the smoke runs. One retry after 20 s.
9. With `--demo-build`, hourly: `pnpm demo:stable -- --build-only`, skipped while anything serves on :3001.
10. With `--tag`: if every step passed, none was skipped and the commit is on `origin/main`, an annotated tag `demo-good-<HHMM>` is created and pushed. The annotation says what was checked.

The smoke has 21 steps in headless Chromium with software WebGL and keyboard input (e2e/smoke.mjs, docs/QA.md). At 390×844: Home; Workshop; Brief M1; a Drive run on M1 (start, finish, scan); the run submitted to the server and accepted by its replay; the Episode downloaded and parsed and the share card saved as a PNG; the personal-best card; Jev driving M1 from Play Now to the Result; M5 at full throttle doing only what the stuck prompt says; `/lab`; the Maze in `/scenarios` to "Scenario complete"; every mission's Brief; every mission's run scene for 7 s with Jev driving; Jev forced to fail, with FALLBACK on the HUD and a finished run. At 1280×720: `/screen`; a Room Race on M1 with two JEV bots, lobby then results; a live Brain Arena race, Jev against the fixed rules; stills.

| A `demo-good-*` tag certifies | It does not certify |
|---|---|
| The commit installs from the lockfile, every package typechecks and every unit test passes with nothing uncommitted helping. | Frame rate, touch, sound, or anything on a real phone: rendering is in software at a few frames per second. |
| Two runs of the balance table are byte-identical. | The MK-II kit: it does not load in headless Chromium, so every screenshot shows the procedural robot. |
| Every mission can be finished by at least one core build within budget, and the default build finishes M1. | A Room Race with people: bots only, no phone joined, and only M1 is raced. The live Arena race with a paid model. |
| `next build` succeeds. | Dev-only paths (`window.__rivetrun`, `?weather=`), which are not in the build under test. Lab Missions other than the Maze. |
| The smoke path above completes on a production build of that commit. | The phone's own share sheet: Share is checked through its fallback, a PNG saved and looked at once. |

Tags to date (git tag; contents by git ancestry, wording from docs/OVERNIGHT_LOG.md). One gate was red and gave no tag: 05:57, unit tests timing out under load.

| Tag | Commit | New in the tag or in the gate |
|---|---|---|
| `demo-good-0426` | `b5cda43` | First green: Drive run on M1 with the scan, nine Briefs and run scenes, Room Race with two bots, `/lab`. |
| `demo-good-0432` | `ee76275` | v3 coach marks, Result breakdown, one air rule for brains and players. |
| `demo-good-0438` | `f8b94fc` | Jev drives M1 in the smoke, which showed it skipping the scan zone (Q13). |
| `demo-good-0452` | `537c721` | Jev scans on M1; stuck prompt on M5; the arena's Lab track. |
| `demo-good-0500` | `5bf1572` | `/scenarios` on screen and the Maze in the smoke; race ranking includes missed scans. |
| `demo-good-0509` | `f1a6a8c` | Jev forced to fail in the smoke: FALLBACK shown, run finished. |
| `demo-good-0522` | `c377462` | 18 smoke steps; arena re-run on gameplay version 4; Lab Missions on a wide screen with a legend. |
| `demo-good-0535` | `1a241f5` | A phone that drops off or reloads mid-race; live Jev on Lab Missions; the leak tests; "Jev is ready" on the Brief. |
| `demo-good-0543` | `8d924d6` | 19 steps: the driven run is submitted and the server's replay accepts it; humans in the arena. |
| `demo-good-0607` | `b4c51ec` | Both arena columns on `/lab` with the sentence above them; review-round fixes of sim, game and lab. |
| `demo-good-0624` | `d4bc2be` | 20 steps: a live Brain Arena race, Jev against the fixed rules; final facts-only figures; brain's remaining review fixes. |
| `demo-good-0641` | `dc781e2` | Ghost warm-up yields to live Jev decisions (Q31); Lab Missions failure cases. |
| `demo-good-0650` | `87385bf` | HUD warnings for first-timers (Q32); race phone result card (Q29); the runbook. |
| `demo-good-0709` | `3313c10` | M8's scan zone moved clear of a rock (Q33); Q31 closed after three gates without FALLBACK. |
| `demo-good-0718` | `8bdc9b3` | Drive-mode hint wording; Jev ghosts keyed by the mission data. Named by the log as the build for 07:30. |
| `demo-good-0754` | `9aa449c` | 21 steps: Episode download and share card in the smoke. |
| `demo-good-0928` | `4a8d9e1` | The final tag of the overnight program: this README and SETUP; no product change since `demo-good-0754`. Hourly demo build passed. |

## 6. What is implemented and what is simplified

"Where the UI says so" refers to `SIMPLIFICATIONS` in packages/sim/src/simplifications.ts: 21 sentences, each assigned to a screen. docs/GAME_SPEC.md opens with "What the game is now", one line and one commit for each place the game differs from the original spec.

| Area | Implemented | Simplified or assumed (and where the UI says so) |
|---|---|---|
| Physics | One-dimensional track, 50 ms steps, the same seed and commands give the same run. Traction limit (friction × weight; spinning wheels keep 70 %), grip-limited braking, soft-ground drag, slopes, solid obstacles with a safe contact speed and damage growing with the square of the excess, flooding, ballistic flight, falls (docs/SIM_MODEL.md). Fuzz: 10 000 runs on 20 seeds, 0 violations; 103 sim unit tests green at `d0e8527` (docs/reports/SIM.md). | No steering and no side slip. Formulas, not a rigid-body engine. Stated in docs/SIM_MODEL.md; there is no entry for it in `SIMPLIFICATIONS`, so no screen is known to say it. The robot is drawn about 6× its real size on a track drawn 1:1 (docs/reports/GAME.md). |
| Weather | Rain (grip ×0.8, camera range ×0.6), wind as drag with seeded gusts, cold (1 % of usable battery per °C below 20 °C), fog, night and snowfall; missions M8 Storm Ridge and M9 Polar Night; weather visuals and a HUD chip. | Range factors are chosen for the game, not measured. Wind acts along the track only, on an estimated 0.04 m². Cold is a rule of thumb, snow is one surface, the M8 puddle is 4 cm of water. Shown on the Brief weather card and the part sheet. |
| Sensing and triggers | A brain gets an Observation built only from the sensors fitted, with seeded noise; a missing sensor reads `unknown`. Decisions are requested when something changes, never on a clock, and a slow answer costs sim time. Jev has 1200 ms before the rule-based driver decides, marked FALLBACK; after two late answers the fixed rules decide at once for 8 s. Leak tests, all in tags since `demo-good-0607`: 8 sensor sets × 7 pairs of tracks identical within range and different beyond; a twin for the question text and the arena prompt; and pairs in fog, night with snowfall and a storm. The first found one leak, fixed (Q21): a legacy field whose presence revealed a gap beyond range, which no prompt read. The weather pairs found none (docs/CHANGES.md). | Sensors never fail. Scan-zone positions come from the mission plan and are excluded from the leak test by design. The core kit assumes wheel encoders and a power sensor (Workshop senses). The NoIR camera's 6 m is the game camera's range with IR lamps assumed, and headlights from the light sensor are a game rule (part sheet). The game's own Jev question states the rules' verdict; the Brain sheet says so. |
| Energy | Draw follows the command and the load. Per metre, steady throttle costs about 70 % of full and ease about 57 %. Capacity comes from the battery and the cell count; an empty battery ends the run. Tuned so that a heavy build on the small battery runs out at 90 % of M5 and M6 at full throttle (docs/CHANGES.md). | Game stats for mass, cost and power are tuned for play and are not the real parts' specs (docs/MK2_BOM.md). There is no cell model. |
| Air control | Ramps, drops and the piston launch the robot. The body levels itself at 60°/s for every driver; a player's brake or extra throttle changes the pitch; landings are graded clean, hard or crash. Holding the jump for 0.3 to 1 s gives 40 to 100 % of the push. Sim's review round found that every piston jump with the throttle held landed HARD (48° nose-up, 5 % damage); fixed at `9759fe6` with regression tests (Q23). | Self-levelling and the charge curve are game rules (Drive coach marks). The landing bug was never seen in a browser, before or after; a jump timed by hand onto a gap after the fix is not verified (docs/reports/SIM.md). A crash landing was never produced in a browser (docs/reports/GAME.md). |
| Scan zones | Stop under 0.1 m/s for 1.5 s with a sensor the zone accepts. A miss adds 10 s; a centred stop adds 15 points. Zones on M1 (1), M3 (2), M7 (3), M8 and M9 (1 each). The HUD says "CANNOT SCAN" with the reason, and how far short of a pad the robot stopped. A data test keeps obstacles, gaps and drops off every pad and the 2.5 m before it (Q33). | "A camera scan in the dark needs a NoIR camera or headlights" is a game rule (Brief objectives). |
| Room Race | Rooms in server memory. Phones receive state over Server-Sent Events with a polling fallback and post 5 times a second. The host opens 4, 6 or 8 human seats and up to 2 JEV bots; a ninth phone sees "Room full — watch the big screen". The race closes 45 s after the leader, 180 s after the start at the latest; ranking includes 10 s per missed scan. A phone that loses the network for 5 s or reloads mid-race keeps its seat and finishes with one order on every screen; a silent phone is "DNF · disconnected" after 20 s (brain's own headless check, not the gate). The phone's result card fits a time with a missed scan (Q29). Load: 8 scripted bots, 0 dropped, 109 ms p95 end to end, on the dev server (docs/OVERNIGHT_LOG.md). | Only the clock is the server's: that a phone finished, its position and its missed-scan count are taken from the phone. Anyone who knows a room's four-letter code can start or reset it through the API. Both left open on purpose (docs/reports/BRAIN.md). A reload restarts that robot from the start line on the same clock; it does not resume. A signal loss exactly at the finish, and the polling fallback through the tunnel, are not verified. No real phone has joined a room. |
| Lab Missions | `packages/lab`: a deterministic grid simulation with fog of war from the build's sensors and decisions on events; five scenarios with objectives and scores; `/scenarios` with a pad, keys, tap-to-drive, decision thread and a result that shows the true map beside what the robot sensed. Jev drives or plays the rival live through `/api/lab/decide`; after 1.2 s the fixed rules decide and the chip says FALLBACK. The brief says what Jev is told and has a "Jev decides from facts only" switch. Network cut, reload, back and a sideways phone all end with a stated result. Review round: 17 of 19 findings fixed (docs/reports/LAB.md). | A separate grid simulation that does not use the rail physics: nine `lab_*` sentences, shown on every brief. Sensors have no noise. The score weights are calibrated against nothing. On the page every run of a mission uses the same map and seed. When Jev cannot be reached the fixed rules fill its seat, answering in 400 ms, and the brief says so. Not verified: a full capture the flag against the live Jev, a production build, a real phone. |
| Arena | One shared question in two wordings, provider adapters, latency applied in sim time, no fallback for anyone, a 10 s deadline. Rail 283 runs, Lab Missions 90 runs. `/lab` states above both tables what they measure and shows both scores, each row's gameplay version and verified human runs. A live Arena race on the big screen puts up to four brains on one seed, each lane with its latest response time; Jev against the fixed rules is in the gate. | Samples are small: 30 runs per fast, mid and baseline row (3 seeds), 9 runs on 1 seed for the reasoning rows. The three Claude rows (24, 24 and 7 runs) are carried over from gameplay version 3 with an older prompt and are not comparable. Rows ran on different sim commits; M8's scan zone moved 2 m after the runs. Facts-only figures exist for Jev and the fast tier only. The paid brains were raced live on the dev server only. `/lab` carries "Our sim, our prompts, N runs, date. Not a general model ranking." On a phone the facts-only column is off the right edge (Q26, open). |
| Parts and bill of materials | Game parts mapped to real components with official links checked on 2026-10-10; part sheets, "Build it for real", inventory, printed parts (docs/MK2_BOM.md). | "Designed, not yet built or test-printed." The thruster and the jump piston are marked experimental. Renders the manifest marks approximate are captioned "Illustrative render, dimensions not published". |
| Persistence | Runs, leaderboard, Jev answer cache, ghosts, race rooms and human arena rows live in the Next server's memory and are lost on restart (docs/reports/BRAIN.md). Builds, progress, inventory and personal bests live in the browser's storage, per device. | No database is in use: `packages/db` is not imported by the app. |
| Security | The Jev and provider keys stay on the server. Request bodies over 2 MB are refused (apps/web/src/api/respond.ts). A submitted human Drive run is replayed from its input log on the server and refused when it does not reproduce. The Jev fault switch is off in the stable build. | No accounts, no rate limiting, no hardening: a local proof of concept (docs/FAST_MODE.md). Three limits are known and left open on purpose: a Room Race trusts the phone's finish, position and missed-scan count; a room's four-letter code is enough to start or reset it; a Jev-mode or log-less run posted to `/api/runs` is stored as sent, so a leaderboard score can be invented. They matter if the tunnel URL stays public for long (docs/OVERNIGHT_LOG.md). |

## 7. Known gaps and what was never tested

Never tested by anyone (docs/QA.md, docs/OVERNIGHT_LOG.md, docs/reports):

- A real phone, on real wifi or mobile data. No session has one; every check was headless Chromium or curl.
- Touch input with two thumbs, and haptics. The gate drives with the keyboard.
- Frame rate. Not measured. The only figure is a proxy: 130–141 draw calls per frame at low quality and 163–173 at high.
- Sound by ear. A unit test renders all 20 effects offline and checks that each is audible, does not clip and is shorter than 2 s; nobody has heard them.
- The MK-II kit on a real GPU. It sits behind `?robot=mk2` with a procedural fallback and times out in headless Chromium.
- Serving a tag with `pnpm demo:stable -- --ref <tag>`, the tunnel, and the runbook on the served build. Only `--build-only` runs were made; nothing was being served on :3001 at 07:54.
- Two real people in one race, and more than one real phone in a room.
- The phone's own share sheet. The gate checks Share through its fallback only.
- The first drawn frame of the run page on a phone, and the camera fly-in as motion. Transfer was measured once on a 9 Mbps / 170 ms link (749 kB, all code by 1.5 s).
- The live Arena race with paid models on a production build; Lab Missions other than the Maze, by the gate.
- Jev's quota and rate limit for the demo window: unknown. A cold Jev ghost is 14–34 calls, and over the limit the game falls back to the fixed rules and says FALLBACK.
- `pnpm lint` is not part of the gate: not verified.

Findings open in docs/QA.md at the snapshot. All four Q findings are ui's and are open for one reason: the ui session does not read the orders file, and the master's messages to it are capped.

| # | Owner | What |
|---|---|---|
| Q26 | ui | `/lab` at 390×844: the "Score · facts only" column is off the right edge, so a visitor sees Jev 546 and must scroll sideways to find 436. |
| Q27 | ui | Build it for real at 390×844: part names are cut to a few letters by the price column. |
| Q28 | ui (low) | Workshop at 390×844: tapping a slot tab shows nothing new without scrolling. |
| Q34 | ui (low) | The share card ends with the old tagline "You build the body. AI drives it.", on a run the player drove. |
| R12 | human check | The 3D bench on Home and in the Workshop may stay on its placeholder after a hard load. Needs one look on a real phone or a visible tab. |

Reported fixed by the owner and not retested by QA: Q9, Q14, Q15, Q17, Q19, Q22, Q29, Q30, and the older R6. Q33 is fixed in part: the Drive-mode hint that pairs what was just seen with the rules' next choice is left as intended. R18 is fixed in the config and not confirmed on a phone. The ui block in the orders also holds work never started: a shopping-list CSV, live Jev stats on `/lab`, the Home rail for nine missions, `/scenarios` in the header menu, and a copy pass (docs/OVERNIGHT.md).

Also open for the human (docs/OVERNIGHT_LOG.md): asset files under `apps/web/public/models` and `assets/` are uncommitted and in no tag, so a demo built from a tag ships the older models; the Claude arena rows cannot be re-run until the provider account has credit; a room seats 8 phones where docs/DEMO_PLAN.md says "10+ phones"; a first-timer who only holds the throttle finishes M1, M2, M4 and M9 and gets stuck in mud on M3, M5 (the mission named Room Challenge) and M8 unless they tap CLIMB when the prompt says so.

## 8. Timeline

Times are commit times (git log). The hackathon opened on Friday at 18:30 (docs/inputs/SETUP-draft.md); the first commit is at 20:18.

| Phase | Window | What landed |
|---|---|---|
| Spec and scaffold | Fri 20:18–21:00 | Game spec v3 and kickoff prompts; monorepo scaffold and contracts; Jev client and `/api/decide`; sim core; FAST MODE adopted. |
| First playable | Fri 21:00–22:00 | Run page wired end to end (21:02); 2.5D scene and HUD; Home, Workshop, Brief, Result; tuned Jev question and first benchmark; briefings; Room Race over Server-Sent Events (21:25); scout drone; sound; `pnpm demo` and the tunnel; M6 Deep Water. |
| Gameplay v2 | Fri 22:00–23:30 | Attract replay; benchmark with briefings; Drive mode, ramps, gaps and the three dials; Room Race with server-stamped results; `pnpm demo:stable`; the Jev ghost from `/api/ghost`. |
| QA and real parts | Sat 00:00–03:00 | Race fixes; first QA log (00:59); black scene on cold load fixed (01:41); seat cap; MK-II adapter behind a flag; bill of materials (02:04); real parts on part sheets and "Build it for real"; build assessment and solid obstacles (02:40); lidar, ToF ranger and brushless motor. |
| Brain v3, gameplay v3, arena | Sat 03:00–03:45 | Both specs (03:09); Observation and triggers (03:20); telemetry console and reaction duel; analog controls, wheelspin and scan zones (03:29); first arena results (03:30). |
| Overnight program: features | Sat 03:45–05:22 | Master session and the gate (04:00); weather, M8 and M9; air control and the charged jump; `packages/lab` and five Lab Missions; `/scenarios` (04:46); stuck prompt; Jev fault switch (04:58); seven tags; arena re-run on gameplay version 4 (05:12); first leak test (05:18). |
| Overnight program: honesty and review | Sat 05:22–06:10 | A phone that drops off or reloads (05:25); live Jev on Lab Missions (05:26); humans in the arena with server-side replay (05:28); review rounds by fresh agents (05:36–05:58); facts-only questions and both arena columns (05:37–06:05); a red gate under load at 05:57 and the unit-test retry; Q20 closed (06:07). |
| Overnight program: demo readiness | Sat 06:10–08:21 (snapshot) | Live Arena race (06:14), in the gate from 06:24; handover files (06:16–06:34); warm-up yields to live decisions (06:32); first-timer HUD warnings (06:33); the runbook (06:37); fixes only from 06:46; M8 pad moved (06:59); Episode and share card in the gate (07:45); sixteenth tag (07:54); last commit 08:21. |
| Planned, not done at the snapshot | Sat 08:21 onward | The program runs to 10:00. The 07:30 build from a tag and the 08:15 stranger test are not recorded as done. Feature freeze 14:00, rehearsal 15:30, code freeze 16:00, demos 16:15 (docs/DEMO_PLAN.md). |

Commits per hour: Fri 20h 4 · 21h 34 · 22h 21 · 23h 14 · Sat 00h 14 · 01h 11 · 02h 27 · 03h 56 · 04h 91 · 05h 60 · 06h 32 · 07h 9 · 08h 1 (to 08:21).
