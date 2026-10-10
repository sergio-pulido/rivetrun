'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { AdditiveBlending, BoxGeometry, MeshBasicMaterial, Object3D, type InstancedMesh } from 'three';
import { LANES } from '../palette';
import type { Pose } from './pose';

const LINE = new BoxGeometry(1, 1, 1);
const COUNT = 22;
/** Lines appear above this speed and are at full strength this much faster. */
const FROM_MPS = 2.1;
const FULL_OVER_MPS = 1.3;
const SPAN = 11;

interface SpeedLinesProps {
  pose: RefObject<Pose>;
  /** 0–1: fraction of the lines to draw (0.5 on weak devices). */
  budget?: number;
}

/** Thin streaks rushing past the player's robot when it is going fast: one instanced draw call, nothing below 2 m/s. */
export function SpeedLines({ pose, budget = 1 }: SpeedLinesProps) {
  const count = Math.max(4, Math.round(COUNT * budget));
  const mesh = useRef<InstancedMesh>(null);
  const travel = useRef(0);
  const strength = useRef(0);
  const material = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => [((i * 61) % 97) / 97, ((i * 29) % 83) / 83, ((i * 47) % 89) / 89] as const), []);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame((_, rawDt) => {
    const node = mesh.current;
    if (!node) return;
    const p = pose.current;
    const dt = Math.min(rawDt, 0.1);
    const wanted = p.ready ? Math.min(1, Math.max(0, (Math.abs(p.v) - FROM_MPS) / FULL_OVER_MPS)) : 0;
    strength.current += (wanted - strength.current) * Math.min(1, dt * 5);
    const s = strength.current;
    node.visible = s > 0.02;
    if (!node.visible) return;
    material.opacity = s * 0.3;
    // The lines stand still in the world while the robot passes them, a little faster than it really is.
    travel.current -= p.v * dt * 2.2;
    for (let i = 0; i < count; i += 1) {
      const [a, b, c] = seeds[i]!;
      const x = (((a * SPAN + travel.current * (0.8 + b * 0.5)) % SPAN) + SPAN) % SPAN - SPAN * 0.4;
      dummy.position.set(p.x + x, p.y + 0.25 + b * 2.1, LANES.player - 1.3 + c * 2.9);
      dummy.scale.set(0.5 + s * 1.6 + a * 0.6, 0.012, 0.012);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    }
    node.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh key={count} ref={mesh} args={[LINE, material, count]} frustumCulled={false} visible={false} renderOrder={4} />;
}
