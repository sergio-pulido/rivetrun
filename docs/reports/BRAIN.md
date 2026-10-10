# [BRAIN] handover — 10 Oct, for the 16:15 demo

Owner of: `packages/brain`, `apps/web/app/api`, `apps/web/app/race`, `apps/web/app/screen`, `apps/web/src/brain`, `scripts/demo-stable.mjs`, `scripts/tunnel.mjs`, `scripts/race-load.mjs`.

## Built tonight
- `pnpm demo:stable -- --ref <tag>` builds and serves any git ref; the big screen shows the served commit (4e29cd8, 7b2bd6a).
- Brain Arena, rail: 12 rows on one prompt, gameplay 4, per-row game version and cost (6ddf495, 757f0c8). `docs/ARENA.md`.
- Brain Arena, Lab Missions: Jev and the fast tier on the five scenarios (9a09f8d, f98a59e, 757f0c8). `docs/ARENA_LAB.md`.
- Q20, honesty: both tables say that the question states the fixed rules' verdict, and carry a second column measured on a facts-only question (e15fd2f, 6ee41df, 1a70ee7, 8e56a29). Result: Jev 546 with the verdict, 436 on facts alone; Lab 704 against 581.
- Weather in the Jev question and on /screen (4ae2d81). Jev now eases in and scans on M1 (43a7201).
- Room Race: fits 8 phones + 2 bots (428640a); race phones show the driver's alerts (f4ad682); a missed scan costs its 10 s in race time (bf0a3ce); a phone that loses signal or reloads keeps its seat (23bc724).
- Fallback path tested end to end with a switch that makes Jev fail or answer late (bb08914); after two late answers the fixed rules decide at once for 8 s (6fcc8c1).
- `/api/decide` shares one Jev call between identical questions in flight (b5cda43).
- Jev ghost readiness: `/api/ghost?...&status=1`, next mission and M5 warmed ahead (47a1147, e15fd2f).
- `POST /api/lab/decide[?verdicts=0]`: Jev live on /scenarios (7aa92cb, 9a9fc24).
- Humans in the arena: a Drive run counts only when the server replays its input log to the same result; `GET /api/arena/humans` (bbd5f38).
- Live Arena race: `/screen?room=CODE&arena=1`, one bot per model on the same seed (69a6a5c).
- Idle big screen: the demo loop plays under a short leaderboard (f203e1c).
- Review round fixes: 2 MB body limit, ghost queue bound, mission in the decision cache key, stale snapshots dropped (6fcc8c1, b7d1fcf).

## Simplified or assumed
- Everything on the server is in memory: rooms, leaderboard, ghosts, caches, human arena rows. A server restart empties all of it.
- Room Race trusts the phone: "I finished", the position and the missed-scan count come from the phone. Only the clock is the server's.
- Host actions on a room (start, reset, remove, add bot) need no password: anyone with the four-letter code can send them.
- The arena is our sim and our prompts, 30 runs per row (reasoning rows 9, Claude rows carried from gameplay 3: the Anthropic account had no credit). Not a general model ranking.
- The game's Jev question tells Jev which option the fixed rules rate as correct. The game keeps it because it plays better.
- A reload mid-race restarts that phone from the start line on the same clock; it does not resume.
- Human arena rows use Drive's seed, not the arena's three seeds.

## Not verified by anyone
- Anything on a real phone on real wifi tonight (all checks were headless Chromium or curl on the dev server :3000).
- The fault switch, the live Arena race and the ghost warm-up on the production build.
- A signal loss exactly at the finish line (the 18 s retry was read, not exercised).
- The polling fallback through the Cloudflare tunnel after tonight's changes to it.
- A run submitted from the Result page being replayed (only a race run and the route tests were).
- `/lab` rendering of the facts-only column and the human rows (UI's page).

## If this breaks at the demo
1. **Jev is down or slow.** On screen: the HUD and /screen say FALLBACK; robots still drive. Do nothing: the fixed rules take over by themselves and Jev is asked again every 8 s. To show it on purpose on the dev server: in the browser console `document.cookie = 'rr_jev_fault=fail; path=/'` (remove with `max-age=0`). Check Jev from the repo root with `node --experimental-strip-types --env-file-if-exists=apps/web/.env.local scripts/jev-smoke.ts`.
2. **Phones cannot join or the big screen shows no robots moving.** On screen: "Room not found", or lanes frozen at 0 %. The server restarted and the room is gone (memory only). Press "New race" / open `/screen` and "Start a Room Race" again; phones scan the new code. If phones load but never become interactive on wifi, use the tunnel URL (`pnpm tunnel`) instead of the LAN address.
3. **A race does not end.** On screen: one lane still driving, the clock running. It ends by itself: 45 s after the first finisher ("RACE CLOSES IN …") or 180 s after the start; a silent phone is dropped after 20 s as "DNF · disconnected". To cut it short press ABORT on the big screen.

Spending: the arena cost about US$7.6 in total tonight. The live Arena race stops calling paid models after US$1 per server start (`ARENA_LIVE_CAP_USD`); `GET /api/arena/decide` shows the running total.
