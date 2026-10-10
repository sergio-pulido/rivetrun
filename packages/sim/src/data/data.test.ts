import { MissionSchema, PartSchema, PresetSchema, TerrainSchema, TerrainIdSchema, type Build } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { MISSIONS, MISSION_IDS, PARTS, PARTS_BY_ID, PRESETS, TERRAINS, TUNING } from './index';

const buildParts = (build: Build) =>
  [build.locomotion, build.motor, build.battery, ...build.sensors, ...build.extras].map((id) => PARTS_BY_ID.get(id));

describe('sim data (v0) matches contracts', () => {
  it('has one valid terrain per terrain id', () => {
    expect(Object.keys(TERRAINS).sort()).toEqual([...TerrainIdSchema.options].sort());
    for (const terrain of Object.values(TERRAINS)) {
      expect(TerrainSchema.safeParse(terrain).success, terrain.id).toBe(true);
    }
  });

  it('has valid parts with unique ids covering every slot option in the spec', () => {
    for (const part of PARTS) {
      expect(PartSchema.safeParse(part).success, part.id).toBe(true);
    }
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(PARTS.length);
    const count = (slot: string) => PARTS.filter((p) => p.slot === slot).length;
    expect([count('locomotion'), count('motor'), count('battery'), count('sensor'), count('extra')]).toEqual([3, 3, 2, 7, 5]);
  });

  it('has presets that are valid, unlocked from the start and within budget', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(PresetSchema.safeParse(preset).success, preset.id).toBe(true);
      const parts = buildParts(preset.build);
      expect(parts.every((p) => p !== undefined), `${preset.id} parts exist`).toBe(true);
      expect(parts.every((p) => p?.unlockPoints === 0), `${preset.id} unlocked`).toBe(true);
      const cost = parts.reduce((sum, p) => sum + (p?.costEur ?? 0), 0);
      expect(cost, `${preset.id} cost`).toBeLessThanOrEqual(TUNING.defaultBudgetEur);
      expect(PARTS_BY_ID.get(preset.build.locomotion)?.slot).toBe('locomotion');
      expect(PARTS_BY_ID.get(preset.build.motor)?.slot).toBe('motor');
      expect(PARTS_BY_ID.get(preset.build.battery)?.slot).toBe('battery');
    }
  });

  it('has seven valid missions; only M5 has a fixed seed and a leaderboard', () => {
    expect(MISSION_IDS).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']);
    for (const mission of Object.values(MISSIONS)) {
      expect(MissionSchema.safeParse(mission).success, mission.id).toBe(true);
      expect(mission.fixedSeed !== undefined, mission.id).toBe(mission.id === 'M5');
      expect(mission.leaderboard, mission.id).toBe(mission.id === 'M5');
    }
    expect(MISSIONS.M4.weather).toBe('cold');
    expect(MISSIONS.M5.weather).toBe('rain');
    expect(new Set(MISSIONS.M5.track.segments.map((s) => s.terrain)).size).toBe(TerrainIdSchema.options.length);
  });

  it('keeps the spec constants', () => {
    expect(TUNING.dtMs).toBe(50);
    expect(TUNING.decision).toMatchObject({ intervalS: 1.5, lookaheadS: 1.5, slipThresholdPct: 25, timeoutMs: 1200, slowMoFactor: 0.25 });
    expect(TUNING.score).toMatchObject({ base: 1000, perSecond: 4, perDamagePct: 6, perEnergyPct: 2, costDivisor: 5, dnfMax: 200 });
  });
});
