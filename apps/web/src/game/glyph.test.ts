import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

describe('glyph.tsx is a light entry', () => {
  it('pulls in nothing from three.js, neither itself nor through palette.ts', () => {
    for (const file of ['glyph.tsx', 'palette.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
      expect(imports.filter((name) => name === 'three' || name!.startsWith('three/') || name!.startsWith('@react-three')), file).toEqual([]);
    }
    const own = [...readFileSync(fileURLToPath(new URL('glyph.tsx', import.meta.url)), 'utf8').matchAll(/from '(\.[^']+)'/g)].map((match) => match[1]);
    expect(own).toEqual(['./palette']);
  });
});
