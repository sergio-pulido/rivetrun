'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, IcosahedronGeometry, MeshBasicMaterial, Shape, ShapeGeometry, type Group } from 'three';
import type { Weather } from '@rivetrun/contracts';
import { SKY } from '../palette';
import { mulberry32 } from '../rng';
import type { TrackLayout } from '../track';
import { glowTexture, skyTexture } from './textures';

function ridgeGeometry(fromX: number, toX: number, baseY: number, height: number, seed: number): ShapeGeometry {
  const rand = mulberry32(seed);
  const shape = new Shape();
  shape.moveTo(fromX, baseY - 30);
  const step = 6 + height * 0.5;
  for (let x = fromX; x <= toX + step; x += step) {
    const peak = Math.sin(x * 0.045 + seed) * 0.35 + Math.sin(x * 0.11 + seed * 2) * 0.2 + rand() * 0.45;
    shape.lineTo(x, baseY + height * (0.45 + peak * 0.55));
  }
  shape.lineTo(toX + step, baseY - 30);
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
  const far = useRef<Group>(null);
  const clouds = useRef<Group>(null);

  useEffect(() => {
    scene.background = skyTexture(look.top, look.mid, look.horizon);
    return () => {
      scene.background = null;
    };
  }, [scene, look]);

  const ridges = useMemo(() => {
    const from = -90;
    const to = layout.lengthM + 110;
    const base = layout.minY - 1;
    const top = layout.maxY;
    return [
      { z: -74, geometry: ridgeGeometry(from, to, base + 4, 9 + top, 3), color: look.hills[0] },
      { z: -110, geometry: ridgeGeometry(from - 40, to + 40, base + 6, 17 + top, 11), color: look.hills[1] },
      { z: -160, geometry: ridgeGeometry(from - 80, to + 80, base + 8, 30 + top, 23), color: look.hills[2] },
    ];
  }, [layout, look]);
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
      y: 15 + rand() * 9,
      z: -60 - rand() * 50,
      scale: 2.4 + rand() * 2.6,
    }));
  }, [weather]);

  useFrame(({ clock }) => {
    // Sun and clouds sit at "infinity": they follow the camera.
    if (far.current) far.current.position.x = camera.position.x;
    if (clouds.current) {
      const span = 16 * cloudField.length;
      const drift = (clock.elapsedTime * 0.5) % span;
      clouds.current.position.x = camera.position.x * 0.92 + drift - span / 2 + 24;
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
        <mesh material={sunMaterial} position={[26, layout.maxY + 34, -190]}>
          <circleGeometry args={[7, 24]} />
        </mesh>
        <mesh material={glowMaterial} position={[26, layout.maxY + 34, -189]}>
          <planeGeometry args={[70, 70]} />
        </mesh>
      </group>
      <group ref={clouds} position={[0, layout.maxY, 0]}>
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
