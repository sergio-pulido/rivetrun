# Contract changes (additive only)

- 2026-10-09 brain: `BrainQuestion.briefing` (optional string, ≤140 chars) + `BriefingSchema`, `BRIEFING_MAX_CHARS`, `BRIEFING_PRESETS` — "Brief the brain"; only Jev reads it.
- 2026-10-09 sim: Scout Drone — `SensorKind` gains `'scout_drone'`; optional `Perception.terrainAheadSource` (`'camera' | 'scout_drone'`) and optional `BrainQuestion.lookaheadS`.
- 2026-10-09 sim: optional `PartEffects.roughGroundFactor` (locomotion; tracks soak up rough-ground entry impacts).
- 2026-10-09 sim: Deep Water — `MissionId` gains `'M6'`, `ExtraKind` gains `'thruster_kit'`, `SimEffect` gains `'bubbles'`; optional `PartEffects.requiresExtra` / `maxSwimDepthCm`; optional `SimState.waterDepthM` / `submergedDepthM` / `thrusting`.
- 2026-10-09 sim: M6 v2 — optional `Segment.currentMps`, `PartEffects.maxWadingDepthCm` (wheels 20 / off-road 35 / tracks 45), `SimState.waterCurrentMps`.
