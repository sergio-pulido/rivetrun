# RivetRun

You build the body. AI drives it. A mobile-browser game: design a DIY robot, and an AI decision model (Jev) pilots it through terrain missions with every decision visible on screen.

- Spec: [docs/GAME_SPEC.md](docs/GAME_SPEC.md)
- Jev integration notes: [docs/JEV.md](docs/JEV.md)
- Session prompts: [docs/prompts/kickoff-v3.md](docs/prompts/kickoff-v3.md)

Status: **scaffold**. Contracts and v0 data are real; sim, brain and API handlers are typed stubs; pages are placeholders.

## Layout

| Path | What | Owner session |
| - | - | - |
| `packages/contracts` | Zod schemas + inferred types. Single source of truth. Frozen after scaffold. | scaffold |
| `packages/sim` | Deterministic sim (stubs) + `src/data` (terrains, parts, missions, tuning) | sim |
| `packages/brain` | Server-only Jev client (stub) | brain |
| `packages/db` | Drizzle + Postgres (Neon) schema; client is `null` without `DATABASE_URL` | brain |
| `apps/web` | Next.js 16 App Router, React 19, Tailwind 4, three.js via React Three Fiber | render / ui / brain (api) |

Workspace packages export TypeScript source; `apps/web` compiles them through `transpilePackages`, so there is no package build step.

## Requirements

Node >= 20 and pnpm 10 (`packageManager` is pinned in `package.json`).

## Commands

Run from the repo root. All of these were run on the scaffold branch.

```sh
pnpm install      # install the workspace
pnpm typecheck    # tsc --noEmit in every package
pnpm lint         # eslint in every package
pnpm test         # vitest in every package
pnpm build        # next build (apps/web)
```

Run the production build locally (this is how the scaffold was checked at 390 px):

```sh
pnpm --filter @rivetrun/web exec next start -p 3111
```

`pnpm dev` runs `next dev` through turbo (http://localhost:3000). It is wired but was not exercised during the scaffold.

## Environment

Copy `.env.example` to `apps/web/.env.local` and fill in values. Both are optional for the scaffold.

| Variable | Used by | Without it |
| - | - | - |
| `JEV_API_KEY` | `packages/brain` (server only) | Jev calls fail; the heuristic decides with `fallback: true` |
| `DATABASE_URL` | `packages/db` | Runs are not stored, leaderboard is empty, stats return 0 |

Never commit `.env*` files (only `.env.example` is tracked). The Jev key must never reach the client.

## Routes

Pages: `/`, `/workshop`, `/brief/[mission]`, `/run/[mission]`, `/result`, `/leaderboard`, `/screen`.
API (Node runtime; validate with contracts, then return 501 until the brain session lands): `POST /api/decide`, `POST /api/runs`, `GET /api/leaderboard?mission=M5`, `GET /api/stats`.

## Deploy

Target: Vercel, project root directory `apps/web`. **Not deployed yet**: deploy is deferred to the integration session, so no deploy command has been run.
