'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, MeshBasicMaterial, Object3D, type InstancedMesh } from 'three';
import type { Weather } from '@rivetrun/contracts';

const COUNT = 260;
const BOX_X = 16;
const BOX_Y = 16;
const BOX_Z = 12;
const STREAK = new BoxGeometry(1, 1, 1);

interface WeatherFxProps {
  weather: Weather;
  /** 0–1: fraction of the streaks / flakes to draw. */
  budget?: number;
}

/** Rain streaks or drifting snow in a box that follows the camera. */
export function WeatherFx({ weather, budget = 1 }: WeatherFxProps) {
  const count = Math.round(COUNT * budget);
  const mesh = useRef<InstancedMesh>(null);
  const camera = useThree((state) => state.camera);
  const snow = weather === 'cold';
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => [((i * 73) % 101) / 101, ((i * 37) % 89) / 89, ((i * 19) % 97) / 97] as const), []);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: snow ? '#ffffff' : '#cfe3ff', transparent: true, opacity: snow ? 0.9 : 0.45, fog: false }),
    [snow],
  );
  const dummy = useMemo(() => new Object3D(), []);

  useFrame(({ clock }) => {
    const node = mesh.current;
    if (!node) return;
    const t = clock.elapsedTime;
    const fall = snow ? 1.6 : 19;
    for (let i = 0; i < count; i += 1) {
      const [a, b, c] = seeds[i]!;
      const y = BOX_Y - ((b * BOX_Y + t * fall * (0.7 + a * 0.6)) % BOX_Y);
      const sway = snow ? Math.sin(t * 1.3 + i) * 0.5 : -(BOX_Y - y) * 0.12;
      dummy.position.set(camera.position.x + (a - 0.5) * BOX_X + sway, camera.position.y - 14 + y, 4 - c * BOX_Z);
      dummy.rotation.set(0, 0, snow ? t + i : 0.12);
      dummy.scale.set(snow ? 0.05 : 0.014, snow ? 0.05 : 0.5, snow ? 0.05 : 0.014);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    }
    node.instanceMatrix.needsUpdate = true;
  });

  if (weather === 'clear') return null;
  return <instancedMesh key={count} ref={mesh} args={[STREAK, material, count]} frustumCulled={false} />;
}
