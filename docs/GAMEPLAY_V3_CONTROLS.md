# RivetRun — Gameplay v3: controls that matter (decided Sat 03:00)

Marker: RR-GAMEPLAY-V3

Problem: holding the throttle is always right, the brake is never needed, and the jump is a button with no skill in it. Goal: every input is a decision the player can get right or wrong, grounded in real physics, and the parts change those decisions.

## Principles
- Same physics for the human, the heuristic driver and Jev (ghost).
- Every penalty is visible when it happens (HUD) and explained in the result.
- Parts change the numbers (grip, safe speed, scan ability), so build strategy and driving skill compound.
- The track stays a rail with height (no steering).

## P1, by 11:00

### 1. Analog throttle and wheelspin
- `ControlInput.throttle` and `ControlInput.brake` accept 0..1. A boolean is still accepted (true = 1). Additive contract.
- Touch: the right half of the screen is a throttle slider. Touch-down = 30 %, drag up to 100 %, drag down to 0 %. A gauge under the thumb shows the value. The left half is the brake, same drag scale. Keyboard: Up/W = 100 %, Shift+Up = 50 %, Down/S = brake.
- Traction limit: drive force above grip (terrain friction × normal load × locomotion factor) spins the wheels. Acceleration drops to the kinetic level (about 70 % of the limit), energy is still spent, the wheels spin visibly and the HUD shows SLIP. Mud, sand, ice and wet rock punish full throttle; tracks and off-road tyres raise the limit.
- Braking is limited by the same grip: on ice it takes much longer to stop.

### 2. Speed costs damage on hazards
- Every rock, step, drop and landing has a safe speed. Impact damage grows with (v − v_safe)² above it; below it there is no damage.
- The bumper raises v_safe. Ground clearance (wheel size) raises it for rocks and steps.
- The HUD announces the next hazard about 3 s ahead with its safe speed, and the speedometer turns red above it.

### 3. Scan zones (precision stops)
- Missions get scan zones. Stop with the zone under the robot (speed below 0.1 m/s) for 1.5 s to scan.
- Each zone names the sensor it needs: camera ("survivor"), moisture probe ("soil sample"), ultrasonic or LIDAR ("structure"). Without that sensor the zone cannot be scanned.
- A missed scan costs +10 s. A stop centred on the zone gives a small score bonus.
- M1: 1 zone (camera). M3: 2 zones (camera, moisture probe). M7 Earthquake Rescue: 3 zones (camera ×2, ultrasonic). Other missions: none for now.
- The heuristic driver brakes for the zones its build can scan. The Jev question gains "scan zone ahead at N m".

### 4. Result breakdown
- Time lost to slip, damage by cause (impact, landing, water), scans done and missed.
- One line on what to try next, derived from the biggest loss.

## P2, by 13:00, only if P1 is green on a real phone

### 5. Air control
- While airborne, throttle pitches the nose up and brake pitches it down (reaction torque of the wheels).
- Landing within 10° of the ground: CLEAN. 10–30°: HARD (damage). Over 30° nose-first: CRASH (damage and a 1 s stall).

### 6. Charged piston jump
- Hold the action button to compress (0.3–1.0 s gives 40–100 % impulse), release to fire. The ring shows the charge. The 3 s re-arm stays.

## Ownership
- sim: contracts (additive), traction and slip, braking limit, safe speeds and impact damage, scan zones and mission edits, heuristic driver, air pitch and landing grades (P2), charged jump (P2), balance and determinism tests, entries in docs/CHANGES.md.
- game: analog touch controls and gauges, SLIP and wheel spin, hazard warning and speedometer colour, scan-zone pads with a progress ring, landing grade text and pitch (P2), charge ring (P2).
- ui: Brief lists the mission's objectives and hazards with their safe speeds; first-run coach marks for the slider, the brake and scans; the result breakdown (item 4).
- brain: Jev question lines for scan zones, next-hazard safe speed and slip; /api/ghost cache key includes the gameplay version; Room Race phones use the same controls.

## Notes
- docs/BENCHMARK.md numbers come from v2 physics. Re-run the benchmark after P1 lands.
- Freeze rules from docs/DEMO_PLAN.md still apply: 14:00 feature freeze.
