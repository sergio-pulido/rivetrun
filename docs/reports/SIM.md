# [SIM] Handover — the simulation (Sat 10 Oct, 06:40)

For the human who demos at 16:15 and for the README. Scope: `packages/sim`, `packages/contracts`, the run page (`apps/web/app/run`), `scripts/`. The model in words: `docs/SIM_MODEL.md`. Every change: `docs/CHANGES.md`.

## Built tonight
- Reaction duel data: stable event ids shared by the human run and the ghost, the input log, `runHeadless` without fallback. `d966fc9`
- Weather: wind as drag with seeded gusts, cold by temperature, fog / night / snowfall on sensor range, snow as a surface; `weatherEffects` and `partWeatherNotes` for the Brief. `9d3db6c` `c9f6f27` `4c97762`
- M8 Storm Ridge, M9 Polar Night, the NoIR camera, the light sensor, the night scan rule. `e8e60f5`
- Air: the robot levels itself for every driver, landing grades, the charged piston jump. `2f9a3bb` `0e802de`
- Stuck countdown with the command that frees the build; a visitor reading the screen is not stuck (30 s to the first throttle). `125bda4` `b916210` `dc0904c`
- A change of ground is told to the brain again at 2 m; the rule-based driver plans its arrival on rock. `17ba1ac` `1a808a5`
- Result data: losses ranked in points, the biggest loss, landings by grade, a why-line and a try-next line for every run. `d88704e` `43f1d8e` `d0e8527`
- Humans in the arena: a logged Drive run replays to the identical outcome; episodes carry their versions. `a8b0d52` `ad7a909`
- Facts for a question without verdicts: per option, what it does about the scan pad, the contact speed against the safe speed, time and charge at the finish. `8d228f3` `d6c8048`
- Tests that guard the claims: a leak test (nothing beyond sensor range reaches a brain, also in bad weather), a fuzz test (500 random builds and inputs), the stranger drivers, a review round with regression tests. `04f0e02` `35a0092` `a39bea1` `2915915` `9759fe6`
- Docs: `docs/SIM_MODEL.md`, the "What the game is now" section of `docs/GAME_SPEC.md`, `docs/BENCHMARK.md` re-run. `5019c16` `88f5fca` `c241dc4` `0729fec`

## Measured
- 103 sim unit tests green at `d0e8527`; a soak of 10 000 fuzz runs on 20 seeds found no violation.
- Jev against the fixed rules, default build, 3 seeds: within 40 points on every mission, scans as often; ahead by 82 on Deep Water with the Deep Diver.
- On a question with facts and no verdict, Jev scans (12 of the rules' 15 in [BRAIN]'s arena) but scores about 110 points lower: it drives a steadier pace.
- Speed: `assessBuild` under 70 ms, a full rule-based run under 130 ms.

## Simplified or assumed
The list the screens show is `SIMPLIFICATIONS` in `packages/sim/src/simplifications.ts` (21 sentences). The ones a judge may ask about:
- The track is one dimension: no steering. Formulas, not a rigid-body engine.
- Wind is drag along the track on an estimated 0.04 m²; cold is −1 % usable battery per °C below 20 °C; weather factors on sensor range are chosen for the game.
- The NoIR camera's 6 m range is the game camera's (the maker gives none); headlights from the light sensor are a game rule.
- Self-levelling in the air is a game rule, made for fairness: with it, a player's air input can only make a flat landing worse.
- Lab Missions use a separate grid simulation with the same robot values.

## Nobody has verified
- Anything on a real phone. My browser checks ran in a hidden desktop pane with keyboard events, no touch, often no 3D.
- A jump timed by hand onto a gap after the landing fix: the landing reads CLEAN on screen, but my scripted jumps never cleared a gap.
- M4 and M9 driven by following the screen; M8 following the screen (my script stopped short of the scan pad).
- A human episode from a real player replayed in the arena; logs recorded before `9759fe6` are refused by design.
- `docs/BENCHMARK.md`: the Jev rows were measured at `17ba1ac`, before [BRAIN]'s later question changes.

## If this breaks at the demo
1. **A room of first-timers ends "DNF · stuck" on M5 (the Room Challenge).** On screen: "STUCK IN 6 s · TAP CLIMB", then the result says stuck on the mud slope. Full throttle alone does not finish M5. Say it before the race: "when it says TAP CLIMB, tap it and leave it on". That finishes in about 62 s. Or run the room on M1, which full throttle finishes.
2. **A run ends before the player touched anything, or a landing reads HARD with the throttle simply held.** Both were fixed this morning (`dc0904c`, `9759fe6`); seeing them means the demo is built from an older tag. Check `git tag -l 'demo-good-*' | sort | tail -1` is later than 06:00 and rebuild from it.
3. **The Jev rival is missing or the result says "HEURISTIC drove the rival".** The ghost did not arrive within 1.5 s and the run fell back to the fixed rules, which is by design and the run is still valid. Reload the Brief once so the ghost is fetched again; if it stays, Jev or the network is slow and that is [BRAIN]'s runbook (`docs/DEMO_RUNBOOK.md`).

Open with other owners at the time of writing: four HUD findings with [GAME] (no warning before rough ground, a scan prompt for a zone the build cannot scan, no prompt before deep water, no hint when stopped short of a pad) and one with [UI] (the Result's "biggest loss" on a run that did not finish).
