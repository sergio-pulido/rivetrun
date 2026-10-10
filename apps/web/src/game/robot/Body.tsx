'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { RobotContext, type LocomotionGeometry } from './drive';
import { useMats } from './materials';
import { Part } from './Part';
import { Box, Cyl } from './primitives';

/** The procedural chassis stands for the printed base plate (`chassis_base` in docs/inputs/printed-parts.json). */
const CHASSIS_PICK = { printedPartId: 'chassis_base' } as const;

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Orange 3D-printed base: plate, side rails with lightening slots, axle brackets. */
export function Chassis({ geo, floor }: { geo: LocomotionGeometry; floor: number }) {
  const m = useMats();
  const lite = useContext(RobotContext)?.lite ?? false;
  const axleY = geo.radius - geo.deckY;
  return (
    <Part floor={floor + 0.06} pick={CHASSIS_PICK}>
      <Box s={[1.5, 0.08, 0.7]} m={m.print} />
      <Box s={[0.16, 0.08, 0.5]} p={[0.8, 0, 0]} m={m.print} />
      <Box s={[0.12, 0.08, 0.5]} p={[-0.8, 0, 0]} m={m.print} />
      {[1, -1].map((side) => (
        <group key={side} position={[0, 0, side * 0.36]}>
          <Box s={[1.36, 0.16, 0.05]} p={[0, -0.02, 0]} m={m.printDark} />
          {!lite && [-0.42, -0.14, 0.14, 0.42].map((x) => (
            <Box key={x} s={[0.16, 0.06, 0.06]} p={[x, -0.02, 0]} m={m.chip} shadow={false} />
          ))}
        </group>
      ))}
      {CORNERS.map(([ax, side]) => (
        <group key={`${ax}${side}`} position={[ax * geo.halfBase, 0, side * 0.3]}>
          <Box s={[0.14, Math.abs(axleY) + 0.14, 0.06]} p={[0, axleY / 2, side * 0.06]} m={m.print} />
          {!lite && <Cyl rad={0.035} h={0.08} axis="z" p={[0, axleY, side * 0.07]} m={m.steel} seg={6} shadow={false} />}
        </group>
      ))}
    </Part>
  );
}

/** Black servo blocks at each axle. The high-torque motor is bigger, with a steel can and red fins. */
export function Motors({ id, geo, floor }: { id: string; geo: LocomotionGeometry; floor: number }) {
  const m = useMats();
  const lite = useContext(RobotContext)?.lite ?? false;
  const torque = id === 'motor_torque';
  const pick = useMemo(() => ({ partId: id }), [id]);
  const axleY = geo.radius - geo.deckY;
  const z = geo.halfTrack - (torque ? 0.3 : 0.26);
  return (
    <>
      {CORNERS.map(([ax, side]) => (
        <Part key={`${ax}${side}`} position={[ax * geo.halfBase, axleY, side * z]} floor={floor + 0.1} pick={pick}>
          {torque ? (
            <>
              <Box s={[0.3, 0.26, 0.22]} m={m.servo} />
              <Cyl rad={0.1} h={0.2} axis="x" p={[-ax * 0.24, 0, 0]} m={m.steel} seg={12} />
              <Cyl rad={0.07} h={0.04} axis="x" p={[-ax * 0.355, 0, 0]} m={m.brass} seg={10} />
              {!lite && [-0.07, 0, 0.07].map((x) => (
                <Box key={x} s={[0.025, 0.07, 0.24]} p={[x, 0.16, 0]} m={m.finRed} shadow={false} />
              ))}
              <Box s={[0.31, 0.06, 0.225]} p={[0, -0.05, 0]} m={m.print} shadow={false} />
            </>
          ) : (
            <>
              <Box s={[0.24, 0.18, 0.16]} m={m.servo} />
              <Box s={[0.32, 0.03, 0.16]} p={[0, 0.04, 0]} m={m.servo} />
              {!lite && <Box s={[0.14, 0.09, 0.165]} p={[0, -0.02, 0]} m={m.servoLabel} shadow={false} />}
              <Cyl rad={0.05} h={0.05} axis="z" p={[0.05, 0, side * 0.1]} m={m.gold} seg={8} />
            </>
          )}
        </Part>
      ))}
    </>
  );
}

