# RivetRun

Build a small robot from real maker parts, then drive it, or let a decision model called Jev drive it, along rail missions with simplified physics, weather and sensors. The same run can be driven by Jev, by other language models, by fixed rules or by a person, and the results compared. There is a Room Race for phones with a big screen, and a second, top-down grid simulation called Lab Missions. It is a hackathon proof of concept that runs on localhost.

This file describes `main` at `1cd92fe` (Saturday 10 October 2026, 08:21): 374 commits and 16 `demo-good-*` tags. Every number names the file it comes from.

## Try it

Node >= 20 and pnpm 10.

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm demo:stable -- --ref "$(git tag -l 'demo-good-*' | sort | tail -1)"   # last commit that passed QA, on :3001
```

Without `JEV_API_KEY` in `apps/web/.env.local` a rule-based driver decides instead of Jev and the HUD shows FALLBACK. The tunnel, the other variables and what each command does are in [docs/SETUP.md](docs/SETUP.md); the commands in order for a venue, with health checks and what to do when something fails, are in [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md).

## What is in it

- **Workshop** (`/workshop`): 22 parts, four presets and three dials. Each part sheet shows the real component behind it, and "Build it for real" gives a bill of materials with official links ([docs/MK2_BOM.md](docs/MK2_BOM.md)).
- **Missions** (`/brief/Mx` → `/run/Mx` → `/result`): nine rail missions, M1 to M9. Drive with analog throttle and brake against a Jev ghost, or watch Jev drive with each decision on the HUD. The simulation is deterministic and a brain knows only what the fitted sensors report ([docs/SIM_MODEL.md](docs/SIM_MODEL.md)).
- **Brain Arena** (`/lab`): Jev, nine LLMs, the rule-based driver and a random driver on identical runs, with latency counted as simulation time, and human runs the server could replay. A live version on the big screen (`/screen?room=CODE&arena=1`) races one bot per brain.
- **Room Race** (`/screen` and `/race`): a big screen shows a QR code; up to 8 phones and 2 Jev bots race the same seed, and one result is shown on every screen.
- **Lab Missions** (`/scenarios`): five grid scenarios (maze, warehouse, Mars sample return, house inspection, capture the flag) with the same parts, sensors and battery. Jev drives live, with the fixed rules as fallback. Labelled in the UI as a grid simulation.

## Brains compared

Mean score, higher is better. Rail: M1–M9 on one build plus one specialist build, 3 seeds, 30 runs per row ([docs/ARENA.md](docs/ARENA.md)). Lab Missions: 5 scenarios, 3 seeds, 15 runs per row ([docs/ARENA_LAB.md](docs/ARENA_LAB.md)). Each brain was asked twice: with a question that names the option the fixed rules rate as correct ("verdict"), and with the same state, options and predicted numbers but no such sentence ("facts only").

| Brain | Rail, verdict | Rail, facts only | Rail latency p50 | Lab, verdict | Lab, facts only |
|---|---|---|---|---|---|
| Rule-based driver | 554 | same | 0 ms | 702 | same |
| Jev (`jev-1.13.0`) | 546 | 436 | 250 ms | 704 | 581 |
| GPT-6 Luna | 496 | 474 | 853 ms | 502 | 457 |
| DeepSeek Flash | 476 | 472 | 817 ms | 517 | 491 |
| GPT-5 nano | 427 | 449 | 715 ms | 483 | 333 |
| Random | 41 | same | 0 ms | 259 | same |

How to read it: told the fixed rules' verdict, Jev is level with the rules and answers in about 250 ms, about a third of the next model's median. On facts alone it scores about 110 points lower on the rail, makes 12 of the rules' 15 scans and drives a slower pace; on the rail the other models lose less. So the verdict column measures whether a model follows a stated policy in time, and the facts column what it does by itself. In the log's words, Jev follows a stated policy in a quarter of a second and does not yet judge the track by itself ([docs/OVERNIGHT_LOG.md](docs/OVERNIGHT_LOG.md)). The game itself uses the verdict question and says so on the Brain sheet.

As shown on `/lab`: "Our sim, our prompts, 283 runs, 2026-10-10. Not a general model ranking." The three Claude rows, not in this table, are carried over from an earlier game version and are not comparable. The arena cost about US$7.6 of a US$10 cap.

## How it was made

- One person and up to six Claude Code sessions on a single checkout of `main`, each owning a set of paths: sim, brain, game, ui, then lab and a master session that orchestrates and tests and writes no feature code.
- A separate asset agent (ChatGPT with Blender) made the models and renders; the human relayed between it and the sessions.
- 374 commits between Friday 20:18 and Saturday 08:21, 91 of them in the hour from 04:00 (git log).
- A gate (`scripts/qa.sh`) rebuilds each candidate commit in a clean worktree: typecheck, unit tests, determinism, balance, a production build and a 21-step Playwright smoke run. Sixteen commits carry a `demo-good-*` tag.
- Each owner had a fresh agent review its package; the rounds found, among others, a landing bug on every piston jump and a way to put an unverified score on the leaderboard. Each session reports items as "verified" and "not verified" and left a handover file in [docs/reports/](docs/reports/). The full account is in [docs/SETUP.md](docs/SETUP.md).

## Honest limits

- Nothing was run on a real phone. Touch, frame rate, sound by ear and the phone's share sheet are untested; the gate uses a headless browser, software rendering and the keyboard ([docs/QA.md](docs/QA.md)).
- The physics is one-dimensional and made of formulas, with no steering and no rigid-body engine. Weather factors and several sensor rules are game rules. Lab Missions use a separate grid simulation.
- The arena samples are small (30 runs per row, 9 or fewer for the reasoning models), rows ran on different commits, and facts-only figures exist for Jev and three fast models only. On a phone the facts-only column is off the right edge of the table (Q26, open).
- Room Race was tested with bots and headless phones, never with two real people. State lives in server memory: no database, no accounts, no rate limiting. Three limits are known and left open on purpose: a race trusts the phone's own finish, position and missed scans; a room's four-letter code is enough to start or reset it; a run without an input log posted to `/api/runs` is stored as sent ([docs/OVERNIGHT_LOG.md](docs/OVERNIGHT_LOG.md)).
- Serving a tag, the tunnel and the runbook have not been tried on a served build. The MK-II rover is designed, not built or test-printed; its 3D kit sits behind a flag, no session has seen it on a real GPU, and the newest asset files are uncommitted.
- Four findings are open, all in the ui session's area, because that session does not read the orders file ([docs/SETUP.md](docs/SETUP.md), section 7).

## Docs

- [docs/SETUP.md](docs/SETUP.md): run it, repository map, sessions and tools, the gate, what is simplified, known gaps, timeline.
- [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md): one page for the venue.
- [docs/OVERNIGHT_LOG.md](docs/OVERNIGHT_LOG.md): status log of the overnight program, decisions taken, what the human still has to do.
- [docs/QA.md](docs/QA.md): what the gate proves and does not prove, and every finding with its owner and status.
- [docs/reports/](docs/reports/): one handover per session (brain, game, sim, lab): built, simplified, not verified, likeliest failures.
- [docs/SIM_MODEL.md](docs/SIM_MODEL.md): the simulation in plain words, with every number from the code.
- [docs/BRAIN_ARENA.md](docs/BRAIN_ARENA.md): arena rules and contestants. Results: [docs/ARENA.md](docs/ARENA.md), [docs/ARENA_LAB.md](docs/ARENA_LAB.md).
- [docs/MK2_BOM.md](docs/MK2_BOM.md): bill of materials for the real rover.
