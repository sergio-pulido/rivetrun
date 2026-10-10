# RivetRun — Overnight program (Sat 03:45 → 10:00)

Marker: RR-OVERNIGHT

Goal: by the morning RivetRun is four things that hold together:
1. A maker vehicle lab: real parts, real specs, buildable (docs/MK2_BOM.md).
2. A vehicle simulator: physics, terrain and weather that the parts and sensors actually change.
3. A brain arena: Jev against other models and humans on identical runs (docs/BRAIN_ARENA.md).
4. An exciting game: fine control, visible decisions, reasons to replay.

Specs this program builds on: docs/GAMEPLAY_V3_CONTROLS.md (RR-GAMEPLAY-V3), docs/BRAIN_V3_SENSING.md (RR-BRAIN-V3), docs/BRAIN_ARENA.md (RR-ARENA), docs/FAST_MODE.md, docs/DEMO_PLAN.md.

## Sessions
| Session | Role | Owns |
|---|---|---|
| [MASTER] (new) | Orchestrator and QA. Writes no feature code. | docs/OVERNIGHT.md, docs/OVERNIGHT_LOG.md, docs/QA.md, e2e/**, scripts/qa.sh, git tags demo-good-* |
| [SIM] | Physics, terrain, weather, missions, heuristic driver, balance | as in docs/FAST_MODE.md |
| [GAME] | 3D, HUD, controls, VFX, sound, telemetry drawer | as in docs/FAST_MODE.md |
| [UI] | Screens, Workshop, Brief, Result, /lab, inventory | as in docs/FAST_MODE.md |
| [BRAIN] | Jev, arena adapters and runner, Room Race, big screen, APIs | as in docs/FAST_MODE.md |
| [LAB] (new) | Lab Missions: top-down grid scenarios | packages/lab/**, apps/web/app/scenarios/**, apps/web/src/lab/** |
| ChatGPT · Blender | Assets. Not reachable by the sessions; the human relays. | assets/**, apps/web/public/models/**, apps/web/public/renders/** |

## Protocol
Workers (every session except [MASTER]):
1. `git pull --no-rebase --no-edit`. Take the top open item of your queue below (or the one [MASTER] sent you).
2. Implement. Unit tests for logic, `tsc` clean for your paths, a headless check of every screen you touched (390×844 and, for /screen, 1280×720).
3. Commit with an explicit pathspec: `git add <paths> && git commit -m "[OVN-<id>] <msg>" -- <paths>`, then `git push || (git pull --no-rebase --no-edit && git push)`. Contract changes are additive and logged in docs/CHANGES.md.
4. Message [MASTER]: `done OVN-<id> <hash> · verified: <what> · not verified: <what>`. Then take the next item without waiting.
5. Blocked on another owner: message them and [MASTER], take your next item.
6. Never edit another owner's paths; ask the owner.

[MASTER], each cycle (about every 20–30 minutes, and whenever a worker reports):
1. Pull. Read new commits and docs/CHANGES.md.
2. Run scripts/qa.sh (create it in the first cycle): typecheck all packages, all unit tests, sim determinism and balance checks, e2e smoke (below). Once an hour also run the demo build (`pnpm demo:stable -- --build-only`) to prove committed main builds.
3. All green: tag `demo-good-<HHMM>` on the tested commit and push the tag. Red: message the owner with the failing check and the commit; that owner fixes before taking new items.
4. Look at the screens (headless screenshots in e2e/screens/<HHMM>/) against each item's acceptance line. File problems in docs/QA.md with an owner and send them.
5. Re-prioritise the queues in this file; message every idle worker its next item.
6. Every 2 hours, and at 09:45, append a short status to docs/OVERNIGHT_LOG.md for the human: what landed, what is broken, latest demo-good tag, decisions taken.

e2e smoke (Playwright, headless Chromium from /opt or the local install): Home, Workshop, Brief M1, a full Drive run on M1 with scripted input to the result screen, Room Race with two JEV bots to results on /screen, /lab, one Lab Mission start to finish. Screenshots at 390×844 and 1280×720.

## Guardrails
- The human owns :3001, `pnpm demo:stable` serving and the tunnel. [MASTER] may restart the :3000 dev server only if it is down or reload-looping.
- No force push, no history rewrite, no deleting branches or tags, no stash, no destructive commands, no changes to secrets or .env files. API keys are read from apps/web/.env.local and never printed or logged.
- Commits authored as sergio.pulido@alodai.com. No other identity anywhere.
- Big new features land behind a flag or on their own route until [MASTER] has seen them green; the existing 60-second path must keep working at every tag.
- From 11:00: fixes and polish only. 14:00: feature freeze (docs/DEMO_PLAN.md).
- Honesty: anything simplified is labelled as such in the UI (e.g. "Lab Missions use a grid simulation").

## Queues
Items are in priority order. IDs are OVN-<owner>-<n>.

### Wave 0 — finish what is in flight (now → 05:30)
- OVN-SIM-1: RR-GAMEPLAY-V3 P1 physics: analog input, traction and wheelspin, grip-limited braking, safe speeds and impact damage, scan zones. Accept: tests for each; a full-throttle run on M3 mud is slower than a feathered one.
- OVN-GAME-1: v3 controls: throttle and brake sliders 0..1 with the thumb gauge, SLIP and wheel spin, next-hazard warning with safe speed, scan-zone pads with a progress ring. Accept: a scripted e2e run brakes into an M1 scan zone and completes the scan.
- OVN-UI-1: Brief objectives (scan zones and the sensor each needs); "My parts" inventory; approximate-render caption. Accept: inventory survives reload; "You can build this today" appears when every line is owned.
- OVN-BRAIN-0 (first, small): `pnpm demo:stable -- --ref <git ref>` builds and serves that ref (e.g. the latest demo-good-* tag) instead of main. Accept: building a tag works and the served page shows that commit.
- OVN-BRAIN-1: arena with OpenAI and DeepSeek fast and mid tiers; Opus on 1 seed under the US$10 cap; re-run Haiku and Sonnet with the same prompt version so the table is comparable; per-event latency ids on ghost decisions. Accept: docs/arena-results.json has every configured contestant with the same prompt hash.

### Wave 1 — weather and atmosphere (05:30 → 07:30)
Grounded in physics; every assumption written in docs/CHANGES.md.
- OVN-SIM-2: wind (head/tail wind as aerodynamic drag on relative speed, gusts as events); rain (lower grip on hard surfaces, puddles); snow (new terrain: low grip and sinkage); cold (lower usable battery capacity, as LiPo packs lose capacity in the cold); fog and night (shorter camera range; lidar unaffected by darkness, degraded in heavy rain or snow). Weather is per mission and known from the mission plan; gusts and visibility are sensed through the build's sensors. Accept: each effect has a test and changes a heuristic run measurably.
- OVN-SIM-3: two new missions using weather: M8 "Storm Ridge" (wind, rain, a ridge with gusts) and M9 "Polar Night" (snow, cold, darkness). Night makes camera_module_3_noir and ambient_light_veml7700 worth unlocking: make them playable with their real ranges where the BoM gives them.
- OVN-GAME-2: weather visuals that stay above 50 fps on a phone: rain, snow, wind streaks and dust, fog, night lighting with the robot's own lights; HUD weather chip.
- OVN-BRAIN-2: weather in the Jev question (as the brain can know it: mission plan plus sensed values); /screen shows the weather per race.
- OVN-UI-2: Brief weather card and its effect on the build ("Cold: usable capacity down"); Workshop part sheets mention weather where a part matters (NoIR at night, waterproof case in rain).

### Wave 2 — Lab Missions: AI and robotics scenarios (06:00 → 09:30)
A second simulation for tasks a rail cannot express: top-down grid worlds with the same parts, sensors, battery and brains. Labelled in the UI as a grid simulation. Route: /scenarios.
- OVN-LAB-1: packages/lab: deterministic grid sim (tiles with terrain cost, walls, doors, ramps), robot speed and energy from the build (motor, battery, locomotion), fog of war = sensor coverage (lidar reveals walls in range, camera reveals objects and labels, ultrasonic only adjacent walls, no sensor = only the tile you are on), event-driven decisions (junction reached, object sensed, battery projection, objective done). Same Observation idea and trigger types as RR-BRAIN-V3. Unit tests including determinism.
- OVN-LAB-2: five scenarios, each with a clear objective and score:
  - Maze: reach the exit in an unknown maze. Lidar vs camera vs blind shows clearly.
  - Warehouse delivery: pick parcels, deliver them to bays, avoid moving forklifts, within a battery budget.
  - Mars sample return: collect 3 soil samples (needs the moisture probe), return to the lander before the battery runs out; a dust storm cuts camera range.
  - House inspection: visit rooms, scan checkpoints with the camera, avoid the stairs (drops).
  - Capture the flag: your robot against a Jev robot on the same map; first to bring the flag home.
- OVN-LAB-3: /scenarios UI: scenario picker, top-down renderer (2D canvas or SVG, phone-first), tap-to-move controls (arrow pad), objective tracker, decision thread for Jev; result with score and decisions.
- OVN-BRAIN-3: the brains on Lab Missions: Jev question for grid decisions; the arena runner gets a Lab track (fast tier only, 3 seeds per scenario); results into the same arena JSON under "lab".
- OVN-UI-3: /lab Brain Arena gets a "Lab Missions" tab from that JSON.

### Wave 3 — depth, excitement and polish (from 07:30)
- OVN-GAME-3: v3 P2 air control (pitch from throttle and brake in the air, landing grades) and the charged jump.
- OVN-SIM-4: v3 P2 physics for air control and the charged jump; re-run docs/BENCHMARK.md on the new physics.
- OVN-UI-4: replay pull: personal bests per mission and build, "beat your ghost" option, share card with time vs Jev.
- OVN-GAME-4: camera and feel: landing impacts, slip spray, speed lines, sound for slip, impacts and scans; phone frame-rate check with ?fps=1 on every mission.
- OVN-BRAIN-4: Room Race with 8 phones + bots: layout check at 8 lanes on /screen, chips placement, results consistency.
- OVN-UI-5: /lab "How it was built": sessions and roles, commits per session over time, benchmark and arena, tokens (docs/tokens.json when the human adds it).

### Wave 4 — release candidate (09:30 → 11:00)
- [MASTER]: full QA, final demo-good tag before 10:00, docs/OVERNIGHT_LOG.md final status, docs/SETUP.md and README updated from the real repo (roles, models, tools, what is implemented vs simplified).
- Every worker: fix what [MASTER] files; no new features after 11:00.

## For the human in the morning
- 07:30: build the demo from the latest tag, not from main: `git tag -l 'demo-good-*' | sort | tail -1` gives the tag. [BRAIN] adds a `--ref <tag>` option to `pnpm demo:stable` in Wave 0 (OVN-BRAIN-0).
- 08:15: stranger test; note where people hesitate; pass it to [MASTER].
- Read docs/OVERNIGHT_LOG.md first.
