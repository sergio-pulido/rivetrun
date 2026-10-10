import type { Object3D } from 'three';

/**
 * What a tap on the rover in the Workshop means: a catalog part (opens its sheet)
 * or a printed part (opens the print sheet). Ids are catalog ids and the ids of
 * docs/inputs/printed-parts.json.
 */
export type RoverPick = { readonly partId: string } | { readonly printedPartId: string };

export const pickKey = (pick: RoverPick): string => ('partId' in pick ? `part:${pick.partId}` : `print:${pick.printedPartId}`);

/** Module roots that are not something the player picks from the catalog. */
const FIXED_MODULES: ReadonlySet<string> = new Set(['chassis', 'controller', 'face']);

/**
 * Node-name convention of docs/MK2_ASSET_CONTRACT.md: `print_<id>` is a printed part and `module_<partId>`
 * a catalog part. A double-underscore suffix (`__2` for an instance, `__steel` for a material) is ignored.
 */
export function pickFromName(name: string): RoverPick | null {
  const base = name.replace(/__[a-z0-9]+$/, '');
  if (base.startsWith('print_') && base.length > 6) return { printedPartId: base.slice(6) };
  if (base.startsWith('module_') && base.length > 7) {
    const partId = base.slice(7);
    return FIXED_MODULES.has(partId) ? null : { partId };
  }
  return null;
}

/** The pick a node carries itself: an explicit tag (procedural robot) or its name (MK-II asset). */
export function ownPick(node: Object3D): RoverPick | null {
  const tagged = node.userData.pick as RoverPick | undefined;
  if (tagged) return tagged;
  // The v2 export also writes the id into the node's glTF extras.
  const printed = node.userData.printedPartId;
  return typeof printed === 'string' && printed ? { printedPartId: printed } : pickFromName(node.name);
}

/** Resolves a tapped mesh: the nearest ancestor-or-self that is a printed part, else a catalog part. */
export function pickOf(hit: Object3D): RoverPick | null {
  let module: RoverPick | null = null;
  for (let node: Object3D | null = hit; node; node = node.parent) {
    const pick = ownPick(node);
    if (!pick) continue;
    if ('printedPartId' in pick) return pick;
    module ??= pick;
  }
  return module;
}
