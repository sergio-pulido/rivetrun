// The Blender agent's top-down sprites (docs/inputs/lab-sprites.json → apps/web/public/renders/lab) and whether this
// page may draw with them. The board uses them once every file has loaded; until then, and when one fails, it keeps
// its own SVG marks. `?sprites=0` switches them off for the tab, `?sprites=1` on again.
import { useSyncExternalStore } from 'react';
import type { LabObjectKind, LabScenario } from '@rivetrun/lab';

/** x, y, width and height of a part of a sprite, in the file's own pixels. */
export type SpriteBox = readonly [x: number, y: number, width: number, height: number];

export const SPRITE_PX = 256;

/** One box for the three rovers, so tracks stay shorter than wheels as they are on the bench. */
const ROVER: SpriteBox = [65, 18, 126, 220];
/** Inside the soft edge of a floor tile, so neighbours meet without a seam. */
const FLOOR: SpriteBox = [7, 7, 242, 242];
const FLAG: SpriteBox = [74, 40, 108, 176];

/** The drawn part of each sprite, measured from the alpha of the files. */
export const SPRITES = {
  robot_wheels: ROVER,
  robot_offroad: ROVER,
  robot_tracks: ROVER,
  parcel: [70, 60, 116, 136],
  delivery_bay: [25, 25, 206, 206],
  forklift: [59, 5, 138, 246],
  soil_sample_marker: [62, 70, 132, 116],
  lander: [18, 18, 220, 220],
  flag_cyan: FLAG,
  flag_orange: FLAG,
  stairs: [37, 25, 182, 206],
  // A square with the door frame across its middle: the leaf swings into the lower half.
  door: [24, -18, 208, 208],
  // The middle panel of the wall with its top edge: a wall tile is a block, so the end caps and dividers stay out.
  wall: [78, 102, 100, 46],
  floor_concrete: FLOOR,
  floor_regolith: FLOOR,
  floor_wood: FLOOR,
} as const satisfies Record<string, SpriteBox>;

export type SpriteId = keyof typeof SPRITES;
export const SPRITE_IDS = Object.keys(SPRITES) as SpriteId[];

/** The door's frame and posts without its leaf: a closed door draws its own leaf across. */
export const DOOR_FRAME: SpriteBox = [24, 62, 208, 48];

export const spriteUrl = (id: SpriteId): string => `/renders/lab/${id}.png`;

const ROVERS: Readonly<Record<string, SpriteId>> = { wheels: 'robot_wheels', offroad_wheels: 'robot_offroad', tracks: 'robot_tracks' };

/** The rover's top view for a build's locomotion; plain wheels for one the sprites do not cover. */
export const roverSprite = (locomotion: string): SpriteId => ROVERS[locomotion] ?? 'robot_wheels';

/** The floor a scenario's usual ground is drawn with: boards in the house, regolith outdoors, concrete elsewhere. */
export function floorSprite(scenario: Pick<LabScenario, 'id' | 'indoor'>): SpriteId {
  if (!scenario.indoor) return 'floor_regolith';
  return scenario.id === 'house' ? 'floor_wood' : 'floor_concrete';
}

const OBJECTS: Readonly<Partial<Record<LabObjectKind, SpriteId>>> = {
  parcel: 'parcel', bay: 'delivery_bay', sample: 'soil_sample_marker', lander: 'lander', flag: 'flag_orange',
};

/** The sprite for a kind of object; none for the kinds the set does not cover (exit, checkpoint, base). */
export const objectSprite = (kind: LabObjectKind): SpriteId | undefined => OBJECTS[kind];

type Status = 'idle' | 'loading' | 'ready' | 'off';

let status: Status = 'idle';
const listeners = new Set<() => void>();
/** Kept so the browser holds the decoded files for as long as the page lives. */
const held: HTMLImageElement[] = [];

function settle(next: Status): void {
  status = next;
  listeners.forEach((listener) => listener());
}

const SWITCH_KEY = 'rivetrun.lab.sprites';

/** `?sprites=0` or `?sprites=1` on the address decides, and the tab remembers it. */
function switchedOff(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get('sprites');
    if (asked === '0' || asked === '1') window.sessionStorage.setItem(SWITCH_KEY, asked);
    return window.sessionStorage.getItem(SWITCH_KEY) === '0';
  } catch {
    // No storage (private mode): the address alone decides.
    return new URLSearchParams(window.location.search).get('sprites') === '0';
  }
}

/** Fetches every sprite once. All of them or none: a board with half its pictures reads worse than the SVG. */
function load(): void {
  if (status !== 'idle') return;
  if (switchedOff()) {
    status = 'off';
    return;
  }
  status = 'loading';
  let left = SPRITE_IDS.length;
  for (const id of SPRITE_IDS) {
    const image = new Image();
    image.src = spriteUrl(id);
    held.push(image);
    // decode() settles once the file is fetched and decoded, so the first frame with sprites does not stall on it.
    const loaded = typeof image.decode === 'function'
      ? image.decode()
      : new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`sprite ${id} did not load`));
      });
    loaded.then(
      () => {
        if (status !== 'loading') return;
        left -= 1;
        if (left === 0) settle('ready');
      },
      () => {
        if (status === 'loading') settle('off');
      },
    );
  }
}

/** Starts the loading on first use and calls back when the answer changes. Also the way in for the tests. */
export function watchSprites(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

export const spritesReady = (): boolean => status === 'ready';

/** True once every sprite has loaded in this page and they are not switched off. False on the server. */
export function useLabSprites(): boolean {
  return useSyncExternalStore(watchSprites, spritesReady, () => false);
}
