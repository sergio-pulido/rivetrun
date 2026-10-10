import { describe, expect, it } from 'vitest';
import { decisionSummary } from './decisions';

const of = (...triggers: (string | undefined)[]) => triggers.map((trigger) => ({ trigger }));

describe('decisionSummary', () => {
  it('counts decisions over the distance covered and says why they were asked', () => {
    expect(decisionSummary(of('obstacle', 'energy', 'slip', 'obstacle', 'slip', 'energy', 'obstacle'), 62)).toBe('7 decisions in 62 m: 3 hazards, 2 energy, 2 slip');
  });

  it('groups the terrain triggers, uses singulars, and keeps the start last', () => {
    expect(decisionSummary(of('start', 'terrain_ahead', 'terrain_enter', 'obstacle', 'damage'), 40.4)).toBe('5 decisions in 40 m: 2 terrain, 1 hazard, 1 impact, 1 start');
  });

  it('reads a trigger it does not know by its name, and one with no trigger as other', () => {
    expect(decisionSummary(of('scan_zone', 'scan_zone', undefined), 10)).toBe('3 decisions in 10 m: 2 scan zone, 1 other');
  });

  it('reads the Brain v3 cause when the decision carries its log', () => {
    const v3 = (...causes: string[]) => causes.map((cause) => ({ trigger: undefined, log: { trigger: { cause } } }));
    expect(decisionSummary(v3('start', 'hazard_seen', 'hazard_reached', 'gap_seen', 'energy_low', 'energy_ok', 'slip_start', 'slip_stop'), 62)).toBe('8 decisions in 62 m: 3 hazards, 2 energy, 2 slip, 1 start');
    expect(decisionSummary(v3('zone_seen', 'jump_ready', 'tilt_20', 'landing'), 30)).toBe('4 decisions in 30 m: 1 scan zone, 1 part ready, 1 tilt, 1 impact');
  });

  it('says one decision in the singular, and nothing when there were none', () => {
    expect(decisionSummary(of('start'), 12)).toBe('1 decision in 12 m: 1 start');
    expect(decisionSummary([], 12)).toBeNull();
  });
});
