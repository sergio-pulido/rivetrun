import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, SRGBColorSpace, Vector3, type Mesh, type MeshStandardMaterial, type Object3D, type Texture } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ENV_BASE, PROPS, PROP_IDS, type PropId } from './kit';

/** One prop ready to instance: everything it is made of in a single mesh, coloured per vertex. */
export interface KitProp {
  readonly id: PropId;
  /** The lit-by-the-scene part. */
  readonly solid: BufferGeometry;
  /** The parts that glow by themselves (a lamp's LEDs, a beacon's lens), or null. */
  readonly glow: BufferGeometry | null;
  /** Middle of the glowing part in the prop's own frame: where its halo goes. */
  readonly glowAt: Vector3 | null;
}

export type RescueKit = ReadonlyMap<PropId, KitProp>;

const loader = new GLTFLoader();
// The delivery may be meshopt-compressed; the decoder ships in the bundle. No Draco.
loader.setMeshoptDecoder(MeshoptDecoder);

interface Soup {
  positions: number[];
  normals: number[];
  colors: number[];
}

const soup = (): Soup => ({ positions: [], normals: [], colors: [] });

function geometryOf(data: Soup): BufferGeometry | null {
  if (data.positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(data.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The average colour of a base-colour map: a prop is a few dozen pixels tall on a phone, so the map itself is not drawn. */
function tintOf(map: Texture | null): Color | null {
  const image = map?.image as CanvasImageSource | undefined;
  if (!image || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new Color().setRGB(r! / 255, g! / 255, b! / 255, SRGBColorSpace);
  } catch {
    // A map that cannot be read back: the material's own colour is used.
    return null;
  }
}

/** Flattens a prop's meshes into one geometry (two when part of it glows): one draw call per kind of prop. */
function bake(id: PropId, scene: Object3D): KitProp {
  scene.updateMatrixWorld(true);
  const solid = soup();
  const glow = soup();
  const point = new Vector3();
  const normal = new Vector3();
  const normalMatrix = new Matrix3();
  const glowMin = new Vector3(Infinity, Infinity, Infinity);
  const glowMax = new Vector3(-Infinity, -Infinity, -Infinity);
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial;
    const glows = material.emissive !== undefined && material.emissiveIntensity > 0 && material.emissive.r + material.emissive.g + material.emissive.b > 0.02;
    const color = glows ? material.emissive.clone() : material.color.clone();
    if (!glows) {
      const tint = tintOf(material.map);
      if (tint) color.multiply(tint);
    }
    const geometry = mesh.geometry;
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    const count = index ? index.count : positions.count;
    const into = glows ? glow : solid;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < count; i += 1) {
      const vertex = index ? index.getX(i) : i;
      point.fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(normals, vertex).applyMatrix3(normalMatrix).normalize();
      into.positions.push(point.x, point.y, point.z);
      into.normals.push(normal.x, normal.y, normal.z);
      into.colors.push(color.r, color.g, color.b);
      if (glows) {
        glowMin.min(point);
        glowMax.max(point);
      }
    }
    geometry.dispose();
    material.map?.dispose();
    material.dispose();
  });
  const body = geometryOf(solid);
  if (!body) throw new Error(`M7 prop ${id} has no geometry`);
  const lit = geometryOf(glow);
  return { id, solid: body, glow: lit, glowAt: lit ? glowMin.clone().add(glowMax).multiplyScalar(0.5) : null };
}

let kitPromise: Promise<RescueKit> | null = null;

/**
 * The whole prop kit, loaded once. A prop whose file is missing or broken is left out (what it would have dressed
 * stays bare); if nothing at all loads the promise rejects and the caller draws the procedural street instead.
 */
export function loadRescueKit(): Promise<RescueKit> {
  kitPromise ??= Promise.allSettled(PROP_IDS.map(async (id) => bake(id, (await loader.loadAsync(`${ENV_BASE}/${PROPS[id].file}`)).scene))).then((results) => {
    const kit = new Map<PropId, KitProp>();
    for (const result of results) if (result.status === 'fulfilled') kit.set(result.value.id, result.value);
    if (kit.size === 0) throw new Error('M7 prop kit: nothing could be loaded');
    return kit;
  });
  // A failed kit is not cached: the next run may try again.
  kitPromise.catch(() => {
    kitPromise = null;
  });
  return kitPromise;
}
