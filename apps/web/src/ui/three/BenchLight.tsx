'use client';

import { Environment, Lightformer } from '@react-three/drei';

/** Workshop lighting for the small part and assembly stages: warm key, blueprint-blue rim, soft reflections. */
export function BenchLight() {
  return (
    <>
      <hemisphereLight args={['#cfe4ff', '#1a2433', 0.9]} />
      <directionalLight position={[3.5, 6.5, 4.5]} intensity={2.4} color="#fff3e0" />
      <directionalLight position={[-5, 3, -5]} intensity={1.3} color="#3b82c4" />
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#16202c']} />
        <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={2} color="#3b82c4" position={[-6, 2, -4]} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#ff7a1a" position={[6, 1, 3]} scale={[4, 3, 1]} />
      </Environment>
    </>
  );
}
