# RivetRun — Brain v3: sense only what you carry, decide when something changes (decided Sat 03:10)

Marker: RR-BRAIN-V3

Two rules for every brain (Jev, heuristic, and the human's HUD hints):
1. The brain knows only what its sensors report. It never reads the track ahead or the future from the sim.
2. The brain decides when something changes, not on a clock. Between decisions the last command holds.

Builds on docs/GAMEPLAY_V3_CONTROLS.md (RR-GAMEPLAY-V3).

## What each source tells the brain
| Source | The brain knows | Range |
|---|---|---|
| Core kit (every build) | wheel speed and distance (encoders), battery charge, current draw, projected charge at the finish at the current pace, mission plan (length, scan-zone positions) | — |
| imu | tilt and slope angle, slip (encoder vs IMU), impacts | at the robot |
| ultrasonic | obstacles and gap edges | sim's ultrasonic range |
| tof_vl53l1x_pololu | obstacles and gap edges | 4 m |
| lidar_rplidar_c1 | obstacles and gap edges | 12 m |
| camera | terrain type, obstacles, gaps | sim's camera range |
| moisture_probe | water and mud depth just ahead | sim's probe range |
| scout_drone | terrain and hazards | sim's drone range |
| bumper | contact, after it happens | at the robot |

- Game assumption, stated in the UI: the core kit includes power sensing (charge and current).
- No forward sensor: the brain is blind. It learns about an obstacle only on contact (bumper or IMU), or not at all.
- No IMU: the brain cannot know it is slipping or how steep the slope is.
- No camera or drone: the terrain type ahead is unknown.
- Scan zones: their positions come from the mission plan (distance by odometry). Scanning still needs the sensor the zone names.

## When a decision is requested
A decision is requested only when a trigger fires:
1. Perception: a new hazard, gap, terrain change or scan zone enters sensor range, or a known one is reached.
2. Body: slip starts or stops (IMU); tilt crosses 10° or 20° (IMU); impact, damage or landing.
3. Energy: projected charge at the finish at the current pace drops below 10 % of capacity, or recovers above 30 % (hysteresis).
4. Actuator: an action finishes or becomes available (jump re-armed, winch done, zone scanned).
5. Start of the run.

- No clock. If nothing fires for 100 m, there is no decision.
- The command holds until the next decision.
- Latency is real: a decision applies after its measured latency (Jev's actual response time; heuristic 0). A slow answer costs distance. The heuristic fallback at 1200 ms stays.

## Options and predicted outcomes
- Options are the commands this build can execute: throttle levels (full / steady / ease / coast), brake (soft / hard), and part actions (climb mode, winch, jump, scan). Air pitch only after GAMEPLAY v3 P2.
- Each option's predicted outcome uses known information only. Unknown track beyond sensor range is assumed to continue like the last known segment, and the question says what is unknown.
- Every question carries an energy line: charge %, draw at the current pace, projected charge at the finish for each option.

## Decision log (the AI showcase)
- Every decision is a RunEvent: time, trigger, what the brain knew (sensor lines), options with probabilities, choice, latency.
- The run HUD and the big screen show the last three decisions as chips, e.g. "LIDAR · rock 11 m on ice → ease 30 % (71 %) · 340 ms".
- When a blind robot hits something: "BLIND · hit rock at 22 m: no distance sensor".
- The result shows the count and why, e.g. "7 decisions in 62 m: 3 hazards, 2 energy, 2 slip".

## Energy must matter
- In at least M5 and M6, a heavy build on the small battery at full throttle runs out before the finish, and an eased pace finishes. Tune with the balance script; record the numbers in docs/CHANGES.md.

## Ownership
- sim: Observation built only from equipped sensors plus the core kit; trigger detector with hysteresis; energy projection; runController and driveController request a decision only on triggers and hold the last command; latency applied; heuristic driver uses the same Observation; decision RunEvents; energy tuning. Tests: a blind build hits the rock; an IMU-less build never reports slip; no decision on a long uniform segment; same seed and same latencies give the same run.
- brain: Jev question built from Observation only. Audit the current builder: the per-option lookahead must not use track data beyond sensor range. Energy line. Calls only on triggers. Ghost precompute and Room Race bots use the same path. Cache keys include the gameplay version. Log fields for the UI.
- game: decision chips on the run HUD and the big screen; a sensor-range band on the track showing what the robot can sense; BLIND marker.
- ui: Workshop and Brief "What your robot can sense" (and what it cannot); Test run reasons that cite missing sensors; result decision summary.

## P2, optional
- Operator view: in Drive mode the human sees the track in full detail only within the robot's sensor range; beyond it is dimmed. Decide after P1 is on a phone.
