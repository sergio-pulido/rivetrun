'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import type { DirectionalLight } from 'three';
import type { Weather } from '@rivetrun/contracts';
import { SKY } from '../palette';
import type { TrackLayout } from '../track';
import { Backdrop } from './Backdrop';
import { Dressing } from './Dressing';
import { Reflections } from './Reflections';
import { Features } from './Features';
import { Terrain } from './Terrain';
import { WeatherFx } from './WeatherFx';

interface WorldProps {
  layout: TrackLayout;
  weather: Weather;
  /** The one shadow-casting light. The camera rig moves it (and its target) with the action. */
  sun: RefObject<DirectionalLight | null>;
  /** 0–1: weather particle budget. */
  budget?: number;
  /** Half-width of the shadowed area around the light target, world units. */
  shadowSpan?: number;
  /** Lane centres (Z). Paint lines and big props stay between them. */
  lanes?: readonly number[];
  /** Running late: no reflection environment, plain lights only. */
  plain?: boolean;
}

/** Everything that is not a robot: fog, lights, reflections, backdrop, the track strip and its dressing, weather. */
export function World({ layout, weather, sun, budget = 1, shadowSpan = 9, lanes, plain = false }: WorldProps) {
  const sky = SKY[weather];
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const light = sun.current;
    if (!light) return undefined;
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [scene, sun]);

  return (
    <>
      <fog attach="fog" args={[sky.fog, 40, 330]} />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.hemiIntensity]} />
      <directionalLight
        ref={sun}
        color={sky.sun}
        intensity={sky.sunIntensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      <directionalLight color="#cfe0ff" intensity={0.55} position={[-4, 3, 12]} />
      <Reflections plain={plain}>
      <Environment resolution={64} frames={1}>
        <color attach="background" args={[sky.mid]} />
        <Lightformer form="rect" intensity={2.2} color={sky.horizon} position={[0, 2, -8]} scale={[30, 6, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[0, 9, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={0.5} color={sky.hemiGround} position={[0, -6, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[30, 30, 1]} />
      </Environment>
      </Reflections>

      <Backdrop layout={layout} weather={weather} />
      <Terrain layout={layout} />
      <Dressing layout={layout} lanes={lanes} />
      <Features layout={layout} />
      <WeatherFx weather={weather} budget={budget} />
    </>
  );
}
