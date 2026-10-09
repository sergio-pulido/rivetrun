import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { MISSIONS, PRESETS } from '@rivetrun/sim';
import type { Mission } from '@rivetrun/contracts';
import { buildSenses, deepWaterIssue, gapIssue, missionBlockers, missionWarnings, presetThatFinishes } from './buildStats';

const SEALED_SWIMMER: Build = {
  locomotion: 'wheels',
  motor: 'motor_torque',
  battery: 'battery_large',
  sensors: ['ultrasonic', 'camera'],
  extras: ['waterproof_case', 'thruster_kit'],
};

const DEEP_WATER = "This build can't cross deep water — needs Thruster kit + Waterproof case";

describe('deepWaterIssue', () => {
  it('flags every preset on Deep Water except the one built for it', () => {
    for (const preset of Object.values(PRESETS).filter((candidate) => candidate.id !== 'deep_diver')) {
      expect(deepWaterIssue(MISSIONS.M6, preset.build), preset.name).toBe(DEEP_WATER);
    }
  });

  it('flags a build with only one of the two parts', () => {
    expect(deepWaterIssue(MISSIONS.M6, { ...SEALED_SWIMMER, extras: ['waterproof_case'] })).toBe(DEEP_WATER);
    expect(deepWaterIssue(MISSIONS.M6, { ...SEALED_SWIMMER, extras: ['thruster_kit'] })).toBe(DEEP_WATER);
  });

  it('clears for a sealed robot with thrusters', () => {
    expect(deepWaterIssue(MISSIONS.M6, SEALED_SWIMMER)).toBeNull();
  });

  it('stays quiet on a crossing the drive can wade', () => {
    expect(deepWaterIssue(MISSIONS.M2, PRESETS.all_rounder.build)).toBeNull();
  });
});

describe('presetThatFinishes', () => {
  it('finds the preset that crosses Deep Water', () => {
    const preset = presetThatFinishes(MISSIONS.M6);
    expect(preset?.id).toBe('deep_diver');
    expect(missionBlockers(MISSIONS.M6, preset!.build)).toEqual([]);
  });

  it('finds none for Scrapyard Jumps: no preset carries the piston', () => {
    expect(presetThatFinishes(MISSIONS.M7)).toBeNull();
  });
});

describe('gapIssue', () => {
  const GAP = "This build can't clear the gap with no ramp — needs Piston jump";
  const jumper: Build = { ...PRESETS.all_rounder.build, extras: ['piston_jump', 'bumper'] };

  it('flags every preset on Scrapyard Jumps and clears with a piston', () => {
    for (const preset of Object.values(PRESETS)) expect(gapIssue(MISSIONS.M7, preset.build), preset.name).toBe(GAP);
    expect(gapIssue(MISSIONS.M7, jumper)).toBeNull();
  });

  it('does not flag a gap that a ramp leads into, or a track with no gap', () => {
    const rampedOnly: Mission = {
      ...MISSIONS.M7,
      track: {
        segments: [
          { terrain: 'asphalt', lengthM: 6, slopeDeg: 0, feature: { type: 'ramp', launchDeg: 20, lengthM: 1.5 } },
          { terrain: 'grass', lengthM: 8, slopeDeg: 0, feature: { type: 'gap', widthM: 0.6 } },
        ],
      },
    };
    expect(gapIssue(rampedOnly, PRESETS.all_rounder.build)).toBeNull();
    expect(gapIssue(MISSIONS.M1, PRESETS.all_rounder.build)).toBeNull();
  });
});

describe('missionWarnings', () => {
  it('leaves the deep-water case to deepWaterIssue instead of repeating it', () => {
    expect(missionWarnings(MISSIONS.M6, PRESETS.speedster.build).join(' ')).not.toMatch(/water/i);
  });

  it('still warns about water damage on a shallow crossing without a case', () => {
    expect(missionWarnings(MISSIONS.M2, PRESETS.speedster.build)).toContain('Water crossing and no waterproof case');
  });

  it('counts the scout drone as terrain sight', () => {
    const scout: Build = { ...PRESETS.speedster.build, sensors: ['scout_drone'] };
    expect(missionWarnings(MISSIONS.M1, scout).join(' ')).not.toMatch(/learns each terrain only on entry/);
  });
});

describe('buildSenses', () => {
  it('reports terrain ahead at the drone range when the drone is fitted', () => {
    const scout: Build = { ...PRESETS.speedster.build, sensors: ['scout_drone', 'camera'] };
    expect(buildSenses(scout).find((sense) => sense.label.startsWith('terrain ahead'))).toEqual({ label: 'terrain ahead 15 m', on: true });
  });
});

describe('sameBuild with v2 tuning', () => {
  it('stops matching a preset once a dial is moved off stock', async () => {
    const { matchPreset } = await import('./buildStats');
    expect(matchPreset(PRESETS.all_rounder.build)?.id).toBe('all_rounder');
    expect(matchPreset({ ...PRESETS.all_rounder.build, gearStep: 5 })).toBeNull();
  });
});
