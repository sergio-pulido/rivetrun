# RivetRun — Gameplay v2 (decided Fri 22:45)

Marker: RR-GAMEPLAY-V2

Problem: the player mostly watches. Decision: the player drives, builds with real trade-offs, and the track gets height (ramps, gaps, airtime). The track stays a rail (1D along x) with a height profile. No free 2D/3D steering.

## 1. Drive mode (you vs Jev)
- New default for Play: the player drives against a Jev ghost with the same build, seed and track.
- The Jev ghost is a precomputed GhostTrace, not a second live controller (updated 22:55): `GET /api/ghost` runs runHeadless on the server with the Jev brain, cached by mission + build hash + seed + briefing, with concurrent requests for one key sharing one computation. Brief prefetches it; if it is not ready at Deploy, the run uses the heuristic ghost labelled HEURISTIC. This keeps one live controller per phone and protects the Jev quota with 70 phones.
- Drive mode uses one fixed seed per mission, so everyone races the same Jev ghost and times are comparable.
- Jev mode stays: Jev drives, you brief it, heuristic and random ghosts (current game).
- Policy gains `'human'`.
- Controls, one thumb, portrait:
  - Right half of the screen: hold = throttle (maps to `accelerate`), release = coast (`cruise`).
  - Left half: hold = brake (`brake`).
  - Action button, bottom centre, shown only for parts you have: JUMP (piston), WINCH, CLIMB (toggles `climb_mode`). Cooldown ring.
  - Input sampled at 20 Hz into `ControlInput { throttle: boolean, brake: boolean, special?: 'jump' | 'winch' | 'climb' }`; the sim maps it to the existing actions, so the physics is shared with Jev.
  - `navigator.vibrate` on landing and crashes where supported.
- Result: "You vs Jev" — same build, same seed: time, damage, score, and one line ("You beat the AI by 2.3 s" / "Jev wins by 1.1 s").

## 2. Build strategy that changes the dynamics
- Battery cells 1S–4S (3.7 V per cell): voltage scales motor power and top speed; capacity Wh = cells × per-cell Wh; mass and cost per cell.
- Wheel diameter S / M / L (60 / 80 / 100 mm): bigger = more top speed per rpm and more ground clearance (ramps, rocks), less wheel torque, more mass. Tread type (wheels / off-road / tracks) stays.
- Motor gearing: 5 steps from speed to torque.
- `Build` gains optional `batteryCells`, `wheelSizeMm`, `gearStep` (defaults reproduce today's behaviour, so M1–M6 balance holds).
- `predictStats(build)` in the sim: top speed, 0-to-top time, max climb angle, range, mass, cost. The Workshop shows them live as the player changes parts.

## 3. Height: ramps, gaps, airtime
- Obstacles gain `ramp { launchDeg, lengthM }`, `gap { widthM }`, `drop { heightM }`.
- Leaving a ramp at speed v launches a ballistic arc (no traction or throttle in the air). Landing: vertical impact speed → damage (bumper halves it).
- Gap not cleared → the robot falls: respawn at the gap start with +5 s and +15 % damage; the third fall is a DNF ("fell into the gap").
- New part `piston_jump` (extra slot): action `jump`, 3 s cooldown, vertical impulse, costs energy. Jev gets `jump` when the part is fitted; no Jev decisions while airborne.
- SimState gains `heightM`, `vy`, `airborne`; RunEvent gains `airborne`, `landed`, `fell`.
- Missions: add a ramp or gap to M2, M3 and M5 where it creates a choice; new M7 "Scrapyard Jumps" built around ramps, gaps and the piston.

## 4. Room Race v2
- Phases: lobby → BUILD (45 s timer; phones show a compact workshop) → countdown → race (humans drive) → results.
- The host can add 1–2 JEV bots; the big screen runs them with the client brain and posts their state like a phone. The big screen reads "HUMANS vs JEV".
- Results highlight the best human against the best Jev bot.

## Priorities (Saturday)
- P1 by 11:00: Drive mode in solo play with the Jev ghost; battery cells, wheel size and gearing with live predicted stats.
- P2 by 13:00: ramps, gaps, airtime and the piston; Room Race build phase, human driving and Jev bots.
- P3 if time: M7, haptics.
- 14:00 feature freeze (docs/DEMO_PLAN.md).

## Ownership
- sim: contracts v2 (additive), ControlInput handling, airborne physics, gaps and respawn, battery/wheel/gear model, predictStats, mission edits and M7, `jump` availability, /run page integration of Drive mode.
- game: touch controls overlay (zones, action button, cooldown ring), airtime rendering (height, pitch), ramp/gap/piston visuals, landing FX, Jev ghost lane in Drive mode.
- ui: mode choice (Drive / Jev) on Home and Brief, Workshop controls for cells / wheel size / gearing with live predicted stats, Result "You vs Jev".
- brain: Jev question with `jump` and airborne handling, Room Race build phase, human-driven phones, Jev bots run by the big screen, v2 results.
