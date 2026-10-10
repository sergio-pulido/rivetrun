# RivetRun

Build a small robot from real maker parts, then drive it, or let a decision model called Jev drive it, along rail missions with simplified physics, weather and sensors. The same run can be driven by Jev, by other language models, by fixed rules or by a person, and the results compared. There is a Room Race for phones with a big screen, and a second, top-down grid simulation called Lab Missions. It is a hackathon proof of concept that runs on localhost.

This file describes `main` at `7aa92cb` (Saturday 10 October 2026, 05:22), while work was still going on. Every number names the file it comes from.

## Try it

Node >= 20 and pnpm 10.

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm demo:stable -- --ref "$(git tag -l 'demo-good-*' | sort | tail -1)"   # last commit that passed QA, on :3001
```

Without `JEV_API_KEY` in `apps/web/.env.local` a rule-based driver decides instead of Jev and the HUD shows FALLBACK. The tunnel, the other variables and what each command does are in [docs/SETUP.md](docs/SETUP.md).

## What is in it

- **Workshop** (`/workshop`): 22 parts, four presets and three dials. Each part sheet shows the real component behind it, and "Build it for real" gives a bill of materials with official links ([docs/MK2_BOM.md](docs/MK2_BOM.md)).
- **Missions** (`/brief/Mx` → `/run/Mx` → `/result`): nine rail missions, M1 to M9. Drive with analog throttle and brake against a Jev ghost, or watch Jev drive with each decision on the HUD. The simulation is deterministic and a brain knows only what the fitted sensors report ([docs/SIM_MODEL.md](docs/SIM_MODEL.md)).
- **Brain Arena** (`/lab`): Jev, nine LLMs, the rule-based driver and a random driver on identical runs, with latency counted as simulation time. The page also shows how the project was built.
- **Room Race** (`/screen` and `/race`): a big screen shows a QR code; up to 8 phones and 2 Jev bots race the same seed; the server decides the result.
- **Lab Missions** (`/scenarios`): five grid scenarios (maze, warehouse, Mars sample return, house inspection, capture the flag) with the same parts, sensors and battery. Labelled in the UI as a grid simulation.

## Brains compared

Mean score, higher is better. Rail: M1–M9 on one build plus one specialist build, 3 seeds, 30 runs per row ([docs/ARENA.md](docs/ARENA.md)). Lab Missions: 5 scenarios, 3 seeds, 15 runs per row ([docs/ARENA_LAB.md](docs/ARENA_LAB.md)).

| Brain | Rail score | Rail latency p50 | Lab Missions score |
|---|---|---|---|
| Rule-based driver | 554 | 0 ms | 702 |
| Jev (`jev-1.13.0`) | 546 | 250 ms | 694 |
| GPT-6 Luna, the best LLM on the rail among rows run on the same game version | 496 | 853 ms | 482 |
| DeepSeek Flash, the best LLM on Lab Missions | 476 | 817 ms | 510 |
| Random | 41 | 0 ms | 259 |

Over the 810 runs of the benchmark, Jev finishes 62 % with a mean score of 433 and the rule-based driver 63 % with 441 ([docs/BENCHMARK.md](docs/BENCHMARK.md)). Jev does not beat the fixed rules; it stays close to them and answers faster than the other models.

Caveat, as shown on `/lab`: "Our sim, our prompts, 283 runs, 2026-10-10. Not a general model ranking." Two more: the three Claude rows are carried over from an earlier game version and are not comparable, and in places the question tells the brain which option the rules consider correct (finding Q20 in [docs/QA.md](docs/QA.md), open).

## How it was made

- One person and up to six Claude Code sessions on a single checkout of `main`, each owning a set of paths: sim, brain, game, ui, then lab and a master session that orchestrates and tests and writes no feature code.
- A separate asset agent (ChatGPT with Blender) made the models and renders; the human relayed between it and the sessions.
- 292 commits between Friday 20:18 and Saturday 05:22, 91 of them in the hour from 04:00 (git log).
- A gate (`scripts/qa.sh`) rebuilds each candidate commit in a clean worktree: typecheck, unit tests, determinism, balance, a production build and a Playwright smoke run. Seven commits carry a `demo-good-*` tag so far.
- Sessions report each item as "verified" and "not verified", and findings are logged with an owner. The full account is in [docs/SETUP.md](docs/SETUP.md).

## Honest limits

- Nothing was run on a real phone. Touch, frame rate and sound are untested; the gate uses a headless browser, software rendering and the keyboard ([docs/QA.md](docs/QA.md)).
- The physics is one-dimensional and made of formulas, with no steering and no rigid-body engine. Weather factors and several sensor rules are game rules. Lab Missions use a separate grid simulation.
- The arena samples are small (30 runs per row, 9 or fewer for the reasoning models), rows ran on different commits, and finding Q20 above limits what the Jev comparison shows.
- Room Race was tested with bots only, never with more than one person. State lives in server memory: no database, no accounts, no rate limiting.
- The MK-II rover is designed, not built or test-printed. Its 3D kit sits behind a flag and no session has seen it on a real GPU; the newest asset files were uncommitted at the snapshot.

## Docs

- [docs/SETUP.md](docs/SETUP.md): run it, repository map, sessions and tools, the gate, what is simplified, known gaps, timeline.
- [docs/OVERNIGHT_LOG.md](docs/OVERNIGHT_LOG.md): status log of the overnight program, decisions taken, what the human still has to do.
- [docs/QA.md](docs/QA.md): what the gate proves and does not prove, and every finding with its owner and status.
- [docs/SIM_MODEL.md](docs/SIM_MODEL.md): the simulation in plain words, with every number from the code.
- [docs/BRAIN_ARENA.md](docs/BRAIN_ARENA.md): arena rules and contestants. Results: [docs/ARENA.md](docs/ARENA.md), [docs/ARENA_LAB.md](docs/ARENA_LAB.md).
- [docs/MK2_BOM.md](docs/MK2_BOM.md): bill of materials for the real rover.
