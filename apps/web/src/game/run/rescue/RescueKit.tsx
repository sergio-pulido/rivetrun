'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AdditiveBlending, Color, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Vector3, type InstancedMesh, type PerspectiveCamera } from 'three';
import { LANES } from '../../palette';
import { glowTexture } from '../textures';
import type { PropId } from './kit';
import { loadRescueKit, type KitProp, type RescueKit as Kit } from './loadKit';
import type { Placement } from './placement';

export type KitState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly kit: Kit } | { readonly status: 'failed' };

/**
 * The prop kit for this run: loading, ready, or failed (the caller then draws the procedural street).
 * Loading starts when `enabled` turns true.
 */
export function useRescueKit(enabled: boolean): KitState {
  const [state, setState] = useState<KitState>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    loadRescueKit().then(
      (kit) => {
        if (live) setState({ status: 'ready', kit });
      },
      () => {
        if (live) setState({ status: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

const BODY = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04 });
const HALO = new PlaneGeometry(1, 1);
/** Halo colour and size per glowing prop. The beacon is the scan-zone cyan and pulses; work lights are warm and steady. */
const HALOS: Partial<Record<PropId, { readonly color: string; readonly size: number; readonly pulse: boolean }>> = {
  rescue_beacon: { color: '#3fe0ff', size: 1.5, pulse: true },
  emergency_tripod_light: { color: '#ffb766', size: 3.4, pulse: false },
};

interface Batch {
  readonly prop: KitProp;
  /** Instance matrices, sorted along the track. */
  readonly matrices: Float32Array;
  readonly xs: Float32Array;
  /** How far an instance reaches either side of its x. */
  readonly reach: number;
}

interface Halo {
  readonly at: Vector3;
  readonly size: number;
  readonly color: Color;
  readonly pulse: boolean;
}

function batchesOf(kit: Kit, placements: readonly Placement[]): { batches: Batch[]; halos: Halo[] } {
  const dummy = new Object3D();
  dummy.rotation.order = 'ZYX';
  const batches: Batch[] = [];
  const halos: Halo[] = [];
  for (const prop of kit.values()) {
    const items = placements.filter((item) => item.prop === prop.id).sort((a, b) => a.x - b.x);
    if (items.length === 0) continue;
    const matrices = new Float32Array(items.length * 16);
    const halo = HALOS[prop.id];
    items.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.yaw, item.slope);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      dummy.matrix.toArray(matrices, i * 16);
      if (halo && prop.glowAt) halos.push({ at: prop.glowAt.clone().applyMatrix4(dummy.matrix), size: halo.size * item.scale, color: new Color(halo.color), pulse: halo.pulse });
    });
    batches.push({ prop, matrices, xs: Float32Array.from(items, (item) => item.x), reach: Math.max(...items.map((item) => Math.hypot(item.halfS, item.halfZ))) + 0.5 });
  }
  return { batches, halos };
}

export interface RescueKitProps {
  kit: Kit;
  placements: readonly Placement[];
  /** Props cast shadows (off on weak devices, where there is no shadow pass). */
  shadows?: boolean;
  /** Halos around lamps and beacons (off with ?quality=low). */
  halos?: boolean;
}

/**
 * The M7 prop kit, instanced: one draw call per kind of prop, and only the instances near the camera are submitted,
 * so the whole street costs what the visible stretch costs.
 */
export function RescueKit({ kit, placements, shadows = false, halos: withHalos = true }: RescueKitProps) {
  const { batches, halos } = useMemo(() => batchesOf(kit, placements), [kit, placements]);
  const solids = useRef<Array<InstancedMesh | null>>([]);
  const glows = useRef<Array<InstancedMesh | null>>([]);
  const shown = useRef<Array<readonly [number, number]>>([]);
  const haloMesh = useRef<InstancedMesh>(null);
  const beaconMaterial = useMemo(() => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  const lampMaterial = useMemo(() => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  const haloMaterial = useMemo(() => new MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, fog: false }), []);
  useEffect(
    () => () => {
      beaconMaterial.dispose();
      lampMaterial.dispose();
      haloMaterial.dispose();
    },
    [beaconMaterial, lampMaterial, haloMaterial],
  );
  useLayoutEffect(() => {
    shown.current = [];
  }, [batches]);
  const tint = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const node = haloMesh.current;
    if (!node) return;
    const dummy = new Object3D();
    halos.forEach((halo, i) => {
      dummy.position.copy(halo.at);
      dummy.position.z += 0.12;
      dummy.scale.set(halo.size, halo.size, 1);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
      node.setColorAt(i, halo.color);
    });
    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  }, [halos, withHalos]);

  useFrame(({ camera, clock }) => {
    const eye = camera as PerspectiveCamera;
    // What the camera can see of the street, with room for the widest prop and for the opening fly-in's angle.
    const half = (eye.position.z - LANES.zBack + 2) * Math.tan((eye.fov * Math.PI) / 360) * eye.aspect + 6;
    const lo = eye.position.x - half;
    const hi = eye.position.x + half;
    batches.forEach((batch, i) => {
      const total = batch.xs.length;
      let from = 0;
      while (from < total && batch.xs[from]! + batch.reach < lo) from += 1;
      let to = from;
      while (to < total && batch.xs[to]! - batch.reach <= hi) to += 1;
      const was = shown.current[i];
      if (was && was[0] === from && was[1] === to) return;
      shown.current[i] = [from, to];
      for (const mesh of [solids.current[i], glows.current[i]]) {
        if (!mesh) continue;
        (mesh.instanceMatrix.array as Float32Array).set(batch.matrices.subarray(from * 16, to * 16));
        mesh.count = to - from;
        mesh.instanceMatrix.needsUpdate = true;
      }
    });

    // Beacons breathe; the lens and its halo together.
    const beat = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.4);
    beaconMaterial.color.setScalar(0.55 + beat * 0.45);
    const node = haloMesh.current;
    if (node?.instanceColor) {
      halos.forEach((halo, i) => {
        if (halo.pulse) node.setColorAt(i, tint.copy(halo.color).multiplyScalar(0.3 + beat * 0.7));
      });
      node.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group dispose={null}>
      {batches.map((batch, i) => (
        <group key={batch.prop.id}>
          <instancedMesh
            ref={(node) => {
              solids.current[i] = node;
            }}
            args={[batch.prop.solid, BODY, batch.xs.length]}
            frustumCulled={false}
            castShadow={shadows}
            receiveShadow
          />
          {batch.prop.glow && (
            <instancedMesh
              ref={(node) => {
                glows.current[i] = node;
              }}
              args={[batch.prop.glow, batch.prop.id === 'rescue_beacon' ? beaconMaterial : lampMaterial, batch.xs.length]}
              frustumCulled={false}
            />
          )}
        </group>
      ))}
      {withHalos && halos.length > 0 && <instancedMesh key={halos.length} ref={haloMesh} args={[HALO, haloMaterial, halos.length]} frustumCulled={false} renderOrder={3} />}
    </group>
  );
}
