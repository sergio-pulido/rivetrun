# RivetRun — demo runbook (one page, for the venue)

Everything runs from the repo root on the demo laptop. Two terminals stay open: **A** (the server) and **B** (spare).
Keys live in `apps/web/.env.local` (`JEV_API_KEY`; for the live Arena also `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`). Never show that file on the projector.

## Start, in this order

1. **Pick the build.** The last commit the overnight gate passed:
   ```bash
   git fetch --tags && git tag -l 'demo-good-*' | sort | tail -1
   ```
2. **Build and serve it with a public URL** (terminal A; takes 2–3 minutes; leave it running):
   ```bash
   pnpm demo:stable -- --ref "$(git tag -l 'demo-good-*' | sort | tail -1)" --tunnel
   ```
   It prints `Stable demo of <commit> on http://localhost:3001 · public: https://….trycloudflare.com · big screen: …/screen`.
   On venue wifi that phones can reach directly, leave out `--tunnel`: the QR then points at the laptop's own address.
3. **Projector:** open the printed `…/screen` URL in a normal browser window, full screen (F11 / ⌃⌘F). Keep that tab in front: the JEV bots run inside it.
4. **Room Race:** on the big screen press **Start a Room Race**. Phones scan the QR, type a name, tap **Join the race**. Press **Open build phase**, then **Start now** when people are ready.

## Healthy in ten seconds

| Check | How | Good |
| - | - | - |
| The right build is served | `curl -s localhost:3001/api/version` | `commit` is the tag's commit, `ref` is the tag |
| Jev answers | `node --experimental-strip-types --env-file-if-exists=apps/web/.env.local scripts/jev-smoke.ts` | three answers, each well under 1 s |
| The QR is reachable | scan it with your own phone on mobile data | the Home page loads and the robot appears |
| A phone can race | join the room from that phone | its name appears on the big screen within a second |

## When something goes wrong

- **Jev is slow or down.** The HUD and the big screen say FALLBACK and the robots keep driving on the fixed rules; Jev is asked again every 8 s. Nothing to do. Say it out loud: this is the designed behaviour.
- **The tunnel drops** (phones on mobile data stop loading; terminal A shows cloudflared errors). Stop terminal A with Ctrl+C and run step 2 again: the public URL **changes**, so reload the big screen and let people scan the new QR. Rooms and scores are in memory and are lost by the restart.
- **A room is stuck** (a lane frozen, the clock running). It ends by itself: 45 s after the first finisher, 180 s after the start at the latest; a silent phone becomes "DNF · disconnected" after 20 s. To cut it short press **Abort**, then **New race**.
- **"Room not found" on phones.** The server restarted (memory only). On the big screen open `/screen`, press **Start a Room Race**, scan the new code.
- **The laptop's address changed** (new wifi, QR points nowhere). With `--tunnel` nothing changes. Without it: stop terminal A and run step 2 again; the QR is rebuilt for the new address. A fixed address can be forced with `NEXT_PUBLIC_SITE_URL=http://<address>:3001 pnpm demo:stable -- --ref <tag>`.
- **A phone shows a blank or "3D view unavailable" run view.** The run still works: the gauges, pedals and the result are live. Tap **Reload** on the panel; if it stays, that phone has no WebGL and plays without the 3D view. In a race a reload keeps the seat but restarts that robot from the start line.
- **A phone lost signal mid-race.** Leave it: the run continues on the phone and its result is sent for 18 s after it ends. More than 20 s of silence is "DNF · disconnected".
- **The build of a tag fails.** `demo:stable` keeps serving the last build that worked and says so; pick the previous tag (`git tag -l 'demo-good-*' | sort | tail -2 | head -1`).

## Optional: the live Arena race

One bot per AI model on the same robot and seed, each lane showing the model and its response time.

1. Open a room as usual, then add `&arena=1` to the big screen's address: `…/screen?room=CODE&arena=1`.
2. The host bar offers **+ Jev**, **+ GPT-6 Luna**, **+ DeepSeek Flash**, **+ GPT-5 nano**, **+ Fixed rules** (four at most). A model whose key is missing or whose account has no credit is not offered; a small line says which and why.
3. **Open build phase → Start now.**

It needs the provider keys in `apps/web/.env.local` **before** step 2 of the start (the file is copied into the build). It costs about one US cent per race and the server stops calling paid models after US$1 since its start (`ARENA_LIVE_CAP_USD`); `curl -s localhost:3001/api/arena/decide` shows the running total and which models are available.

## Not for the demo laptop

- `pnpm dev` (port 3000) is the development server: slower, and it shows an "Issues" badge over the bottom-left corner.
- The test switch that makes Jev fail (`rr_jev_fault` cookie) is off in the stable build.
- The demo keeps rooms, scores and ghosts in memory: nothing survives a restart of the server.
