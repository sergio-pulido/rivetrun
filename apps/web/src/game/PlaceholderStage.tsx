'use client';

import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';

/** Mobile performance budget from the spec. */
export const MAX_DPR = 1.5;

interface PlaceholderStageProps {
  cameraPosition: readonly [number, number, number];
  groundColor: string;
  groundSize: readonly [number, number];
  children: ReactNode;
}

/** Shared scaffold stage: capped DPR, one shadow-casting light, a flat strip. */
export function PlaceholderStage({ cameraPosition, groundColor, groundSize, children }: PlaceholderStageProps) {
  return (
    <Canvas
      shadows
      dpr={[1, MAX_DPR]}
      camera={{ position: [...cameraPosition], fov: 40 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <color attach="background" args={['#0f141b']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[...groundSize]} />
        <meshStandardMaterial color={groundColor} roughness={1} />
      </mesh>
      {children}
    </Canvas>
  );
}
