# [UI] Handover — the screens (Sat 10 Oct, 10:00)

For the human who demos and for the README. Scope: Home, Workshop, part sheets, Build it for real, Brief, Result, /lab; `apps/web/src/ui`, `apps/web/src/state` (not `run.ts`), `apps/web/app/{page,workshop,brief,result,lab}`. Numbers on these screens come from `packages/sim` and from the other sessions' files; the UI words them.

## Built tonight
- Strategy: part sheet "Gives your rover" / "Good for"; Brief scenario strip with a verdict per segment; Test run in Workshop and Brief with the parts that fix a failure. `ac41277` `06b53db` `9082d98`
- Sensing: "What your robot can sense" (Workshop, Brief) in the sim's `senses()` words; Test run reasons name the missing sensor. `c7eb7c6` `2b5b63e` `5cd7ede`
- Brief: objectives (scan zones, the sim's can-scan verdict, the sensors that would fix it with unlock costs), weather card from `weatherEffects`, air rule, full-throttle warning, "Jev is ready" line, reordered and shortened. `7a180bd` `573ff51` `c737082` `36ac2b1` `cc36e5a` `625da5b` `dd0b347`
- Result: decision summary, reaction duel paired by event id, v3 breakdown (scans, wheelspin, damage by cause, biggest loss, try next; a DNF says "not finishing"). `f0008d0` `7814bf8` `7e19e69` `f0f6852` `7d8fd9f`
- Replay: personal bests per mission and robot, "Race your best" ghost, share card PNG with time vs Jev. `435c338` `ebdbc43`
- Build it for real: "My parts" ticks with "You can build this today"; names wrap. `5eaa447` `540f2ed`
- /lab: Brain Arena (rail and Lab Missions tabs, verdict and facts-only scores in one cell, humans, notes above the table, rows with fewer runs or another game version marked), "How it was built", link to /scenarios. `a5b3af2` `23e8b14` `371a80d` `be2dc8c` `677676d` `1615aa1` `fa32b42`
- Honesty: the sim's `SIMPLIFICATIONS` sentences on the screens they belong to; approximate-render caption. `90d1f73` `401a4b4`
- Part sheets: weather notes; 3D toggle decodes meshopt, no Draco; game parts named after BOM items get their real part. `573ff51` `08e4c85` `1f4a960`
- First-run coach marks for the v3 sliders and scan pads; app icon (the favicon 404). `3ed48f0` `fe2355c`

## Measured
- 284 web tests and the repo typecheck green from the root at `f952b48` (6 of 6 tasks).
- Brief on M3 at 390×844: 1405 px tall, about 1.7 screens; Drive stays in the sticky footer.

## Simplified or assumed
- Sessions in "How it was built" are told apart by which files a commit touched: every session commits under one git author.
- Personal bests, the inventory and the stored ghost live in this browser's localStorage only. The latest six ghosts are kept.
- "One finished run pays for them: Garage Test is the shortest" comes from a test run by the built-in driver, not from the player's driving.
- Test run and the Brief's verdicts are the built-in driver on the mission's seed; the card says so.
- The Haiku "not run" reason on /lab keeps the HTTP status and drops "the account has no credit left". The human has not said whether to show it.
- Rail arena rows for Claude are from gameplay 3; the page marks them, it does not re-rank them.
- The coach mark's "30 %" is typed in; [GAME] exports `TOUCH_START` and the mark should read it (open, block item 0).

## Nobody has verified
- Anything on the Result that needs a finished run, by me: the new-best line, the breakdown card, the reaction duel, the DNF wording, the share card image, "Race your best" end to end. My pane delivers no animation frames, so I never completed a run. Unit and render tests only; [MASTER]'s e2e has screenshots of some.
- "Jev is getting ready" and "Jev could not drive this one" live: every Brief I opened was already ready.
- The tokens table on /lab: there is no `docs/tokens.json`.
- "How it was built" in the demo build: it runs `git log` on the server.
- Tapping a "fit this sensor" chip through to an unlock; a human on another build in the arena list (amber name).
- Any screen on a real phone.

## Open in my block when this was written
`/scenarios` in the header menu; `TOUCH_START` from `@/game`; the review round (R) on `src/ui` and `src/state`; OVN-UI-8 (Share and Episode tested with a stored run); OVN-UI-9 (shopping list CSV); OVN-UI-10 (live Jev stats on /lab); OVN-UI-11 (Home rail with nine missions); the copy pass.

## If this breaks at the demo
1. **/lab shows "No arena results yet" or no commit chart.** The page reads `docs/arena-results.json` and runs `git log` from the repo root on each request. Check the server was started from the checkout (`ls docs/arena-results.json`), reload. The rest of /lab still renders; nothing else depends on it.
2. **A phone's Brief says "Jev is getting ready…" and stays there, or the Result says the rival was HEURISTIC.** Jev's ghost was not ready or the server could not reach Jev. The run is valid: the visitor raced the built-in driver, and the Result says so. Wait a few seconds on the Brief before Drive, or switch to "Jev drives".
3. **"Race your best", the personal best or "My parts" is missing on a visitor's phone.** They live in that browser's storage: a private tab, cleared site data or another phone starts empty. Nothing is lost on the server. "Race Jev" always works. If Share shows no image, tap Share once and use "Save the share card (PNG)".
