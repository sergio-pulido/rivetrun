# RivetRun — Overnight log (Sat 10 Oct, 03:45 → 10:00)

Written by [MASTER] for the human. Newest status first. Program: docs/OVERNIGHT.md. Findings: docs/QA.md ("Overnight findings").

## What the human must do
- 07:30: build the demo from the latest tag, not from main: `pnpm demo:stable -- --ref "$(git tag -l 'demo-good-*' | sort | tail -1)"`. Serving a tag has not been tested by any session (brain tested `--ref <sha> --build-only` only): check the `/screen` footer shows "build <sha> · <ref>".
- One look on a real phone or a visible Chrome tab at `/run/M1?robot=mk2&fps=1`: the frame-rate badge says whether the MK-II kit loaded or fell back to the procedural robot. No session can see this (headless Chromium renders at 0–3 fps and the kit times out there).
- Uncommitted asset files in the checkout (`apps/web/public/models/**`, `apps/web/public/renders/**`, `assets/**`: the Blender agent's) are not in any tag. Commit them, or the demo built from a tag ships the older models.

## Decisions taken
- 03:50 · The QA gate checks the commit, not the checkout: typecheck, unit tests, sim determinism, balance and a production build run in a clean worktree of committed HEAD (`../rivetrun-qa`). Reason: with five sessions editing one checkout, "works here" and "works when built from the tag" differ. The e2e still runs on the dev server on :3000, as the program says; the tag message records how many source files were uncommitted when it ran.
- 03:50 · Playwright lives in `e2e/` with its own `package.json`, outside the pnpm workspace. Reason: the root lockfile stays untouched, so `pnpm demo:stable` (frozen lockfile) cannot break because of QA tooling.
- 03:50 · Screenshots (`e2e/screens/<HHMM>/`) and gate logs (`e2e/out/<HHMM>/`) are not committed: about 5 MB per cycle.
- 03:50 · Tags are annotated, so each `demo-good-*` carries what was checked.
- 03:57 · [SIM] announces any new union member (terrain, RunEvent type, trigger) to [GAME], [BRAIN] and [UI] before committing it, and M8/M9 enter `MISSION_IDS` only after game and brain confirm `snow` and `gust` are handled. Reason: the first weather commits turned committed main red in other owners' paths (Q1, Q2).
- 03:58 · [UI] re-queued to OVN-UI-4 then OVN-UI-5; OVN-UI-3 waits for the Lab block of the arena JSON. Brief chip keeps the weather word only; the numbers live in the Weather card.
- 03:58 · [LAB]: `/scenarios` stays off the Home screen until the gate has seen it green.

## Status log
