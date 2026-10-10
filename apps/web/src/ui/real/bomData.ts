// Server-side loader for docs/inputs/bom-mk2.json. Import from server components only and pass slices down,
// so the 49 KB file never reaches the client whole.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PARTS_BY_ID } from '@rivetrun/sim';
import rawBom from '../../../../../docs/inputs/bom-mk2.json';
import type { Bom, BomGroup, BomItem } from './bom';
import { approximateKeys } from './models';

const SpecValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]);
const WebUrlSchema = z.url().refine((url) => /^https?:\/\//i.test(url), 'http(s) links only');

const ItemSchema = z.object({
  key: z.string().min(1),
  gameId: z.string().nullish(),
  group: z.enum(['core', 'game', 'alt', 'locked', 'tool']),
  category: z.string(),
  name: z.string().min(1),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  qty: z.number().positive().nullish(),
  unit: z.string().nullish(),
  url: WebUrlSchema.nullish(),
  priceShown: z.string().nullish(),
  specs: z.record(z.string(), SpecValueSchema).default({}),
  status: z.enum(['verified', 'unverified', 'experimental', 'design']),
  notes: z.string().nullish(),
  scenario: z.string().nullish(),
  usedFor: z.string().nullish(),
});

const SelectSchema = z.object({
  core: z.array(z.string()),
  byCells: z.record(z.string(), z.object({ driver: z.string(), switch: z.string(), motorVoltage: z.string(), warning: z.string().optional() })),
  motor: z.record(z.string(), z.record(z.string(), z.string())),
  battery: z.record(z.string(), z.record(z.string(), z.string().nullable())),
  wheelByGameMm: z.record(z.string(), z.string()),
  wheelNote: z.string(),
  locomotion: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  parts: z.record(z.string(), z.string()),
});

const FileSchema = z.object({
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  select: SelectSchema,
  items: z.array(z.unknown()),
});

const toItem = (entry: z.infer<typeof ItemSchema>): BomItem => ({
  key: entry.key,
  gameId: entry.gameId ?? null,
  group: entry.group,
  category: entry.category,
  name: entry.name,
  manufacturer: entry.manufacturer ?? null,
  model: entry.model ?? null,
  qty: entry.qty ?? null,
  unit: entry.unit ?? null,
  url: entry.url ?? null,
  priceShown: entry.priceShown ?? null,
  specs: entry.specs,
  status: entry.status,
  notes: entry.notes ?? '',
  scenario: entry.scenario ?? null,
  usedFor: entry.usedFor ?? null,
});

interface Loaded {
  readonly checkedAt: string;
  readonly select: Bom['select'];
  readonly all: readonly BomItem[];
}

/** A file that fails validation yields no BOM at all: the real-build screens then say so instead of guessing. */
const LOADED: Loaded | null = (() => {
  const file = FileSchema.safeParse(rawBom);
  if (!file.success) return null;
  // One malformed item is left out; the rest of the list still shows.
  const all = file.data.items.flatMap((entry) => {
    const item = ItemSchema.safeParse(entry);
    return item.success ? [toItem(item.data)] : [];
  });
  return { checkedAt: file.data.checkedAt, select: file.data.select, all };
})();

const slice = (keep: (item: BomItem) => boolean): Bom | null =>
  LOADED ? { checkedAt: LOADED.checkedAt, select: LOADED.select, items: Object.fromEntries(LOADED.all.filter(keep).map((item) => [item.key, item])) } : null;

const BUILD_GROUPS: ReadonlySet<BomGroup> = new Set(['core', 'game', 'alt']);

/**
 * The game part an item stands behind. The file says so with `gameId`; a part the game added later under the item's own key
 * (the file may still list it as locked) is matched by that key.
 */
const gameIdOf = (item: BomItem): string | null => item.gameId ?? (PARTS_BY_ID.has(item.key) ? item.key : null);

/** Everything a rover can be built from: core kit, the components behind game parts, and their alternatives. */
export const buildBom = (): Bom | null => slice((item) => BUILD_GROUPS.has(item.group) || gameIdOf(item) !== null);

/** The components behind one game part (every cell count and wheel size), for its part sheet. */
export const partBom = (gameId: string): Bom | null => slice((item) => gameIdOf(item) === gameId);

export const bomItem = (key: string): BomItem | null => LOADED?.all.find((item) => item.key === key) ?? null;

export const bomCheckedAt = (): string | null => LOADED?.checkedAt ?? null;

/** Real parts the game does not have yet. Shown locked in the Workshop: readable, not equippable. */
export const lockedItems = (): readonly BomItem[] => LOADED?.all.filter((item) => item.group === 'locked' && gameIdOf(item) === null) ?? [];

export const toolItems = (): readonly BomItem[] => LOADED?.all.filter((item) => item.group === 'tool') ?? [];

/** Game part id → who makes its real component, for the Workshop shelf. Parts with no named maker are left out. */
export const partMakers = (): Readonly<Record<string, string>> =>
  Object.fromEntries(
    (LOADED?.all ?? []).flatMap((item): [string, string][] => {
      const gameId = item.group === 'game' || item.group === 'locked' ? gameIdOf(item) : null;
      return gameId && item.manufacturer ? [[gameId, item.manufacturer.replace(/\s*\(.*$/, '')]] : [];
    }),
  );

/** Tool renders are named by what the tool is, not by product. */
const TOOL_RENDER: Readonly<Record<string, string>> = { printer: 'fdm_printer', laser: 'laser_cutter', soldering: 'soldering_station' };

const renderIfPresent = (folder: 'parts' | 'tools', names: readonly (string | null | undefined)[]): string | null => {
  for (const name of names) {
    if (name && existsSync(path.join(process.cwd(), 'public', 'renders', folder, `${name}.png`))) return `/renders/${folder}/${name}.png`;
  }
  return null;
};

/** The render for a BOM key when one has landed in public/renders/parts; null = use the current art. */
export const partRender = (key: string): string | null => renderIfPresent('parts', [key]);

/** The GLB for a BOM key when one has landed in public/models/parts; null = no 3D toggle. */
export const partModel = (key: string): string | null => (existsSync(path.join(process.cwd(), 'public', 'models', 'parts', `${key}.glb`)) ? `/models/parts/${key}.glb` : null);

export interface PartMedia {
  readonly render: string | null;
  readonly model: string | null;
  /** The manifest marks this render approximate: it is captioned as illustrative. */
  readonly approximate: boolean;
}

const MODELS_MANIFEST = path.join(process.cwd(), '..', '..', 'docs', 'inputs', 'component-models.json');

/** BOM keys whose render the component-models manifest marks approximate. Read per request: the manifest changes as models land. */
export const approximateRenders = (): ReadonlySet<string> => {
  try {
    return new Set(approximateKeys(JSON.parse(readFileSync(MODELS_MANIFEST, 'utf8'))));
  } catch {
    return new Set(); // No manifest, or not JSON: no render is captioned.
  }
};

/** Render and model per BOM key, for every key in a BOM slice. Checked on the server at request time, so new files show without a rebuild. */
export const mediaFor = (bom: Bom | null): Readonly<Record<string, PartMedia>> => {
  const approximate = approximateRenders();
  return Object.fromEntries(Object.keys(bom?.items ?? {}).map((key) => [key, { render: partRender(key), model: partModel(key), approximate: approximate.has(key) }]));
};

export const toolRender = (item: Pick<BomItem, 'key' | 'category'>): string | null => renderIfPresent('tools', [item.key, TOOL_RENDER[item.category], item.category]);
