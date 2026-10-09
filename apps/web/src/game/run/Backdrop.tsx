'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, IcosahedronGeometry, MeshBasicMaterial, Shape, ShapeGeometry, type Group } from 'three';
import type { Weather } from '@rivetrun/contracts';
import { SKY } from '../palette';
import { clamp, mulberry32 } from '../rng';
import type { TrackLayout } from '../track';
import { glowTexture, skyTexture } from './textures';

/** A jagged silhouette. `feature` = width of one facet, so far ridges stay readable in a narrow view. */
function ridgeGeometry(fromX: number, toX: number, baseY: number, height: number, feature: number, seed: number): ShapeGeometry {
  const rand = mulberry32(seed);
  const shape = new Shape();
  shape.moveTo(fromX, baseY - 60);
  for (let x = fromX; x <= toX + feature; x += feature) {
    const wave = Math.sin((x / feature) * 0.9 + seed) * 0.5 + Math.sin((x / feature) * 0.37 + seed * 2) * 0.3;
    shape.lineTo(x, baseY + height * clamp(0.5 + wave * 0.45 + (rand() - 0.5) * 0.35, 0, 1));
  }
  shape.lineTo(toX + feature, baseY - 60);
  return new ShapeGeometry(shape);
}

const CLOUD = new IcosahedronGeometry(1, 1);
const PUFFS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 1],
  [1.3, -0.15, 0.2, 0.75],
  [-1.2, -0.2, -0.1, 0.7],
  [0.5, 0.45, -0.2, 0.65],
];

interface BackdropProps {
  layout: TrackLayout;
  weather: Weather;
}

/** Sky gradient, sun, three hill ridges and drifting low-poly clouds. */
export function Backdrop({ layout, weather }: BackdropProps) {
  const look = SKY[weather];
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const mid = (layout.minY + layout.maxY) / 2;
  const far = useRef<Group>(null);
  const clouds = useRef<Group>(null);

  useEffect(() => {
    scene.background = skyTexture(look.top, look.mid, look.horizon);
    return () => {
      scene.background = null;
    };
  }, [scene, look]);

  const ridges = useMemo(() => {
    // The camera looks down ~15°, so the backdrop sits below track level: a valley seen from a plateau.
    const from = -70;
    const to = layout.lengthM + 90;
    return [
      { z: -60, geometry: ridgeGeometry(from, to, mid - 8.6, 5.6, 3.2, 3), color: look.hills[0] },
      { z: -95, geometry: ridgeGeometry(from - 20, to + 20, mid - 10.2, 6.2, 5.5, 11), color: look.hills[1] },
      { z: -140, geometry: ridgeGeometry(from - 40, to + 40, mid - 11.2, 6.6, 9, 23), color: look.hills[2] },
    ];
  }, [layout.lengthM, mid, look]);
  useEffect(() => () => ridges.forEach((ridge) => ridge.geometry.dispose()), [ridges]);

  const cloudMaterial = useMemo(
    () => new MeshBasicMaterial({ color: weather === 'rain' ? '#8493a1' : '#ffffff', transparent: true, opacity: weather === 'rain' ? 0.75 : 0.9, fog: false }),
    [weather],
  );
  const sunMaterial = useMemo(() => new MeshBasicMaterial({ color: look.sun, fog: false }), [look]);
  const glowMaterial = useMemo(
    () => new MeshBasicMaterial({ map: glowTexture(), color: look.sun, transparent: true, opacity: weather === 'rain' ? 0.25 : 0.7, blending: AdditiveBlending, depthWrite: false, fog: false }),
    [look, weather],
  );
  const cloudField = useMemo(() => {
    const rand = mulberry32(42);
    return Array.from({ length: weather === 'rain' ? 12 : 7 }, (_, i) => ({
      x: (i - 3) * 16 + rand() * 8,
      y: -9 + rand() * 6.5,
      z: -168 - rand() * 16,
      scale: 3 + rand() * 3,
    }));
  }, [weather]);

  useFrame(({ clock }) => {
    // Sun and clouds sit at "infinity": they follow the camera.
    if (far.current) far.current.position.x = camera.position.x;
    if (clouds.current) {
      const span = 16 * cloudField.length;
      const drift = (clock.elapsedTime * 0.5) % span;
      clouds.current.position.x = camera.position.x * 0.94 + drift - span / 2 + 24;
    }
  });

  return (
    <>
      {ridges.map((ridge) => (
        <mesh key={ridge.z} geometry={ridge.geometry} position={[0, 0, ridge.z]}>
          <meshBasicMaterial color={ridge.color} />
        </mesh>
      ))}
      <group ref={far}>
        <mesh material={sunMaterial} position={[13, mid - 6.5, -190]}>
          <circleGeometry args={[5.5, 28]} />
        </mesh>
        <mesh material={glowMaterial} position={[13, mid - 6.5, -189]}>
          <planeGeometry args={[46, 46]} />
        </mesh>
      </group>
      <group ref={clouds} position={[0, mid, 0]}>
        {cloudField.map((cloud, i) => (
          <group key={i} position={[cloud.x, cloud.y, cloud.z]} scale={[cloud.scale * 1.6, cloud.scale * 0.6, cloud.scale]}>
            {PUFFS.map(([x, y, z, r]) => (
              <mesh key={x} geometry={CLOUD} material={cloudMaterial} position={[x, y, z]} scale={r} />
            ))}
          </group>
        ))}
      </group>
    </>
  );
}
