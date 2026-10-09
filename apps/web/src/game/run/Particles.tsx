'use client';

import { useFrame } from '@react-three/fiber';
import { useImperativeHandle, useMemo, useRef, type Ref, type RefObject } from 'react';
import { Color, IcosahedronGeometry, MeshBasicMaterial, MeshLambertMaterial, Object3D, type InstancedMesh } from 'three';

export type ParticleKind = 'dust' | 'splash' | 'mud' | 'sparks' | 'smoke' | 'ice';

export interface ParticleEmitter {
  /** dir: +1 when the robot moves forward (spray goes backwards). */
  emit(kind: ParticleKind, x: number, y: number, z: number, count: number, dir: number, color?: string): void;
}

interface Spec {
  readonly colors: readonly string[];
  readonly gravity: number;
  readonly drag: number;
  readonly life: readonly [number, number];
  readonly size: readonly [number, number];
  /** Size multiplier reached mid-life (puffs grow, drops do not). */
  readonly grow: number;
  readonly back: readonly [number, number];
  readonly up: readonly [number, number];
  readonly side: number;
  readonly bright: boolean;
}

const SPECS: Readonly<Record<ParticleKind, Spec>> = {
  dust: { colors: ['#f1e2bd', '#e3cfa0'], gravity: -0.4, drag: 2.4, life: [0.35, 0.75], size: [0.018, 0.04], grow: 2.4, back: [0.3, 1.6], up: [0.3, 1.1], side: 0.5, bright: false },
  splash: { colors: ['#d7efff', '#8fd0ff', '#ffffff'], gravity: -11, drag: 0.2, life: [0.45, 0.9], size: [0.04, 0.09], grow: 1, back: [-1.2, 1.8], up: [1.8, 4.4], side: 1.1, bright: false },
  mud: { colors: ['#4a2f1c', '#6b4428', '#35200f'], gravity: -11, drag: 0.2, life: [0.45, 0.85], size: [0.05, 0.11], grow: 1, back: [0.8, 3], up: [1.2, 3.4], side: 0.8, bright: false },
  sparks: { colors: ['#ffe9a8', '#ffb347', '#ff7a1a'], gravity: -9, drag: 0.6, life: [0.2, 0.5], size: [0.02, 0.045], grow: 1, back: [-3, 3], up: [1, 5], side: 2.2, bright: true },
  smoke: { colors: ['#2a2d33', '#474b53', '#1b1d21'], gravity: 1.3, drag: 1.2, life: [1, 1.9], size: [0.09, 0.16], grow: 3, back: [0.1, 0.7], up: [0.5, 1.2], side: 0.3, bright: false },
  ice: { colors: ['#ffffff', '#d6f1ff'], gravity: -8, drag: 0.4, life: [0.25, 0.55], size: [0.025, 0.05], grow: 1, back: [1.5, 4.2], up: [0.3, 1.3], side: 0.5, bright: false },
};

const CAPACITY = 320;
const BRIGHT_CAPACITY = 80;
const SHAPE = new IcosahedronGeometry(1, 0);

interface Pool {
  readonly capacity: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  readonly kind: Array<ParticleKind | null>;
  cursor: number;
}

const createPool = (capacity: number): Pool => ({
  capacity,
  px: new Float32Array(capacity), py: new Float32Array(capacity), pz: new Float32Array(capacity),
  vx: new Float32Array(capacity), vy: new Float32Array(capacity), vz: new Float32Array(capacity),
  age: new Float32Array(capacity), life: new Float32Array(capacity), size: new Float32Array(capacity),
  kind: Array.from({ length: capacity }, () => null),
  cursor: 0,
});

const between = (range: readonly [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);

interface ParticlesProps {
  ref: Ref<ParticleEmitter>;
  /** Slow-mo: particles follow sim time. */
  timeScale: RefObject<number>;
}

/** Instanced low-poly particles: dust, splash, mud, sparks, smoke, ice chips. Two draw calls. */
export function Particles({ ref, timeScale }: ParticlesProps) {
  const lit = useRef<InstancedMesh>(null);
  const bright = useRef<InstancedMesh>(null);
  const pools = useMemo(() => ({ lit: createPool(CAPACITY), bright: createPool(BRIGHT_CAPACITY) }), []);
  const materials = useMemo(
    () => ({
      lit: new MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.6, depthWrite: false }),
      bright: new MeshBasicMaterial({ toneMapped: false }),
    }),
    [],
  );
  const scratch = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);

  useImperativeHandle(ref, () => ({
    emit(kind, x, y, z, count, dir, color) {
      const spec = SPECS[kind];
      const pool = spec.bright ? pools.bright : pools.lit;
      const mesh = spec.bright ? bright.current : lit.current;
      if (!mesh) return;
      for (let n = 0; n < count; n += 1) {
        const i = pool.cursor;
        pool.cursor = (pool.cursor + 1) % pool.capacity;
        pool.kind[i] = kind;
        pool.px[i] = x + (Math.random() - 0.5) * 0.2;
        pool.py[i] = y + Math.random() * 0.08;
        pool.pz[i] = z + (Math.random() - 0.5) * 0.3;
        pool.vx[i] = -dir * between(spec.back);
        pool.vy[i] = between(spec.up);
        pool.vz[i] = (Math.random() - 0.5) * 2 * spec.side;
        pool.age[i] = 0;
        pool.life[i] = between(spec.life);
        pool.size[i] = between(spec.size);
        scratch.color.set(color ?? spec.colors[Math.floor(Math.random() * spec.colors.length)]!);
        mesh.setColorAt(i, scratch.color);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  }), [pools, scratch]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * (timeScale.current ?? 1);
    const { dummy } = scratch;
    for (const [pool, mesh] of [[pools.lit, lit.current], [pools.bright, bright.current]] as const) {
      if (!mesh) continue;
      for (let i = 0; i < pool.capacity; i += 1) {
        const kind = pool.kind[i];
        if (!kind) {
          dummy.scale.setScalar(0);
        } else {
          const spec = SPECS[kind];
          pool.age[i]! += dt;
          const k = pool.age[i]! / pool.life[i]!;
          if (k >= 1) {
            pool.kind[i] = null;
            dummy.scale.setScalar(0);
          } else {
            const slow = Math.exp(-spec.drag * dt);
            pool.vx[i]! *= slow;
            pool.vz[i]! *= slow;
            pool.vy[i] = pool.vy[i]! * (spec.gravity > 0 ? slow : 1) + spec.gravity * dt;
            pool.px[i]! += pool.vx[i]! * dt;
            pool.py[i]! += pool.vy[i]! * dt;
            pool.pz[i]! += pool.vz[i]! * dt;
            // Grow fast, then shrink to nothing: no per-instance alpha needed.
            const swell = 1 + (spec.grow - 1) * Math.min(1, k * 3);
            const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
            dummy.position.set(pool.px[i]!, pool.py[i]!, pool.pz[i]!);
            dummy.rotation.set(pool.age[i]! * 5, pool.age[i]! * 3 + i, 0);
            dummy.scale.setScalar(pool.size[i]! * swell * fade);
          }
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={lit} args={[SHAPE, materials.lit, CAPACITY]} frustumCulled={false} />
      <instancedMesh ref={bright} args={[SHAPE, materials.bright, BRIGHT_CAPACITY]} frustumCulled={false} />
    </>
  );
}
