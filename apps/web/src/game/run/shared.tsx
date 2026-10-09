'use client';

import { useMemo } from 'react';
import { SpriteMaterial } from 'three';
import type { SimEffect } from '@rivetrun/contracts';
import { basinDepthAt, type LaidSegment } from '../track';
import type { ParticleKind } from './Particles';
import { labelTexture } from './textures';

/** How far above the bed a robot under thrust cruises: mid-water, with a slow bob. */
export const swimLift = (segment: LaidSegment, s: number, t: number): number => basinDepthAt(segment, s) * 0.4 + Math.sin(t * 2.1) * 0.06;

/** Which particles each sim effect throws, how many per sim second, and from where on the robot. */
export const EFFECT_PARTICLES: Readonly<Partial<Record<SimEffect, { kind: ParticleKind; rate: number; where: 'rear' | 'front' | 'top' }>>> = {
  dust: { kind: 'dust', rate: 30, where: 'rear' },
  splash: { kind: 'splash', rate: 46, where: 'rear' },
  mud_spray: { kind: 'mud', rate: 38, where: 'rear' },
  sparks: { kind: 'sparks', rate: 90, where: 'front' },
  smoke: { kind: 'smoke', rate: 13, where: 'top' },
  slip: { kind: 'ice', rate: 34, where: 'rear' },
  bubbles: { kind: 'bubbles', rate: 30, where: 'rear' },
};

/** Name tag floating over a robot. */
export function Tag({ text, color, y }: { text: string; color: string; y: number }) {
  const material = useMemo(
    () => new SpriteMaterial({ map: labelTexture(text, { color, background: 'rgba(15,20,27,0.82)', border: color }), depthTest: false, fog: false, transparent: true }),
    [text, color],
  );
  return <sprite material={material} position={[0, y, 0]} scale={[1.24, 0.31, 1]} renderOrder={10} />;
}