/** Small: blue LiPo pouch. Large: two 18650 cells in a holder. */
export function Battery({ id, floor }: { id: string; floor: number }) {
  const m = useMats();
  const large = id === 'battery_large';
  const pick = useMemo(() => ({ partId: id }), [id]);
  return (
    <Part position={[-0.54, 0.04, 0]} floor={floor + 0.08} pick={pick}>
      {large ? (
        <>
          <Box s={[0.5, 0.05, 0.4]} p={[0, 0.025, 0]} m={m.servo} />
          {[0.1, -0.1].map((z) => (
            <group key={z} position={[0, 0.13, z]}>
              <Cyl rad={0.085} h={0.42} axis="x" m={m.cell} seg={12} />
              <Cyl rad={0.05} h={0.46} axis="x" m={m.steel} seg={8} />
              <Cyl rad={0.087} h={0.1} axis="x" p={[-0.08, 0, 0]} m={m.label} seg={12} shadow={false} />
            </group>
          ))}
          <Box s={[0.05, 0.2, 0.42]} p={[0.25, 0.12, 0]} m={m.servo} />
          <Box s={[0.05, 0.2, 0.42]} p={[-0.25, 0.12, 0]} m={m.servo} />
        </>
      ) : (
        <>
          <Box s={[0.36, 0.11, 0.26]} p={[0, 0.055, 0]} m={m.lipo} />
          <Box s={[0.14, 0.115, 0.265]} p={[-0.04, 0.055, 0]} m={m.label} shadow={false} />
          <Box s={[0.05, 0.125, 0.3]} p={[0.11, 0.055, 0]} m={m.wireBlack} shadow={false} />
        </>
      )}
      <Box s={[0.3, 0.025, 0.025]} p={[0.3, large ? 0.2 : 0.11, 0.06]} r={[0, 0, -0.25]} m={m.wireRed} shadow={false} />
      <Box s={[0.3, 0.025, 0.025]} p={[0.3, large ? 0.2 : 0.11, -0.02]} r={[0, 0, -0.25]} m={m.wireBlack} shadow={false} />
    </Part>
  );
}

const PCB_X = 0.12;

/** PCB-green controller board on brass standoffs, with chip, headers, USB and a status LED. */
export function Controller({ floor }: { floor: number }) {
  const m = useMats();
  const context = useContext(RobotContext);
  const lite = context?.lite ?? false;
  const led = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (led.current) led.current.visible = Math.sin(clock.elapsedTime * 6) > -0.3 && !context?.drive.current.dnf;
  });

  return (
    <Part position={[PCB_X, 0.04, 0]} floor={floor + 0.05}>
      {CORNERS.map(([ax, side]) => (
        <Cyl key={`${ax}${side}`} rad={0.028} h={0.12} p={[ax * 0.3, 0.06, side * 0.22]} m={m.brass} seg={6} />
      ))}
      <Box s={[0.74, 0.035, 0.56]} p={[0, 0.135, 0]} m={m.pcb} />
      {!lite && (
        <group position={[0, 0.15, 0]}>
          <Box s={[0.2, 0.035, 0.2]} p={[-0.02, 0.02, 0]} m={m.chip} />
          <Box s={[0.6, 0.06, 0.045]} p={[0, 0.03, 0.24]} m={m.chip} />
          <Box s={[0.6, 0.06, 0.045]} p={[0, 0.03, -0.24]} m={m.chip} />
          <Box s={[0.6, 0.02, 0.02]} p={[0, 0.065, 0.24]} m={m.gold} shadow={false} />
          <Box s={[0.6, 0.02, 0.02]} p={[0, 0.065, -0.24]} m={m.gold} shadow={false} />
          <Box s={[0.12, 0.08, 0.14]} p={[-0.33, 0.04, -0.1]} m={m.steel} />
          <Cyl rad={0.045} h={0.11} p={[-0.25, 0.055, 0.12]} m={m.lipo} seg={8} />
          <Cyl rad={0.035} h={0.09} p={[-0.14, 0.045, 0.15]} m={m.chip} seg={8} />
          <Box s={[0.08, 0.03, 0.04]} p={[0.2, 0.015, -0.12]} m={m.steel} shadow={false} />
          <Box s={[0.1, 0.025, 0.06]} p={[0.22, 0.012, 0.1]} m={m.pcbDark} shadow={false} />
          <mesh ref={led} position={[0.3, 0.02, 0.17]} scale={[0.04, 0.03, 0.04]} material={m.ledGreen}>
            <boxGeometry />
          </mesh>
          {[m.wireYellow, m.wireBlue, m.wireRed].map((wire, i) => (
            <Box key={i} s={[0.022, 0.2, 0.022]} p={[0.06 + i * 0.03, 0.1, -0.2 + i * 0.015]} r={[0.5, 0, 0.1]} m={wire} shadow={false} />
          ))}
        </group>
      )}
    </Part>
  );
}
