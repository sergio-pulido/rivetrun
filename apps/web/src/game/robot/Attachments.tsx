'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { RobotContext } from './drive';
import { useMats } from './materials';
import { Part } from './Part';
import { Box, Cyl, HALF_RING } from './primitives';

interface AttachmentProps {
  floor: number;
}

/** HC-SR04 look: blue board, two steel "eyes" pointing forward. */
function Ultrasonic({ floor }: AttachmentProps) {
  const m = useMats();
  return (
    <Part position={[0.84, 0.17, 0]} floor={floor + 0.1}>
      <Box s={[0.06, 0.07, 0.2]} p={[-0.06, -0.1, 0]} m={m.print} />
      <Box s={[0.03, 0.22, 0.46]} m={m.pcbBlue} />
      {[0.12, -0.12].map((z) => (
        <group key={z} position={[0.06, 0, z]}>
          <Cyl rad={0.085} h={0.1} axis="x" m={m.steel} seg={14} />
          <Cyl rad={0.06} h={0.105} axis="x" m={m.chip} seg={12} shadow={false} />
        </group>
      ))}
      <Box s={[0.03, 0.05, 0.1]} p={[0.025, 0.07, 0]} m={m.steel} shadow={false} />
    </Part>
  );
}

/** Pi-camera on a printed mast. Pans slowly, like it is looking around. */
function Camera({ floor }: AttachmentProps) {
  const m = useMats();
  const pan = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (pan.current) pan.current.rotation.y = Math.sin(clock.elapsedTime * 1.3) * 0.35;
  });
  return (
    <Part position={[0.56, 0.2, -0.16]} floor={floor + 0.1}>
      <Box s={[0.07, 0.4, 0.07]} p={[0, 0.2, 0]} m={m.print} />
      <Box s={[0.14, 0.05, 0.12]} p={[0, 0.02, 0]} m={m.printDark} />
      <group ref={pan} position={[0, 0.46, 0]}>
        <Box s={[0.14, 0.12, 0.16]} p={[0, -0.02, 0]} m={m.servo} />
        <Box s={[0.03, 0.24, 0.24]} p={[0.09, 0.08, 0]} m={m.pcb} />
        <Box s={[0.05, 0.11, 0.11]} p={[0.12, 0.1, 0]} m={m.chip} />
        <Cyl rad={0.05} h={0.08} axis="x" p={[0.17, 0.1, 0]} m={m.chip} seg={12} />
        <Cyl rad={0.03} h={0.085} axis="x" p={[0.172, 0.1, 0]} m={m.ledBlue} seg={10} shadow={false} />
        <Box s={[0.02, 0.2, 0.1]} p={[0.07, -0.04, 0]} m={m.label} shadow={false} />
      </group>
    </Part>
  );
}

/** Purple breakout board standing on the PCB, with a blinking LED. */
function Imu({ floor }: AttachmentProps) {
  const m = useMats();
  const led = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (led.current) led.current.visible = clock.elapsedTime % 0.9 < 0.45;
  });
  return (
    <Part position={[0.34, 0.2, 0.2]} floor={floor + 0.1}>
      <Box s={[0.2, 0.05, 0.04]} p={[0, 0.02, 0]} m={m.chip} />
      <Box s={[0.24, 0.22, 0.025]} p={[0, 0.15, 0]} m={m.pcbPurple} />
      <Box s={[0.09, 0.09, 0.03]} p={[0, 0.15, 0.015]} m={m.chip} shadow={false} />
      <Box s={[0.2, 0.02, 0.03]} p={[0, 0.07, 0.015]} m={m.gold} shadow={false} />
      <mesh ref={led} position={[0.08, 0.23, 0.02]} scale={[0.035, 0.035, 0.02]} material={m.ledBlue}>
        <boxGeometry />
      </mesh>
    </Part>
  );
}

/** Two gold prongs on a printed arm, dipping towards the ground ahead. */
function MoistureProbe({ floor }: AttachmentProps) {
  const m = useMats();
  return (
    <Part position={[0.78, -0.04, 0.24]} rotation={[0, 0, -0.5]} floor={floor + 0.1}>
      <Box s={[0.3, 0.05, 0.08]} p={[0.1, 0, 0]} m={m.print} />
      <Box s={[0.12, 0.1, 0.14]} p={[0.28, 0, 0]} m={m.pcbDark} />
      {[0.04, -0.04].map((z) => (
        <Box key={z} s={[0.3, 0.025, 0.03]} p={[0.48, 0, z]} m={m.gold} />
      ))}
    </Part>
  );
}

