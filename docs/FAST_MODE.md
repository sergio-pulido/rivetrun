# RivetRun — FAST MODE

Overrides every process rule in docs/prompts/kickoff-v3.md. The game design in docs/GAME_SPEC.md still applies.

## Rules
- Localhost proof of concept for a hackathon. Speed and visual quality beat everything else.
- Everyone works directly on `main` in /Users/nectios/workspace-os/hackathons/rivetrun. No branches, no worktrees, no PRs, no deploys.
- Commit early and often, only your own paths: `git add <your paths> && git commit -m "..."`. Never `git add -A`. Never reset, rebase, stash or checkout files you do not own.
- No required tests, lint or typecheck gates. Fix only what breaks `pnpm dev` or the game.
- No database: runs and leaderboard live in memory in the Next server (module-level arrays/Maps).
- No rate limiting, no security hardening. JEV_API_KEY lives in apps/web/.env.local only.
- packages/contracts may change when needed: additive changes only, so other sessions keep compiling, and one line per change in docs/CHANGES.md.
- One dev server only: the human runs `pnpm dev` on http://localhost:3000. Never start another server, watch mode or interactive CLI. Use the running one to check your work.
- Visual quality is judged: every screen must look finished on a phone (390×844 portrait).

## Ownership (updated 20:55)
- sim: packages/sim/**, scripts/balance.ts, apps/web/app/run/**, apps/web/src/state/run.ts (run page integration)
- brain: packages/brain/**, apps/web/app/api/**, apps/web/src/brain/**, scripts/jev-smoke.ts, apps/web/app/leaderboard/**, apps/web/app/screen/**
- game: apps/web/src/game/**
- ui: every other page and layout under apps/web/app (Home, Workshop, Brief, Result), apps/web/src/ui/**, apps/web/src/state/** except state/run.ts

## Milestones
- M-1 (~21:45): M1 playable end to end on localhost with the heuristic brain.
- M-2 (23:00): Jev driving with HUD, ghosts, Workshop, Result with Brain Duel table.
