'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useRef } from 'react';
import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type Group } from 'three';
import { UI } from '../palette';
import { BAKE_STOP, Bake } from './bake';
import { RobotContext } from './drive';
import { useMats, withBakeKey } from './materials';
import { Part } from './Part';
import type { RoverPick } from './pick';
import { Box, Cyl, SPHERE } from './primitives';

const SHELL = withBakeKey(new MeshStandardMaterial({ color: '#23272e', roughness: 0.45, metalness: 0.3 }), 'metal');
const ARM = withBakeKey(new MeshStandardMaterial({ color: '#5b6470', roughness: 0.5, metalness: 0.4 }), 'metal');
const LENS = new MeshStandardMaterial({ color: '#141518', roughness: 0.15, metalness: 0.6 });
const DISC = new MeshBasicMaterial({ color: '#c9d6e6', transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide });
const TRIM = withBakeKey(new MeshBasicMaterial({ color: UI.cyan, toneMapped: false }), 'glow');
const BEACON = new MeshBasicMaterial({ color: UI.safety, toneMapped: false });

const ROTOR_OFFSET = 0.2;
const ROTOR_RADIUS = 0.13;
const ROTORS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Small quadcopter: dark shell with a cyan trim, four blurred rotors, a camera ball underneath. Origin = body centre. */
export function DroneModel() {
  const blades = useRef<Array<Group | null>>([]);
  const beacon = useRef<Group>(null);

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05) * 42;
    blades.current.forEach((blade, i) => {
      if (blade) blade.rotation.y += i % 2 === 0 ? step : -step;
    });
    if (beacon.current) beacon.current.visible = clock.elapsedTime % 0.8 < 0.4;
  });

  return (
    <Bake>
      <Box s={[0.26, 0.1, 0.2]} m={SHELL} />
      <Box s={[0.27, 0.016, 0.21]} p={[0, 0.012, 0]} m={TRIM} shadow={false} />
      <Box s={[0.14, 0.03, 0.12]} p={[-0.02, 0.06, 0]} m={ARM} />
      <Box s={[0.62, 0.028, 0.045]} r={[0, Math.PI / 4, 0]} m={ARM} />
      <Box s={[0.62, 0.028, 0.045]} r={[0, -Math.PI / 4, 0]} m={ARM} />
      {ROTORS.map(([ax, side], i) => (
        <group key={`${ax}${side}`} position={[ax * ROTOR_OFFSET, 0.03, side * ROTOR_OFFSET]}>
          <Cyl rad={0.035} h={0.07} m={SHELL} seg={8} />
          <Cyl rad={ROTOR_RADIUS} h={0.004} p={[0, 0.05, 0]} m={DISC} seg={18} shadow={false} />
          <group
            position={[0, 0.052, 0]}
            userData={BAKE_STOP}
            ref={(node) => {
              blades.current[i] = node;
            }}
          >
            <Box s={[ROTOR_RADIUS * 2, 0.006, 0.028]} m={ARM} shadow={false} />
          </group>
        </group>
      ))}
      <Cyl rad={0.03} h={0.05} p={[0.04, -0.07, 0]} m={ARM} seg={8} />
      <mesh geometry={SPHERE} material={LENS} scale={0.06} position={[0.04, -0.12, 0]} castShadow />
      <mesh geometry={SPHERE} material={TRIM} scale={0.026} position={[0.085, -0.13, 0]} />
      <group ref={beacon}>
        <mesh geometry={SPHERE} material={BEACON} scale={0.02} position={[0.135, 0.01, 0.06]} />
      </group>
      {[1, -1].map((side) => (
        <Box key={side} s={[0.22, 0.014, 0.014]} p={[0, -0.09, side * 0.11]} m={ARM} shadow={false} />
      ))}
    </Bake>
  );
}

/** Landing pad on the rear deck. The drone idles just above it unless it is flying ahead. */
export function ScoutDronePad({ floor, pick }: { floor: number; pick: RoverPick }) {
  const m = useMats();
  const context = useContext(RobotContext);
  const hover = useRef<Group>(null);
  const away = context?.droneAway ?? false;

  useFrame(({ clock }) => {
    if (hover.current) hover.current.position.y = 0.6 + Math.sin(clock.elapsedTime * 2.6) * 0.03;
  });

  return (
    <Part position={[-0.72, 0.04, 0]} floor={floor + 0.1} pick={pick}>
      {[0.27, -0.27].map((z) => (
        <Box key={z} s={[0.05, 0.36, 0.05]} p={[0, 0.18, z]} m={m.print} />
      ))}
      <Box s={[0.46, 0.03, 0.62]} p={[0, 0.375, 0]} m={m.printDark} />
      <Cyl rad={0.19} h={0.01} p={[0, 0.395, 0]} m={m.ledBlue} seg={20} shadow={false} />
      <Cyl rad={0.16} h={0.012} p={[0, 0.396, 0]} m={m.chip} seg={20} shadow={false} />
      {!away && !context?.lite && (
        <group ref={hover} position={[0, 0.6, 0]}>
          <DroneModel />
        </group>
      )}
    </Part>
  );
}
