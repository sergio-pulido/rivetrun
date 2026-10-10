import { Box3, Vector3, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** The canonical MK-II v2 export (docs/MK2_ASSET_CONTRACT.md). Served by the app itself; the v1 folder is never read. */
const BASE = '/models/mk2';
/** The MK-II never blocks a robot from appearing: past this, the procedural robot is used. */
const LOAD_TIMEOUT_MS = 3000;

/** The fields of manifest.json the game reads. Everything else in the file is for people. */
interface Mk2Manifest {
  readonly version: number;
  readonly modules: Readonly<Record<string, { readonly file: string }>>;
  /** How far every non-locomotion module is lifted for each locomotion id, in render units. */
  readonly deckOffsetY?: Readonly<Record<string, number>>;
}

/** One loaded module: its `module_<id>` root in render units, and where it sits so it can tumble about its own middle. */
export interface Mk2Module {
  readonly id: string;
  /** Template: clone it per robot. */
  readonly root: Object3D;
  /** Centre of the module in the rover frame. */
  readonly centre: Vector3;
  /** Distance from the centre down to the module's lowest point. */
  readonly drop: number;
  /** Highest point of the module in the rover frame. */
  readonly top: number;
}

/** What could be loaded for one build, and what the procedural robot still has to supply. */
export interface Mk2Kit {
  readonly modules: readonly Mk2Module[];
  /** Ids of the build (and `controller`) that the export does not contain yet: drawn procedurally on the MK-II deck. */
  readonly missing: readonly string[];
  /** Lift of every non-locomotion module for this build's locomotion. */
  readonly lift: number;
  /** Top of the chassis plate: where plate-level procedural parts mount. */
  readonly plateTop: number;
  /** Top of everything exported on the deck (chassis, battery): where the procedural controller stack mounts. */
  readonly stackTop: number;
}

const loader = new GLTFLoader();
let manifestPromise: Promise<Mk2Manifest> | null = null;
const cache = new Map<string, Promise<Mk2Module>>();

function loadManifest(): Promise<Mk2Manifest> {
  manifestPromise ??= fetch(`${BASE}/manifest.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`MK-II manifest: HTTP ${response.status}`);
      return response.json() as Promise<Mk2Manifest>;
    })
    .then((manifest) => {
      if (manifest.version !== 2 || typeof manifest.modules !== 'object' || manifest.modules === null) throw new Error('MK-II manifest is not a v2 manifest');
      return manifest;
    });
  // A failed manifest is not cached: the next robot may try again.
  manifestPromise.catch(() => {
    manifestPromise = null;
  });
  return manifestPromise;
}

async function loadModule(id: string, file: string): Promise<Mk2Module> {
  const gltf = await loader.loadAsync(`${BASE}/${file}`);
  // Contract: exactly one `module_<id>` root per file.
  let root: Object3D | null = null;
  gltf.scene.traverse((node) => {
    if (!root && node.name === `module_${id}`) root = node;
  });
  if (!root) throw new Error(`MK-II module ${id}: no module_${id} root`);
  const found: Object3D = root;
  // The root carries the asset's own millimetre → render-unit scale: it is used exactly as exported.
  found.removeFromParent();
  found.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  found.updateMatrixWorld(true);
  const box = new Box3().setFromObject(found);
  if (box.isEmpty()) throw new Error(`MK-II module ${id} has no geometry`);
  const centre = box.getCenter(new Vector3());
  return { id, root: found, centre, drop: centre.y - box.min.y, top: box.max.y };
}

function cachedModule(id: string, file: string): Promise<Mk2Module> {
  const hit = cache.get(id);
  if (hit) return hit;
  const pending = loadModule(id, file);
  pending.catch(() => cache.delete(id));
  cache.set(id, pending);
  return pending;
}

async function loadKit(locomotion: string, others: readonly string[]): Promise<Mk2Kit> {
  const manifest = await loadManifest();
  // The rolling base has to be the asset's own: an MK-II chassis on procedural wheels (or the reverse) does not fit.
  if (!manifest.modules.chassis || !manifest.modules[locomotion]) throw new Error(`MK-II has no chassis + ${locomotion} yet`);
  const wanted = ['chassis', 'controller', locomotion, ...others];
  const exported = wanted.filter((id) => manifest.modules[id]);
  const modules = await Promise.all(exported.map((id) => cachedModule(id, manifest.modules[id]!.file)));
  const lift = manifest.deckOffsetY?.[locomotion] ?? 0;
  const chassis = modules.find((module) => module.id === 'chassis')!;
  const battery = modules.find((module) => module.id.startsWith('battery_'));
  return {
    modules,
    missing: wanted.filter((id) => !manifest.modules[id]),
    lift,
    plateTop: chassis.top + lift,
    stackTop: Math.max(chassis.top, battery?.top ?? 0) + lift,
  };
}

/**
 * Everything the export has for a build. Rejects if the manifest or any listed file is missing, broken or
 * slower than the timeout, or if the export has no rolling base for this build: the caller then draws the
 * procedural robot.
 */
export function loadMk2Kit(locomotion: string, others: readonly string[]): Promise<Mk2Kit> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('MK-II assets timed out')), LOAD_TIMEOUT_MS);
  });
  return Promise.race([loadKit(locomotion, others), timeout]);
}
