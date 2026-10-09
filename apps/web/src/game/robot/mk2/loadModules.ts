import { Box3, Vector3, type Group, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Served by the app itself: nothing here leaves the origin. */
const BASE = '/models/rivet-mk-ii';
/** Fixed modules every build has (v2 has no face). */
export const MK2_FIXED = ['chassis', 'controller'] as const;
/** The MK-II never blocks a robot from appearing: past this, the procedural robot is used. */
const LOAD_TIMEOUT_MS = 3000;

/** One loaded module: its `module_<id>` root, re-centred so it can spin about its own middle when thrown off. */
export interface Mk2Module {
  readonly id: string;
  /** Template: clone it per robot. */
  readonly root: Object3D;
  /** Centre of the module in the rover frame. */
  readonly centre: Vector3;
  /** Distance from the centre down to the module's lowest point. */
  readonly drop: number;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Mk2Module>>();

const stripNode = (name: string): string => name.replace(/_node$/, '');

async function loadModule(id: string): Promise<Mk2Module> {
  const gltf = await loader.loadAsync(`${BASE}/${id}.glb`);
  const scene: Group = gltf.scene;
  // Contract: exactly one `module_<id>` root per file (v1 exported it as `module_<id>_node`).
  let root: Object3D | null = null;
  scene.traverse((node) => {
    if (!root && stripNode(node.name) === `module_${id}`) root = node;
  });
  // v1 locomotion files have no module root: their wheel and suspension pivots sit directly in the scene.
  const found: Object3D = root ?? scene;
  found.name = `module_${id}`;
  found.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    }
  });
  found.updateMatrixWorld(true);
  const box = new Box3().setFromObject(found);
  if (box.isEmpty()) throw new Error(`MK-II module ${id} has no geometry`);
  const centre = box.getCenter(new Vector3());
  return { id, root: found, centre, drop: centre.y - box.min.y };
}

function cachedModule(id: string): Promise<Mk2Module> {
  const hit = cache.get(id);
  if (hit) return hit;
  const pending = loadModule(id);
  // A failed load is not cached: the next robot may try again.
  pending.catch(() => cache.delete(id));
  cache.set(id, pending);
  return pending;
}

/** All modules for a build, or a rejection if any is missing, broken or slower than the timeout. */
export function loadMk2Modules(ids: readonly string[]): Promise<Mk2Module[]> {
  const all = Promise.all([...MK2_FIXED, ...ids].map(cachedModule));
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('MK-II assets timed out')), LOAD_TIMEOUT_MS);
  });
  return Promise.race([all, timeout]);
}
