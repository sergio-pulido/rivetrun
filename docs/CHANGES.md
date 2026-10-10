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
