import { describe, expect, it } from 'vitest';
import { bestTerrains, capabilityDiff, capabilityHeadlines, goodFor } from './gives';
import type { CapabilityItem } from './sim';

const item = (id: CapabilityItem['id'], label: string, value: number): CapabilityItem => ({ id, label, value, unit: '' });

const base: readonly CapabilityItem[] = [
  item('top_speed', 'Top speed 2 m/s', 2),
  item('clearance', 'Clears 4 cm obstacles', 4),
  item('traction:mud', 'Grip on mud 0.4', 0.4),
  item('traction:ice', 'Grip on ice 0.15', 0.15),
  item('traction:asphalt', 'Grip on asphalt 0.9', 0.9),
];

describe('capabilityDiff', () => {
  it('lists only what changed, in the sim\'s words, with what it was without the part', () => {
    const withSensor = [...base, item('lookahead_obstacle', 'Sees obstacles 3 m ahead', 3)];
    expect(capabilityDiff(withSensor, base)).toEqual([{ id: 'lookahead_obstacle', text: 'Sees obstacles 3 m ahead', without: null, direction: 'better' }]);
  });

  it('marks what a part costs as worse, after what it gives', () => {
    const sealed = [item('top_speed', 'Top speed 1.8 m/s', 1.8), ...base.slice(1), item('waterproof', 'Sealed against water', 1)];
    const chips = capabilityDiff(sealed, base);
    expect(chips.map((chip) => [chip.id, chip.direction])).toEqual([['waterproof', 'better'], ['top_speed', 'worse']]);
    expect(chips[1]).toMatchObject({ text: 'Top speed 1.8 m/s', without: 'Top speed 2 m/s' });
  });

  it('names an ability the part takes away', () => {
    const chips = capabilityDiff(base, [...base, item('jump', 'Jumps 0.9 m', 0.9)]);
    expect(chips).toEqual([{ id: 'jump', text: 'Loses: jumps 0.9 m', without: null, direction: 'worse' }]);
  });

  it('gathers grip by terrain for "good for"', () => {
    const tracked = [...base.slice(0, 2), item('traction:mud', 'Grip on mud 0.64', 0.64), item('traction:ice', 'Grip on ice 0.27', 0.27), base[4]!, item('jump', 'Jumps 0.9 m', 0.9)];
    const chips = capabilityDiff(tracked, base);
    expect(chips.map((chip) => chip.id)).toEqual(['jump', 'traction:ice', 'traction:mud']);
    expect(goodFor(chips)).toEqual(['gaps', 'ice', 'mud']);
    expect(goodFor([{ id: 'clearance', text: 'Clears 9 cm obstacles', without: null, direction: 'better' }, { id: 'traction:rock', text: 'Grip on rock 0.8', without: null, direction: 'better' }, { id: 'range', text: 'Range 400 m', without: null, direction: 'worse' }])).toEqual(['rocks', 'steps', 'logs', 'rocky ground']);
  });

  it('says nothing when nothing changed', () => {
    expect(capabilityDiff(base, base)).toEqual([]);
  });
});

describe('headlines and terrains', () => {
  it('states chosen abilities on their own, skipping ones the build lacks', () => {
    expect(capabilityHeadlines(base, ['clearance', 'jump']).map((chip) => chip.text)).toEqual(['Clears 4 cm obstacles']);
  });

  it('ranks terrains by grip', () => {
    expect(bestTerrains(base, 2)).toEqual(['asphalt', 'mud']);
  });
});
