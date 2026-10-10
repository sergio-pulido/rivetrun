import { MissionSchema, PartSchema, PresetSchema, TerrainSchema, TerrainIdSchema, type Build } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { SIMPLIFICATIONS } from '../simplifications';
import { compileTrack } from '../world';
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
    expect([count('locomotion'), count('motor'), count('battery'), count('sensor'), count('extra')]).toEqual([3, 3, 2, 9, 5]);
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

  it('has nine valid missions; only M5 has a fixed seed and a leaderboard', () => {
    expect(MISSION_IDS).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9']);
    for (const mission of Object.values(MISSIONS)) {
      expect(MissionSchema.safeParse(mission).success, mission.id).toBe(true);
      expect(mission.fixedSeed !== undefined, mission.id).toBe(mission.id === 'M5');
      expect(mission.leaderboard, mission.id).toBe(mission.id === 'M5');
    }
    expect(MISSIONS.M4.weather).toBe('cold');
    expect(MISSIONS.M5.weather).toBe('rain');
    // Every terrain except snow, which belongs to the weather missions.
    expect(new Set(MISSIONS.M5.track.segments.map((s) => s.terrain)).size).toBe(TerrainIdSchema.options.length - 1);
  });

  it('keeps the spec constants', () => {
    expect(TUNING.dtMs).toBe(50);
    expect(TUNING.decision).toMatchObject({ intervalS: 1.5, lookaheadS: 1.5, slipThresholdPct: 25, timeoutMs: 1200, slowMoFactor: 0.25 });
    expect(TUNING.score).toMatchObject({ base: 1000, perSecond: 4, perDamagePct: 6, perEnergyPct: 2, costDivisor: 5, dnfMax: 200 });
  });
});

describe('simplifications', () => {
  it('each is one sentence with a screen, and names a real part or mission when it names one', () => {
    expect(new Set(SIMPLIFICATIONS.map((s) => s.id)).size).toBe(SIMPLIFICATIONS.length);
    for (const item of SIMPLIFICATIONS) {
      expect(item.sentence.endsWith('.'), item.id).toBe(true);
      expect(item.sentence.length, item.id).toBeLessThan(170);
      if (item.partId) expect(PARTS.some((part) => part.id === item.partId), item.id).toBe(true);
      if (item.missionId) expect(item.missionId in MISSIONS, item.id).toBe(true);
    }
  });
});

describe('scan zones are reachable', () => {
  it('no obstacle, gap or drop stands on a scan pad or in the 2.5 m before it (Q33)', () => {
    for (const mission of Object.values(MISSIONS)) {
      const world = compileTrack(mission.track);
      for (const zone of mission.scanZones ?? []) {
        const from = zone.atM - zone.halfLengthM - 2.5;
        const to = zone.atM + zone.halfLengthM + 0.3;
        const inTheWay = [
          ...world.obstacles.filter((o) => o.endM > from && o.startM < to).map((o) => `${o.kind} at ${o.startM} m`),
          ...world.features.filter((f) => f.type !== 'ramp' && f.endM > from && f.startM < to).map((f) => `${f.type} at ${f.startM} m`),
        ];
        expect(inTheWay, `${mission.id} ${zone.label} at ${zone.atM} m`).toEqual([]);
        expect(zone.atM + zone.halfLengthM, `${mission.id} ${zone.label}`).toBeLessThan(world.lengthM - 1);
      }
    }
  });
});
