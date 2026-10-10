# RivetRun — the simulation model

Marker: RR-SIM-MODEL · gameplay version 4 · source: `packages/sim/src` (every number below is a constant in that code).

## In short

**One line, fixed steps.** The track is one dimension. A robot has a position, a speed, a battery and a damage figure, advanced in steps of 50 ms. The same seed and the same commands always give the same run, and a human, the rule-based driver and Jev all drive through the same function.

**The robot is its build.** Locomotion, motor, battery, up to two sensors, up to two extras and three dials (cells, wheel size, gearing) give mass, top speed, drive force, capacity, clearance, grip per surface and the sensors it carries. Nothing else reaches the physics.

**Traction.** The ground passes on at most friction × weight (asphalt 0.9, grass 0.6, mud 0.4, snow 0.3, ice 0.15, times the locomotion's grip). Ask for more than 1.1× that and the wheels spin, keeping only 70 % of it. Braking has the same limit. Climb mode is a crawl gear that never asks for more than the ground gives. Soft ground adds drag with the robot's mass. Eight seconds without progress is stuck.

**Damage.** Obstacles are solid. Contact at or below the safe speed (0.6 m/s, 0.9 with a bumper) is free; above it damage grows with the square of the excess, and harder obstacles cost more. Driving onto rock faster than 1 m/s works the same way. Deep water floods an unsealed robot. 100 % ends the run.

**Energy.** Draw follows the command and the load. Per metre, steady throttle costs about 70 % of full and ease about 57 %; coasting and braking cost only the electronics. An empty battery ends the run.

**In the air.** Ramps, drops and the piston leave the ground; flight is ballistic. A gap not cleared is a fall (15 % damage, 5 s; the third ends the run). The body levels itself at 60°/s for every driver; a player's brake or extra throttle can spoil the landing (over 30° nose-first: 10 % damage, a dead stop, 1 s).

**Weather.** Rain lowers grip to 0.8× and camera range to 0.6×. Wind is drag on the air speed over the body, with seeded gusts. Cold removes 1 % of usable battery per °C below 20 °C. Fog, night and snowfall shorten what cameras and lasers see; ultrasonic is unaffected; a camera scan at night needs a NoIR camera or headlights.

**What a brain knows.** Never the track. It gets an Observation built only from the sensors fitted, with seeded noise: every build knows speed, distance, charge, draw and the mission plan; an IMU adds tilt, slip and gusts; rangers (3 m, 4 m, 12 m) give the distance to the next obstacle; cameras (6 m) and the scout drone (15 m) name the ground and what is on it; no sensor means `unknown`. For each command the sim projects 1.5 s ahead on the world the robot believes in, and the brain chooses from those projections.

**When a brain is asked.** Only when something changes: something enters sensor range or is reached, slip, tilt, a gust, an impact, a stall, a change in the projected finish charge, an action finishing. There is no clock, the last command holds in between, and a slow answer costs sim time. Jev has 1200 ms before the rule-based driver decides instead, marked as a fallback.

**Score.** 1000 − 4 × seconds − 6 × damage % − 2 × battery % used − price ÷ 5; a missed scan zone adds 10 s. Not finished: 200 × share of the track covered.

**Simplified on purpose.** One dimension, no steering. Formulas, not a rigid-body engine. Sensors never fail. Weather factors, the self-levelling in the air, the headlight rule and the NoIR camera's range are game rules or assumptions, each stated where the player meets it (`SIMPLIFICATIONS` in `packages/sim/src/simplifications.ts`).

## Appendix: the model in full

The track is one line. A robot has a position along it, a speed, a battery and a damage figure. Time advances in fixed steps of 50 ms, and the same seed with the same commands always gives the same run. A human, the rule-based driver and Jev all drive through the same function.

### The robot
A build is one locomotion, one motor, one battery, up to two sensors and up to two extras, plus three dials (battery cells 1–4, wheel size 60/80/90 mm, gearing 1–5). From it the sim derives mass, top speed, drive force, battery capacity, ground clearance, grip per surface, and which sensors exist. Nothing else about the build reaches the physics.

### Driving
- **Commands.** Full throttle asks for 100 % of top speed, steady for 70 %, ease for 35 %. Climb mode asks for 45 % with 1.6× the force and 1.5× the grip. Coast applies no drive; soft brake uses 40 % of the braking force, hard brake all of it.
- **Traction.** The ground can pass on at most friction × weight on the wheels. Base friction: asphalt 0.9, rock 0.7, grass 0.6, sand 0.45, mud 0.4, water 0.4, snow 0.3, ice 0.15, each multiplied by the locomotion's grip on that surface. Asking for more than 1.1× that limit spins the wheels, and spinning wheels pass on only 70 % of it. Climb mode never asks for more than the ground gives.
- **Braking** is limited by the same grip, so stopping distances are longer on ice than on asphalt.
- **Soft ground.** Mud, sand, snow and water add drag that grows with the surface's sinkage and the robot's mass (reference 3 kg). A robot that makes no progress for 8 s is stuck; after 1.5 s without progress the sim reports the countdown, and to a player the command that frees this build from there (climb mode, easing off, the winch), unless the command in force is already working. A player's stuck clock starts with their first throttle; a run nobody touches ends after 30 s as never started.
- **Slopes** add or remove gravity along the track. Beyond the locomotion's limit the robot scrapes: 1.5 % damage per degree over, per second.

### Damage
- **Obstacles** (step, log, rock) are solid. A robot whose clearance is below the obstacle's height stops against it; climb mode adds 30 % clearance. Contact at or below the safe speed costs nothing: 0.6 m/s, 1.5× with a bumper, scaled by clearance between 0.8× and 1.3×. Above it, damage = 5 % × (speed over safe)² × hardness (step 1, log 1.5, rock 1.6) × (0.5 + the surface's impact risk); a bumper halves it.
- **Rough ground.** Driving onto rock faster than 1 m/s costs 45 % × (speed over 1 m/s)², reduced by tracks and the bumper.
- **Water** deeper than the build can wade floods an unsealed robot; a sealed one needs thrusters to swim (1.5 m/s in still water).
- 100 % damage ends the run.

