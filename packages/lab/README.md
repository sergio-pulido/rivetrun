# @rivetrun/lab — Lab Missions

A second simulation for tasks the rail cannot express: top-down grid worlds with the same parts, sensors,
battery and brains (RR-OVERNIGHT, Wave 2). Pure TypeScript, deterministic, no DOM.

## What is simulated, and what is simplified
This is a grid simulation, and the UI says so. One tile is `scenario.tileM` metres.

- **From the build, through the rail's own formulas** (`robot.ts`): speed and electrical draw per tile from
  mass, motor force, grip, rolling resistance, sinkage and slope; battery capacity; contact damage above the
  safe contact speed (the bumper halves it); eco pace is the rail's steady throttle.
- **Simplified**: movement is tile to tile at a steady speed (no acceleration); a ramp costs as a climb in both
  directions; a loaded motor is slower by up to 60 %; a fall or a collision puts the robot back on the tile it
  came from; a forklift turns back for a robot standing in its way and runs into one that drives in front of it.

## Fog of war = sensor coverage
A robot's map holds only what its own sensors have reported (`sensing.ts`).

| Source | Reveals | Reach |
|---|---|---|
| core kit | the tile the robot is on; walls it drives into; the mission plan | — |
| ultrasonic | wall or free on the four tiles next to it | 1 tile |
| ToF | wall or free along one beam ahead | part range |
| lidar | wall or free all round, in line of sight; things that move; exits (a gap in the wall) | part range |
| camera | a cone of ± 45° ahead, in line of sight: labels, ground type, objects, drops | part range |
| scout drone | as the camera, all round; over walls outdoors, line of sight under a ceiling | part range |
| moisture probe | soil samples on the tiles next to it; needed to take one | 1 tile |
| IMU | slope under the robot | — |
| bumper | reports contact; halves contact damage | — |

A ranger cannot tell a drop (stairs) or a ramp from flat floor, and gives no labels: a lidar-only robot falls
down stairs a camera would have seen, and has to drive onto a parcel to find it.

## Decisions are event-driven (RR-BRAIN-V3)
The last command holds. A decision is asked only when a trigger fires, with the rail's trigger kinds:
`start` · perception (`junction_reached`, `dead_end`, `wall_ahead`, `object_seen`, `mover_seen`, `mover_ahead`,
`rival_seen`, `visibility_changed`, `target_reached`) · body (`bumped`, `collision`, `fell`, `blocked`, `tagged`)
· energy (`energy_low` under 10 % to spare after the known way to the end point, `energy_ok` over 30 %) ·
actuator (`objective_done`, `action_done`, `action_failed`, `idle`).

Between decisions the robot follows corridors round corners and follows planned paths by itself (`autopilot.ts`).
An answer takes effect after its latency; a brain that throws or names an option that was not on offer is a miss
and the last command holds (no fallback inside the sim).

## The five scenarios (`LAB_SCENARIOS`)
| id | Objective | What decides it |
|---|---|---|
| `maze` | Reach the exit of an unmapped maze (only where the exit lies is known) | Sensing. Heuristic, same build: lidar 59 tiles, camera 71, ultrasonic 115; blind is wrecked on the walls, or gets out battered with a bumper |
| `warehouse` | Deliver 3 parcels to their bays, one at a time, among 8 forklifts; 2 m tiles | The order of the jobs (best order about 75 tiles, worst about 110), seeing the forklifts (hits over three seeds: lidar 2, camera 6, none 10) and the battery (the small pack runs flat) |
| `mars` | Take 3 of 5 soil samples and return to the lander; a dust storm cuts camera range | The moisture probe (no probe, no sample), the battery on sand, craters a ranger cannot see |
| `house` | Go into 4 rooms and scan 4 checkpoints | The camera (scanning needs it; only it sees the stairs) |
| `ctf` | Two robots, one flag: first to bring it home | The driver: decision latency and route. Driving into the carrier takes the flag and stuns it for 2 s; a fresh carrier is safe for 2 s |

`LAB_SCENARIO_IDS`, `LAB_DEFAULT_BUILDS[id]` (a build that completes it), `LAB_SEEDS = [1001, 1002, 1003]` (the seed
moves forklifts and the storm, never the map), `LAB_PLAYER = 'you'`, `LAB_RIVAL = 'jev'`.

## What the options tell a brain
Every option carries a prediction from the robot's own map: `steps`, `timeS`, `energyPct`, `batteryAfterPct`,
`marginAfterPct` (after then driving on to the end point). An option that starts a job also carries `jobSteps` (to the
thing and on to where it goes) and `tourSteps` (all the known work if this goes first and the rest in its best order):
the nearest parcel is not always the one to start with. `wait` and a pace switch are always on offer. The energy line
is `{ batteryPct, projectedPct, workPct, rangeTiles }`: `projectedPct` is the charge left after the known way to the
end point (the energy trigger watches it), `workPct` what the known work left would cost at this pace.

Measured with the default builds on seeds 1001–1006, mean score, heuristic against a random driver: maze 708 / 338,
warehouse 557 / 240, mars 644 / 67, house 744 / 487, ctf 837 / 69. On Warehouse no fixed order of the parcels beats
the heuristic by more than 20 points. Both are asserted in `scenarios.test.ts`.

## API
```ts
import { runLabHeadless, LAB_DEFAULT_BUILDS, LAB_SEEDS } from '@rivetrun/lab';

const { outcome, decisions, misses } = await runLabHeadless('maze', LAB_SEEDS[0], LAB_DEFAULT_BUILDS.maze, brain);
```
`runLabHeadless(scenarioId | scenario, seed, build, brain, { briefing?, rival?, maxDecisions?, frameEvery? })` drives the
player's robot with `brain`. In a two-robot scenario the rival gets the same build and the heuristic answering in
`LAB_RIVAL_LATENCY_MS` (400 ms) unless `rival` says otherwise. For several brains at once use `runLabEntries`:

```ts
import { createLabDriver, runLabEntries, runLabSync, labHeuristicBrain, LabQuestionSchema, LabDecisionSchema } from '@rivetrun/lab';

const result = await runLabEntries(scenario, seed, [{ agentId: 'you', build, brain }]);
result.outcomes.you;   // { status, finished, score, stars, timeS, damagePct, energyUsedPct, completion, why, … }
result.decisions;      // LabDecisionLog[]: trigger, knew, unknown, options with probabilities, choice, latency, chip
result.misses;         // decisions asked for and not given
```
- `LabBrain.decide(question: LabQuestion) → Promise<LabDecision>`; `LabDecision = { choice: optionId, probabilities?, latencyMs, policy?, model? }`.
- `LabQuestion = { scenarioId, objective, trigger, knew[], unknown[], energy, objectives[], options[], observation, labVersion }`.
  Options are named moves with stable ids: `do:<object>`, `goto:<object>`, `goto:zone:<zone>`, `explore:<N|E|S|W>`,
  `tag:<robot>`, `wait`, `pace:<full|eco>`, each with a label, a description and a prediction from the robot's own map.
- Engine for a UI: `createLab`, `stepLab` (pure, one 50 ms step), `command`, `setPace`, `observeLab`, `buildOptions`,
  `interactionsAt`, `objectiveStatus`, `scoreLab`; or `createLabDriver` for a loop with brains and a player together.
- Maps are ASCII (`parseMap`): `#` wall · `.` floor · `+` door · `^` ramp · `>` drop · `a g s m i w r` terrain ·
  letters and digits are markers.
