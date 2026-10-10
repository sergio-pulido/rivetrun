'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, ConeGeometry, DoubleSide, MeshBasicMaterial, type Object3D, type SpotLight } from 'three';

const LAMP = new BoxGeometry(1, 1, 1);
/** Open cone along +X with its tip at the origin: the visible beam. */
const BEAM = new ConeGeometry(1.25, 6, 14, 1, true).rotateZ(Math.PI / 2).translate(3, 0, 0);
const WARM = '#ffe9bf';

/**
 * The robot's own lights for night missions: one spotlight (no shadow, so it costs a light, not a
 * shadow pass), two lamps and a faint beam. Mount inside the robot's group; `nose` is the distance
 * from the middle of the robot to its front.
 */
export function Headlights({ nose }: { nose: number }) {
  const light = useRef<SpotLight>(null);
  const aim = useRef<Object3D>(null);
  const lamp = useMemo(() => new MeshBasicMaterial({ color: '#fff6dc', fog: false }), []);
  const beam = useMemo(() => new MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }), []);
  useEffect(() => {
    if (light.current && aim.current) light.current.target = aim.current;
  }, []);
  useEffect(
    () => () => {
      lamp.dispose();
      beam.dispose();
    },
    [lamp, beam],
  );
  return (
    <group>
      <spotLight ref={light} position={[nose - 0.2, 0.7, 0]} angle={0.6} penumbra={0.75} intensity={70} distance={17} decay={1.5} color={WARM} />
      <object3D ref={aim} position={[nose + 6, 0, 0]} />
      {[0.26, -0.26].map((z) => (
        <mesh key={z} geometry={LAMP} material={lamp} position={[nose - 0.1, 0.46, z]} scale={[0.05, 0.08, 0.12]} />
      ))}
      <mesh geometry={BEAM} material={beam} position={[nose - 0.05, 0.46, 0]} rotation={[0, 0, -0.06]} renderOrder={3} />
    </group>
  );
}
