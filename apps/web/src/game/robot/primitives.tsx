'use client';

import { useContext } from 'react';
import { BoxGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, TorusGeometry, type Material } from 'three';
import { RobotContext } from './drive';

export type V3 = readonly [number, number, number];

// Unit geometries shared by every part: a robot is ~150 scaled boxes and cylinders.
const BOX = new BoxGeometry(1, 1, 1);
const CYLINDERS = new Map<number, CylinderGeometry>();
const cylinder = (segments: number): CylinderGeometry => {
  const cached = CYLINDERS.get(segments);
  if (cached) return cached;
  const made = new CylinderGeometry(1, 1, 1, segments);
  CYLINDERS.set(segments, made);
  return made;
};
export const SPHERE = new SphereGeometry(1, 12, 8);
export const ICO = new IcosahedronGeometry(1, 0);
export const HALF_RING = new TorusGeometry(1, 0.28, 6, 10, Math.PI * 1.4);

interface BoxProps {
  /** Size. */
  s: V3;
  /** Position. */
  p?: V3;
  /** Rotation (Euler XYZ). */
  r?: V3;
  m: Material;
  shadow?: boolean;
}

/** Ghost robots are translucent: they cast no shadows. */
const useCastsShadow = (shadow: boolean): boolean => {
  const lite = useContext(RobotContext)?.lite ?? false;
  return shadow && !lite;
};

export function Box({ s, p, r, m, shadow = true }: BoxProps) {
  const castShadow = useCastsShadow(shadow);
  return <mesh geometry={BOX} material={m} scale={s as [number, number, number]} position={p as [number, number, number] | undefined} rotation={r as [number, number, number] | undefined} castShadow={castShadow} />;
}

const AXIS_ROTATION: Readonly<Record<'x' | 'y' | 'z', V3>> = {
  x: [0, 0, Math.PI / 2],
  y: [0, 0, 0],
  z: [Math.PI / 2, 0, 0],
};

interface CylProps {
  rad: number;
  /** Length along the axis. */
  h: number;
  p?: V3;
  axis?: 'x' | 'y' | 'z';
  m: Material;
  seg?: number;
  shadow?: boolean;
}

export function Cyl({ rad, h, p, axis = 'y', m, seg = 12, shadow = true }: CylProps) {
  const castShadow = useCastsShadow(shadow);
  return (
    <mesh
      geometry={cylinder(seg)}
      material={m}
      scale={[rad, h, rad]}
      position={p as [number, number, number] | undefined}
      rotation={AXIS_ROTATION[axis] as [number, number, number]}
      castShadow={castShadow}
    />
  );
}
