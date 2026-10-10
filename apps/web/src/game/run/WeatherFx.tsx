'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, MeshBasicMaterial, Object3D, type InstancedMesh } from 'three';
import type { Atmosphere } from '../atmosphere';

const BOX_X = 16;
const BOX_Y = 16;
const BOX_Z = 12;
const STREAK = new BoxGeometry(1, 1, 1);

/** Drops or flakes at full budget. One instanced mesh each: one draw call however hard it rains. */
const FALLING = { none: 0, rain: 260, heavy_rain: 440, snow: 300 } as const;
const WIND_STREAKS = 34;
/** Below this the air looks still. */
const CALM_MPS = 2;

interface WeatherFxProps {
  atmosphere: Atmosphere;
  /** 0–1: fraction of the particles to draw (0.5 on weak devices). */
  budget?: number;
  /** Headwind right now, m/s, gusts included (SimState.windMps). Absent = the mission's steady wind. */
  windNow?: () => number;
}

/**
 * Rain, snow and wind in a box that follows the camera. Rain slants and snow drifts with the wind;
 * wind itself shows as streaks high up and dust near the ground, stronger in a gust.
 */
export function WeatherFx({ atmosphere, budget = 1, windNow }: WeatherFxProps) {
  const { precipitation } = atmosphere;
  const snow = precipitation === 'snow';
  const heavy = precipitation === 'heavy_rain';
  const falling = Math.round(FALLING[precipitation] * budget);
  const windy = Math.abs(atmosphere.windMps) >= CALM_MPS || atmosphere.gustMps >= CALM_MPS;
  const streaks = windy ? Math.round(WIND_STREAKS * budget) : 0;
  const fall = useRef<InstancedMesh>(null);
  const air = useRef<InstancedMesh>(null);
  const wind = useRef(atmosphere.windMps);
  const drift = useRef(0);
  const camera = useThree((state) => state.camera);
  const seeds = useMemo(() => Array.from({ length: 440 }, (_, i) => [((i * 73) % 101) / 101, ((i * 37) % 89) / 89, ((i * 19) % 97) / 97] as const), []);
  const fallMaterial = useMemo(
    () => new MeshBasicMaterial({ color: snow ? '#ffffff' : '#cfe3ff', transparent: true, opacity: snow ? 0.9 : heavy ? 0.55 : 0.45, fog: false }),
    [snow, heavy],
  );
  const airMaterial = useMemo(() => new MeshBasicMaterial({ color: atmosphere.night ? '#8fa2c4' : '#f3ead8', transparent: true, opacity: 0.3, fog: false, depthWrite: false }), [atmosphere.night]);
  useEffect(() => () => fallMaterial.dispose(), [fallMaterial]);
  useEffect(() => () => airMaterial.dispose(), [airMaterial]);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime;
    const dt = Math.min(rawDt, 0.1);
    // Ease towards the wind of the moment so a gust builds and dies instead of snapping.
    wind.current += ((windNow ? windNow() : atmosphere.windMps) - wind.current) * Math.min(1, dt * 3);
    const w = wind.current;
    // A headwind blows against the direction of travel: towards −x.
    drift.current -= w * dt;

    const drops = fall.current;
    if (drops) {
      const speed = snow ? 1.6 : heavy ? 24 : 19;
      // How far a drop is carried sideways per unit it falls.
      const slant = snow ? 0 : Math.max(-0.9, Math.min(0.9, -w / speed));
      const lean = Math.atan(slant);
      for (let i = 0; i < falling; i += 1) {
        const [a, b, c] = seeds[i]!;
        const y = BOX_Y - ((b * BOX_Y + t * speed * (0.7 + a * 0.6)) % BOX_Y);
        const fallen = BOX_Y - y;
        const carried = snow ? drift.current * 0.6 + Math.sin(t * 1.3 + i) * 0.5 : fallen * slant - fallen * 0.12;
        const x = (((a - 0.5) * BOX_X + carried) % BOX_X + BOX_X * 1.5) % BOX_X - BOX_X / 2;
        dummy.position.set(camera.position.x + x, camera.position.y - 14 + y, 4 - c * BOX_Z);
        dummy.rotation.set(0, 0, snow ? t + i : 0.12 - lean);
        dummy.scale.set(snow ? 0.05 : 0.014, snow ? 0.05 : heavy ? 0.7 : 0.5, snow ? 0.05 : 0.014);
        dummy.updateMatrix();
        drops.setMatrixAt(i, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    }

    const gusts = air.current;
    if (gusts) {
      const strength = Math.min(1, Math.abs(w) / 14);
      airMaterial.opacity = 0.08 + strength * 0.4;
      const span = BOX_X + 6;
      for (let i = 0; i < streaks; i += 1) {
        const [a, b, c] = seeds[i]!;
        // Every other one is dust low over the ground; the rest are long streaks higher up.
        const dust = i % 2 === 0;
        const x = (((a * span + drift.current * (dust ? 0.9 : 1.6) * (0.7 + b * 0.6)) % span) + span) % span - span / 2;
        const y = dust ? 0.15 + b * 1.4 : 2 + b * 6;
        dummy.position.set(camera.position.x + x, camera.position.y - 6.4 + y, 3 - c * (BOX_Z - 3));
        dummy.rotation.set(0, 0, 0);
        const length = dust ? 0.12 + strength * 0.25 : 0.8 + strength * 2.6;
        dummy.scale.set(length, dust ? 0.05 : 0.012, dust ? 0.05 : 0.012);
        dummy.updateMatrix();
        gusts.setMatrixAt(i, dummy.matrix);
      }
      gusts.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {falling > 0 && <instancedMesh key={`f${falling}`} ref={fall} args={[STREAK, fallMaterial, falling]} frustumCulled={false} />}
      {streaks > 0 && <instancedMesh key={`w${streaks}`} ref={air} args={[STREAK, airMaterial, streaks]} frustumCulled={false} />}
    </>
  );
}
