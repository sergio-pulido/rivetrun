'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';

const WHEEL_POSITIONS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.45, -0.25, 0.42],
  [0.45, -0.25, 0.42],
  [-0.45, -0.25, -0.42],
  [0.45, -0.25, -0.42],
];

interface PlaceholderRobotProps {
  /** Turntable speed, rad/s. */
  spin?: number;
}

/** Scaffold-only box robot. The render session replaces it with RobotModel(build). */
export function PlaceholderRobot({ spin = 0.8 }: PlaceholderRobotProps) {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += spin * delta;
  });

  return (
    <group ref={group} position={[0, 0.55, 0]}>
      {/* chassis: orange printed bracket */}
      <mesh castShadow>
        <boxGeometry args={[1.2, 0.3, 0.7]} />
        <meshStandardMaterial color="#ff6a13" roughness={0.6} />
      </mesh>
      {/* PCB */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.7, 0.06, 0.5]} />
        <meshStandardMaterial color="#1f7a4d" roughness={0.5} />
      </mesh>
      {WHEEL_POSITIONS.map((position) => (
        <mesh key={position.join(',')} position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.16, 16]} />
          <meshStandardMaterial color="#16181c" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
