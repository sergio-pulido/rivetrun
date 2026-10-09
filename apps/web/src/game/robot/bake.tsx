'use client';

import { useLayoutEffect, useRef, type ReactNode, type Ref, type RefObject } from 'react';
import { BufferAttribute, Color, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type BufferGeometry, type Group, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
type V3 = readonly [number, number, number];

// A robot is ~150 boxes and cylinders. Drawn one by one that is ~150 draw calls per robot (three robots
// on screen, plus the shadow pass). Baking merges every static mesh under a bake root into one geometry
// per material class, with the part colours in vertex colours: a robot becomes a few dozen draw calls.

/** Set on meshes that may be merged (Box / Cyl do it). */
export const BAKE_TAG = { bake: true } as const;
/** Set on a group whose children must stay live (toggled or animated one by one). */
export const BAKE_STOP = { bakeStop: true } as const;
const BAKE_ROOT = { bakeRoot: true } as const;

/** Shared targets: the colour of each merged part lives in its vertices. */
const SHARED: Readonly<Record<string, Material>> = {
  matte: new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 }),
  metal: new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85 }),
  glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

const keyOf = (material: Material | Material[]): string | undefined =>
  Array.isArray(material) ? undefined : (material.userData.bakeKey as string | undefined);

function relativeMatrix(node: Object3D, root: Object3D, out: Matrix4): Matrix4 {
  node.updateMatrix();
  out.copy(node.matrix);
  for (let parent = node.parent; parent && parent !== root; parent = parent.parent) {
    parent.updateMatrix();
    out.premultiply(parent.matrix);
  }
  return out;
}

function collect(node: Object3D, out: Mesh[]): void {
  for (const child of node.children) {
    if (child.userData.bakeRoot || child.userData.bakeStop) continue;
    const mesh = child as Mesh;
    if (mesh.isMesh && child.userData.bake && keyOf(mesh.material)) out.push(mesh);
    collect(child, out);
  }
}

function bakedCopy(mesh: Mesh, root: Object3D, matrix: Matrix4, color: Color): BufferGeometry {
  // Non-indexed, position + normal + colour only: every source then merges with every other.
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
  geometry.applyMatrix4(relativeMatrix(mesh, root, matrix));
  const tint = (mesh.material as MeshStandardMaterial).color ?? color.set('#ffffff');
  const count = geometry.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** Merges the static meshes under `ref` (down to the next bake root or stop) once, when it mounts. */
export function useBake(ref: RefObject<Group | null>): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const sources: Mesh[] = [];
    collect(root, sources);
    const groups = new Map<string, Mesh[]>();
    for (const mesh of sources) {
      const key = keyOf(mesh.material)!;
      groups.set(key, [...(groups.get(key) ?? []), mesh]);
    }
    const matrix = new Matrix4();
    const color = new Color();
    const made: Array<{ mesh: Mesh; from: Mesh[] }> = [];
    for (const [key, from] of groups) {
      if (from.length < 2) continue;
      const copies = from.map((mesh) => bakedCopy(mesh, root, matrix, color));
      const merged = mergeGeometries(copies, false);
      copies.forEach((copy) => copy.dispose());
      if (!merged) continue;
      const mesh = new Mesh(merged, SHARED[key] ?? (from[0]!.material as Material));
      mesh.castShadow = from.some((source) => source.castShadow);
      mesh.userData.baked = true;
      root.add(mesh);
      from.forEach((source) => {
        source.visible = false;
      });
      made.push({ mesh, from });
    }
    return () => {
      for (const { mesh, from } of made) {
        root.remove(mesh);
        mesh.geometry.dispose();
        from.forEach((source) => {
          source.visible = true;
        });
      }
    };
  }, [ref]);
}

interface BakeProps {
  children: ReactNode;
  /** For groups the caller animates as a whole (a wheel, the head). */
  ref?: Ref<Group>;
  position?: V3;
  rotation?: V3;
}

/** A group whose static children are merged. It can still move, spin or hide as one piece. */
export function Bake({ children, ref, position, rotation }: BakeProps) {
  const own = useRef<Group>(null);
  useBake(own);
  return (
    <group
      ref={(node) => {
        own.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      userData={BAKE_ROOT}
      position={position as [number, number, number] | undefined}
      rotation={rotation as [number, number, number] | undefined}
    >
      {children}
    </group>
  );
}

export const bakeRootData = BAKE_ROOT;
