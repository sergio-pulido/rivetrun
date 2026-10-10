# Contract changes (additive only)

- 2026-10-09 brain: `BrainQuestion.briefing` (optional string, ≤140 chars) + `BriefingSchema`, `BRIEFING_MAX_CHARS`, `BRIEFING_PRESETS` — "Brief the brain"; only Jev reads it.
- 2026-10-09 sim: Scout Drone — `SensorKind` gains `'scout_drone'`; optional `Perception.terrainAheadSource` (`'camera' | 'scout_drone'`) and optional `BrainQuestion.lookaheadS`.
- 2026-10-09 sim: optional `PartEffects.roughGroundFactor` (locomotion; tracks soak up rough-ground entry impacts).
- 2026-10-09 sim: Deep Water — `MissionId` gains `'M6'`, `ExtraKind` gains `'thruster_kit'`, `SimEffect` gains `'bubbles'`; optional `PartEffects.requiresExtra` / `maxSwimDepthCm`; optional `SimState.waterDepthM` / `submergedDepthM` / `thrusting`.
- 2026-10-09 sim: M6 v2 — optional `Segment.currentMps`, `PartEffects.maxWadingDepthCm` (wheels 20 / off-road 35 / tracks 45), `SimState.waterCurrentMps`.
- 2026-10-09 sim: `PresetId` gains `'deep_diver'` (fourth preset, the recommended M6 build).
- 2026-10-09 sim: contracts v2 (docs/GAMEPLAY_V2.md), no behaviour yet — `Policy` gains `'human'`, `Action` gains `'jump'`, `ExtraKind` gains `'piston_jump'`; new `ControlInput`, `TrackFeature` (`Segment.feature`: ramp / gap / drop); optional `Build.batteryCells` / `wheelSizeMm` / `gearStep`, `PartEffects.jumpImpulseMps` / `cooldownS`, `SimState.heightM` / `vy` / `airborne`; `RunEvent` gains `airborne` / `landed` / `fell`.
- 2026-10-10 sim: gameplay v2 behaviour — `MissionId` gains `'M7'`; optional `Perception.gapAheadM` / `gapWidthM`; optional `Part.comingSoon`. `Segment.feature` positions: ramp = last `lengthM` of its segment, gap and drop = start of their segment.
- 2026-10-10 sim: wheel size L is 90 mm (docs/MK2_BOM.md) — `Build.wheelSizeMm` accepts `90`; `100` stays valid as the old value for L and drives identically.
- 2026-10-10 sim: obstacle geometry and strategy layer — optional `SimState.blockedBy`; `damage` event gains optional `obstacle` / `blocked` / `roughEntry` / `air`; optional `PartEffects.clearanceFactor`.
- 2026-10-10 sim: new playable parts (no schema change) — `lidar_rplidar_c1` (sensor, obstacle range 12 m, 0.11 kg) and `tof_vl53l1x_pololu` (sensor, obstacle range 4 m, 0.0005 kg) use `effects.sensor: 'ultrasonic'`, so `Perception.obstacleAheadM` / `gapAheadM` can now read up to 12 m; `brushless_motor_dfrobot_fit0441` (motor, 2.5 m/s, 1.4 N·m). Heuristic side is done in `packages/sim/src/brains.ts` (approach planning for obstacles seen beyond 3.2 m). [BRAIN] can start: Jev question builder and /api/decide cache key.
