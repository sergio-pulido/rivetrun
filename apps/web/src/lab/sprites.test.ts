import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAB_SCENARIOS, LAB_SCENARIO_IDS } from '@rivetrun/lab';
import { shortId } from './boardModel';
import { DOOR_FRAME, SPRITES, SPRITE_IDS, SPRITE_PX, floorSprite, objectSprite, roverSprite, spriteUrl } from './sprites';

const fromRepo = (path: string): string => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

describe('lab sprites', () => {
  it('uses only files that are in the app and in the Blender agent\'s list', () => {
    const listed = JSON.parse(readFileSync(fromRepo('docs/inputs/lab-sprites.json'), 'utf8')) as { sizePx: number; sprites: { id: string; file: string }[] };
    expect(listed.sizePx).toBe(SPRITE_PX);
    for (const id of SPRITE_IDS) {
      const entry = listed.sprites.find((sprite) => sprite.id === id);
      expect(entry?.file, id).toBe(spriteUrl(id));
      expect(existsSync(fromRepo(`apps/web/public${spriteUrl(id)}`)), id).toBe(true);
    }
  });

  it('crops every sprite to a box with some size, inside the file except where the door is centred on its frame', () => {
    for (const id of SPRITE_IDS) {
      const [x, y, width, height] = SPRITES[id];
      expect(width, id).toBeGreaterThan(0);
      expect(height, id).toBeGreaterThan(0);
      expect(x, id).toBeGreaterThanOrEqual(0);
      expect(x + width, id).toBeLessThanOrEqual(SPRITE_PX);
      if (id !== 'door') expect(y, id).toBeGreaterThanOrEqual(0);
      expect(y + height, id).toBeLessThanOrEqual(SPRITE_PX);
    }
    // The frame alone is a strip of the door's own box.
    expect(DOOR_FRAME[0]).toBe(SPRITES.door[0]);
    expect(DOOR_FRAME[2]).toBe(SPRITES.door[2]);
    expect(DOOR_FRAME[3]).toBeLessThan(SPRITES.door[3]);
  });

  it('draws the rover for its locomotion, and plain wheels for one it has no picture of', () => {
    expect(roverSprite('wheels')).toBe('robot_wheels');
    expect(roverSprite('offroad_wheels')).toBe('robot_offroad');
    expect(roverSprite('tracks')).toBe('robot_tracks');
    expect(roverSprite('legs')).toBe('robot_wheels');
    // One crop for the three, so they keep their relative size.
    expect(SPRITES.robot_tracks).toBe(SPRITES.robot_wheels);
    expect(SPRITES.robot_offroad).toBe(SPRITES.robot_wheels);
  });

  it('gives each scenario a floor: boards in the house, regolith outdoors, concrete elsewhere', () => {
    const floors = Object.fromEntries(LAB_SCENARIO_IDS.map((id) => [id, floorSprite(LAB_SCENARIOS[id])]));
    expect(floors).toMatchObject({ maze: 'floor_concrete', warehouse: 'floor_concrete', mars: 'floor_regolith', house: 'floor_wood', ctf: 'floor_concrete' });
    // Any scenario added later still gets a floor that exists.
    for (const floor of Object.values(floors)) expect(SPRITE_IDS).toContain(floor);
  });

  it('has a picture for parcels, bays, samples, the lander and the flag, and leaves the rest to the SVG marks', () => {
    expect(objectSprite('parcel')).toBe('parcel');
    expect(objectSprite('bay')).toBe('delivery_bay');
    expect(objectSprite('sample')).toBe('soil_sample_marker');
    expect(objectSprite('lander')).toBe('lander');
    expect(objectSprite('flag')).toBe('flag_orange');
    for (const kind of ['exit', 'checkpoint', 'home'] as const) expect(objectSprite(kind), kind).toBeUndefined();
  });

  it('keeps the letter or digit that tells two things of a kind apart', () => {
    expect(shortId('parcel-2')).toBe('2');
    expect(shortId('bay-a')).toBe('A');
    expect(shortId('check-kitchen')).toBe('K');
  });
});

describe('lab sprites, loading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** A page with an address and a tab's storage, where each sprite decodes or fails as told. A fresh copy of the module. */
  async function page(search: string, decode: (src: string) => Promise<void>, storage = new Map<string, string>()) {
    const fetched: string[] = [];
    vi.stubGlobal('window', {
      location: { search },
      sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value) },
    });
    vi.stubGlobal('Image', class {
      src = '';
      decode(): Promise<void> {
        fetched.push(this.src);
        return decode(this.src);
      }
    });
    vi.resetModules();
    const sprites = await import('./sprites');
    const heard = vi.fn();
    sprites.watchSprites(heard);
    return { sprites, fetched, heard, storage };
  }
  const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('says ready only once every sprite has decoded, and says it once', async () => {
    let arrive = (): void => {};
    const arrived = new Promise<void>((resolve) => { arrive = resolve; });
    const { sprites, fetched, heard } = await page('', () => arrived);
    await settled();
    expect(sprites.spritesReady()).toBe(false);
    expect(heard).not.toHaveBeenCalled();
    arrive();
    await settled();
    expect(sprites.spritesReady()).toBe(true);
    expect(fetched).toHaveLength(sprites.SPRITE_IDS.length);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('stays on the SVG board when a single sprite fails', async () => {
    const { sprites } = await page('', (src) => (src.endsWith('/wall.png') ? Promise.reject(new Error('404')) : Promise.resolve()));
    await settled();
    expect(sprites.spritesReady()).toBe(false);
  });

  it('stays on the SVG board while a sprite never arrives', async () => {
    const { sprites, heard } = await page('', (src) => (src.endsWith('/forklift.png') ? new Promise(() => {}) : Promise.resolve()));
    await settled();
    expect(sprites.spritesReady()).toBe(false);
    expect(heard).not.toHaveBeenCalled();
  });

  it('fetches nothing with ?sprites=0, the tab remembers it, and ?sprites=1 brings them back', async () => {
    const off = await page('?sprites=0', () => Promise.resolve());
    await settled();
    expect(off.fetched).toHaveLength(0);
    expect(off.sprites.spritesReady()).toBe(false);

    const later = await page('', () => Promise.resolve(), off.storage);
    await settled();
    expect(later.fetched).toHaveLength(0);
    expect(later.sprites.spritesReady()).toBe(false);

    const on = await page('?sprites=1', () => Promise.resolve(), off.storage);
    await settled();
    expect(on.sprites.spritesReady()).toBe(true);
  });
});