/** Cable drum with orange flanges. The cable goes taut while the winch is deployed. */
function Winch({ floor }: AttachmentProps) {
  const m = useMats();
  const context = useContext(RobotContext);
  const drum = useRef<Group>(null);
  const cable = useRef<Group>(null);
  const hook = useRef<Group>(null);
  useFrame((_, dt) => {
    const deployed = context?.drive.current.winch ?? false;
    if (drum.current && deployed) drum.current.rotation.z -= dt * 9;
    if (cable.current) cable.current.visible = deployed;
    if (hook.current) hook.current.visible = !deployed;
  });
  return (
    <Part position={[0.66, 0.04, 0.16]} floor={floor + 0.1}>
      <Box s={[0.22, 0.05, 0.36]} p={[0, 0.025, 0]} m={m.printDark} />
      <group ref={drum} position={[0, 0.17, 0]}>
        <Cyl rad={0.085} h={0.24} axis="z" m={m.cable} seg={12} />
        <Cyl rad={0.14} h={0.03} axis="z" p={[0, 0, 0.13]} m={m.print} seg={8} />
        <Cyl rad={0.14} h={0.03} axis="z" p={[0, 0, -0.13]} m={m.print} seg={8} />
      </group>
      <Box s={[0.16, 0.14, 0.12]} p={[-0.14, 0.12, -0.1]} m={m.servo} />
      <group ref={hook} position={[0.2, 0.08, 0]}>
        <Box s={[0.14, 0.02, 0.02]} p={[-0.06, 0.04, 0]} r={[0, 0, -0.6]} m={m.cable} shadow={false} />
        <mesh geometry={HALF_RING} material={m.finRed} scale={0.05} position={[0.02, -0.03, 0]} castShadow />
      </group>
      <group ref={cable} position={[0.06, 0.2, 0]} rotation={[0, 0, 0.16]} visible={false}>
        <Box s={[3.2, 0.018, 0.018]} p={[1.6, 0, 0]} m={m.cable} shadow={false} />
        <mesh geometry={HALF_RING} material={m.finRed} scale={0.06} position={[3.24, 0, 0]} />
      </group>
    </Part>
  );
}

/** Clear box over the electronics, with a gasket line, frame and yellow latches. */
function WaterproofCase({ floor }: AttachmentProps) {
  const m = useMats();
  const w = 0.88;
  const d = 0.66;
  const h = 0.3;
  return (
    <Part position={[0.12, 0.2, 0]} floor={floor + 0.2}>
      <Box s={[w, h, d]} p={[0, h / 2, 0]} m={m.clear} shadow={false} />
      <Box s={[w + 0.03, 0.035, d + 0.03]} p={[0, h * 0.62, 0]} m={m.print} shadow={false} />
      {[1, -1].flatMap((ax) =>
        [1, -1].map((side) => (
          <Box key={`${ax}${side}`} s={[0.035, h + 0.02, 0.035]} p={[(ax * w) / 2, h / 2, (side * d) / 2]} m={m.darkSteel} shadow={false} />
        )),
      )}
      {[1, -1].map((side) => (
        <Box key={`lid-x${side}`} s={[w + 0.035, 0.035, 0.035]} p={[0, h, (side * d) / 2]} m={m.darkSteel} shadow={false} />
      ))}
      {[1, -1].map((ax) => (
        <Box key={`lid-z${ax}`} s={[0.035, 0.035, d + 0.035]} p={[(ax * w) / 2, h, 0]} m={m.darkSteel} shadow={false} />
      ))}
      {[-0.22, 0.22].flatMap((x) =>
        [1, -1].map((side) => (
          <Box key={`${x}${side}`} s={[0.1, 0.12, 0.03]} p={[x, h * 0.62, side * (d / 2 + 0.02)]} m={m.hazard} shadow={false} />
        )),
      )}
    </Part>
  );
}

const STRIPES = [-0.36, -0.18, 0, 0.18, 0.36];

/** Hazard-striped crash bar on printed arms. */
function Bumper({ floor }: AttachmentProps) {
  const m = useMats();
  return (
    <Part position={[0.98, -0.03, 0]} floor={floor + 0.08}>
      <Box s={[0.11, 0.17, 1.08]} m={m.hazard} />
      {STRIPES.map((z) => (
        <Box key={z} s={[0.115, 0.2, 0.07]} p={[0, 0, z]} r={[0.6, 0, 0]} m={m.chip} shadow={false} />
      ))}
      <Box s={[0.05, 0.19, 1.1]} p={[0.07, 0, 0]} m={m.rubber} />
      {[0.26, -0.26].map((z) => (
        <Box key={z} s={[0.2, 0.06, 0.07]} p={[-0.13, 0, z]} m={m.print} />
      ))}
    </Part>
  );
}

const SENSOR_PARTS: Readonly<Record<string, (props: AttachmentProps) => React.ReactNode>> = {
  ultrasonic: Ultrasonic,
  camera: Camera,
  imu: Imu,
  moisture_probe: MoistureProbe,
};

const EXTRA_PARTS: Readonly<Record<string, (props: AttachmentProps) => React.ReactNode>> = {
  winch: Winch,
  waterproof_case: WaterproofCase,
  bumper: Bumper,
};

interface AttachmentsProps {
  sensors: readonly string[];
  extras: readonly string[];
  floor: number;
}

export function Attachments({ sensors, extras, floor }: AttachmentsProps) {
  return (
    <>
      {[...new Set(sensors)].map((id) => {
        const Sensor = SENSOR_PARTS[id];
        return Sensor ? <Sensor key={id} floor={floor} /> : null;
      })}
      {[...new Set(extras)].map((id) => {
        const Extra = EXTRA_PARTS[id];
        return Extra ? <Extra key={id} floor={floor} /> : null;
      })}
    </>
  );
}
