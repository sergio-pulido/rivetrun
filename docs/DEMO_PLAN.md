# RivetRun — Demo plan (Sat 10 Oct)

Feature freeze 14:00 · rehearsal 15:30 · code freeze 16:00 · demos 16:15.
Judged on: is it good, is it finished, is it original, how hard the agents were pushed.

## Must work at 16:15
- QR on the big screen → tunnel URL → a phone joins in under 10 s on venue wifi or 4G.
- The 60-second path works for a stranger with zero instructions.
- Room Race with 10+ phones: one consistent result (order, times, DNF reasons) on every screen.
- Jev unavailable or slow → heuristic drives, HUD says FALLBACK, the game never stalls.
- Big screen idle → attract mode loop.

## Saturday work (owner → items, in order)

### brain
1. Race results: single source of truth across big screen and phones (started Friday night).
2. `pnpm demo:stable`: build and serve from a separate worktree of committed `main` (`../rivetrun-demo`), so in-progress edits never reach the demo. Tunnel + NEXT_PUBLIC_SITE_URL wired to it.
3. Jev load plan for ~70 phones: cache, request coalescing, smooth fallback. Measure with 30 bots.
4. Room Race results logged as episodes; AttractCanvas in the /screen lobby.
5. Briefing benchmark → docs/BENCHMARK.md.

### ui
1. First-run coach marks (3, dismissable, shown once): the Brain panel, the ghosts, "Brief your brain".
2. Loading tips while the 3D canvas loads (docs/inputs/tips.json when it lands).
3. `/lab` "How it was built": the 4 agent sessions and their roles, commits per session over time (git log at build time), benchmark table (docs/BENCHMARK.md), tokens (docs/tokens.json), live Jev stats (decisions, p50 latency) from /api/stats.

### game
1. Phone frame-rate check with the human; cut cost if under 50 fps.
2. Landscape pass (laptop / big screen run view): HUD and result cards never cover the robot.
3. Stretch: camera fly-in from the workbench to the track on Deploy.

### sim
1. Continuous QA on the 60-second path and M1–M6; regressions in docs/QA.md with owner.
2. Final docs/SETUP.md from docs/inputs/SETUP-draft.md. Correct roles: brain = Jev client/API, tuning, benchmark, Room Race, big screen; game = 3D scenes, robot, HUD, sound, scout drone, deep water, attract mode; ui = screens, design v1 pass, part sheets, assembly; sim = simulation, data, balance, M6, QA. Timeline from git log, benchmark numbers, tokens.

### human
- 08:15 stranger test: hand the phone to 3 people, note where they hesitate, pass notes to ui.
- Token counts per session → docs/tokens.json.
- Jev quota and rate limits for the demo window.
- 14:00 feature freeze; 15:30 rehearsal (big screen + 3 phones via QR); 16:00 code freeze.
