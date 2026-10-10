import { describe, expect, it } from 'vitest';
import { TERRAIN_COLORS, terrainTile } from './glyph';
import { TERRAIN_LOOK } from './palette';

describe('colours handed to 2D views', () => {
  it('has every terrain of the run view', () => {
    expect(Object.keys(TERRAIN_COLORS).sort()).toEqual(Object.keys(TERRAIN_LOOK).sort());
  });

  it('shade 0 is the run view colour and more shade is darker', () => {
    expect(terrainTile('grass', 0)).toBe(TERRAIN_LOOK.grass.top.toLowerCase());
    const sum = (hex: string): number => [1, 3, 5].reduce((total, at) => total + parseInt(hex.slice(at, at + 2), 16), 0);
    expect(sum(terrainTile('grass', 0.6))).toBeLessThan(sum(terrainTile('grass', 0.2)));
    expect(terrainTile('snow')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