### Energy
Draw is the base load of the parts plus the motor's power for the command and the load on it, times 3.5. Per metre, steady costs about 70 % of full throttle and ease about 57 %; coast and brakes draw only the base load. Capacity comes from the battery part and the cell count. An empty battery ends the run.

### In the air
A ramp launches the robot at its angle if it arrives at 0.3 m/s or more; a drop or the piston also leaves the ground. Flight is ballistic. Landing vertically faster than 4.5 m/s costs 10 % × (excess)². A gap that is not cleared is a fall: 15 % damage, 5 s, back to 3 m before the gap; the third fall ends the run. The body leaves at the ground's angle and levels itself at 60°/s for every driver. A player's brake turns the nose down and extra throttle lifts it: within 10° of level is clean, 10–30° costs up to 5 %, over 30° nose-first costs 10 %, a dead stop and 1 s. Holding the jump button 0.3–1 s gives 40–100 % of the piston's push; it re-arms in 3 s.

### Scan zones
Stop within the zone (0.3 m of tolerance) under 0.1 m/s for 1.5 s with a sensor the zone accepts. A missed zone adds 10 s; stopping within 0.25 m of the centre adds 15 points. At night a camera scan needs a NoIR camera or headlights.

### Weather
Rain: grip ×0.8 everywhere, 1.3× sinkage in mud, camera range ×0.6. A mission may also define:
- **Wind**: drag ½ · 1.2 kg/m³ · 0.04 m² · (air speed over the body)², head or tail, only on missions that define wind. **Gusts** add to it in windows of 1.5–3 s, one per 7 s, at moments fixed by the seed.
- **Cold**: usable capacity falls 1 % per °C below 20 °C, never under 50 % (the plain "cold" label is ×0.8); ice grip ×0.9.
- **Visibility**: camera range ×0.35 in fog, ×0.25 at night (×0.5 with headlights, ×1 for a NoIR camera), ×0.7 in snowfall. Lidar and ToF: ×0.7 in fog, ×0.6 in heavy rain or snowfall, unchanged by darkness. Ultrasonic: unchanged.

### What a brain knows
A brain never sees the track. It gets an Observation built from the build's sensors, with seeded noise:
- **Core kit, every build**: speed, distance driven, mission length, battery charge, current draw, the charge it will finish with at this pace, damage, scan-zone positions from the mission plan, and the plan's weather.
- **IMU**: tilt, slip, gusts, impacts. **Ultrasonic 3 m, ToF 4 m, lidar 12 m**: distance to the next obstacle or gap edge, not what it is. **Camera 6 m, NoIR camera 6 m**: the next change of ground and what an obstacle is. **Scout drone 15 m**: the same from the air, above the rain. **Moisture probe 3 m**: water and mud depth. **Bumper**: contact, after it happens.
- No sensor for something means the field reads `unknown`.

For each available command the sim then projects 1.5 s ahead (8 s with a scout drone) on the world the robot believes in, not the real one, and gives the brain progress, damage and energy per command. Unseen ground is assumed to continue; an unseen slope is assumed flat until a stall suggests otherwise.

### When a brain is asked
Only when something changes; there is no clock. Triggers: the start; an obstacle, gap, change of ground or scan zone coming into range, a change of ground again at 2 m, and reaching each; slip starting (over 25 %) or ending (under 15 %); tilt crossing 10° or 20°; a gust; an impact, a landing, a fall, being blocked, each 5 % of damage; driving without moving for 1 s, then every 2 s; projected finish charge under 10 % or back over 30 %; the piston re-armed, a scan done, the robot stopped. The last command holds in between. A brain's answer applies after its response time, counted in sim time. Jev answers within 1200 ms or the rule-based driver decides and the run is marked as a fallback.

### Score
Finished: 1000 − 4 × seconds − 6 × damage % − 2 × battery % used − price in € ÷ 5, plus scan bonuses. Not finished: 200 × share of the track covered.

### What is simplified
- The track is one dimension: no steering and no side slip.
- No rigid-body engine: wheels, suspension and tipping are formulas, not contacts.
- Sensor noise is small and seeded; sensors never fail.
- The NoIR camera's 6 m is the game camera's range (the maker gives none), with IR lamps assumed.
- The light sensor switching headlights on is a game rule.
- Weather factors on sensor range are chosen for the game, not measured.
- Wind is drag along the track on an estimated 0.04 m²: no crosswind, no tipping. Gusts are fixed per seed.
- Cold capacity is a rule of thumb for LiPo packs, not a cell model.
- Snow is one surface: no drifts, packing or melting. The puddle on M8 is 4 cm of water.
- The core kit assumes wheel encoders and a power sensor on the base rover.
- Self-levelling in the air and the charged-jump curve are game rules.
- Lab Missions use a separate grid simulation with the same robot values; it does not use this physics.

The same list, as data for the screens, is `SIMPLIFICATIONS` in `packages/sim/src/simplifications.ts`.
