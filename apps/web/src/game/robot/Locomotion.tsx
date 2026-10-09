'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useMemo, useRef } from 'react';
import { ExtrudeGeometry, Object3D, Path, Shape, type Group, type InstancedMesh } from 'three';
import { BAKE_TAG, Bake } from './bake';
import { RobotContext, locomotionGeometry } from './drive';
import { useMats } from './materials';
import { Part } from './Part';
import { Box, Cyl } from './primitives';

const SIDES = [1, -1] as const;
const AXLES = [1, -1] as const;
const KNOBS = Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2);
const KNOBS_LITE = KNOBS.filter((_, i) => i % 2 === 0);
const SPOKES = Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2);
const SLOTS = Array.from({ length: 3 }, (_, i) => (i / 3) * Math.PI * 2);

/** Spins every child wheel group about Z from the robot drive. */
function useWheelSpin() {
  const context = useContext(RobotContext);
  const wheels = useRef<Array<Group | null>>([]);
  useFrame((_, dt) => {
    const spin = context?.drive.current.wheelSpin ?? 0;
    if (spin === 0) return;
    for (const wheel of wheels.current) if (wheel) wheel.rotation.z -= spin * Math.min(dt, 0.05);
  });
  return wheels;
}

/** Classic yellow-hub hobby wheels: thin, smooth, fast. */
function StreetWheels() {
  const m = useMats();
  const { radius, halfTrack, halfBase } = locomotionGeometry('wheels');
  const wheels = useWheelSpin();
  let slot = 0;
  return (
    <>
      {AXLES.flatMap((ax) =>
        SIDES.map((side) => {
          const index = slot;
          slot += 1;
          return (
            <Part key={`${ax}${side}`} position={[ax * halfBase, radius, side * halfTrack]} floor={radius * 0.5}>
              <Bake
                ref={(node) => {
                  wheels.current[index] = node;
                }}
              >
                <Cyl rad={radius} h={0.12} axis="z" m={m.rubber} seg={22} />
                <Cyl rad={radius * 0.74} h={0.135} axis="z" m={m.hubYellow} seg={18} />
                <Cyl rad={0.06} h={0.17} axis="z" m={m.steel} seg={8} />
                {SLOTS.map((angle) => (
                  <Box
                    key={angle}
                    s={[0.1, 0.045, 0.145]}
                    p={[Math.cos(angle) * radius * 0.45, Math.sin(angle) * radius * 0.45, 0]}
                    r={[0, 0, angle]}
                    m={m.chip}
                    shadow={false}
                  />
                ))}
              </Bake>
            </Part>
          );
        }),
      )}
    </>
  );
}

/** Fat knobbly tyres on printed orange rims. */
function OffroadWheels() {
  const m = useMats();
  const lite = useContext(RobotContext)?.lite ?? false;
  const { radius, halfTrack, halfBase } = locomotionGeometry('offroad_wheels');
  const wheels = useWheelSpin();
  let slot = 0;
  return (
    <>
      {AXLES.flatMap((ax) =>
        SIDES.map((side) => {
          const index = slot;
          slot += 1;
          return (
            <Part key={`${ax}${side}`} position={[ax * halfBase, radius, side * halfTrack]} floor={radius * 0.5}>
              <Bake
                ref={(node) => {
                  wheels.current[index] = node;
                }}
              >
                <Cyl rad={radius * 0.93} h={0.26} axis="z" m={m.rubber} seg={18} />
                {(lite ? KNOBS_LITE : KNOBS).map((angle, i) => (
                  <Box
                    key={angle}
                    s={[0.1, 0.075, lite ? 0.27 : 0.12]}
                    p={[Math.cos(angle) * radius * 0.95, Math.sin(angle) * radius * 0.95, lite ? 0 : i % 2 === 0 ? 0.075 : -0.075]}
                    r={[0, 0, angle + Math.PI / 2]}
                    m={m.rubberLight}
                    shadow={false}
                  />
                ))}
                <Cyl rad={radius * 0.52} h={0.275} axis="z" m={m.print} seg={14} />
                <Cyl rad={radius * 0.4} h={0.285} axis="z" m={m.chip} seg={14} />
                {SPOKES.map((angle) => (
                  <Box
                    key={angle}
                    s={[radius * 0.5, 0.05, 0.295]}
                    p={[Math.cos(angle) * radius * 0.25, Math.sin(angle) * radius * 0.25, 0]}
                    r={[0, 0, angle]}
                    m={m.print}
                    shadow={false}
                  />
                ))}
                <Cyl rad={0.055} h={0.31} axis="z" m={m.steel} seg={8} />
              </Bake>
            </Part>
          );
        }),
      )}
    </>
  );
}

const CLEATS = 26;
const BELT_WIDTH = 0.26;

function beltGeometry(radius: number, half: number): ExtrudeGeometry {
  const stadium = (r: number, target: Shape | Path) => {
    target.moveTo(-half, -r);
    target.lineTo(half, -r);
    target.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
    target.lineTo(-half, r);
    target.absarc(-half, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  };
  const shape = new Shape();
  stadium(radius, shape);
  const hole = new Path();
  stadium(radius - 0.045, hole);
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, { depth: BELT_WIDTH, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -BELT_WIDTH / 2);
  return geometry;
}

/** Point on the belt loop at distance u; the top run travels forward. */
function beltPoint(u: number, radius: number, half: number, out: { x: number; y: number; a: number }): void {
  const straight = half * 2;
  const arc = Math.PI * radius;
  const total = straight * 2 + arc * 2;
  let d = ((u % total) + total) % total;
  if (d < straight) {
    out.x = -half + d;
    out.y = radius;
    out.a = 0;
    return;
  }
  d -= straight;
  if (d < arc) {
    const angle = Math.PI / 2 - d / radius;
    out.x = half + Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius;
    out.a = angle - Math.PI / 2;
    return;
  }
  d -= arc;
  if (d < straight) {
    out.x = half - d;
    out.y = -radius;
    out.a = Math.PI;
    return;
  }
  d -= straight;
  const angle = -Math.PI / 2 - d / radius;
  out.x = -half + Math.cos(angle) * radius;
  out.y = Math.sin(angle) * radius;
  out.a = angle - Math.PI / 2;
}

/** Rubber belts with moving cleats over yellow sprockets and road wheels. */
function Tracks() {
  const m = useMats();
  const context = useContext(RobotContext);
  const { radius, halfTrack, halfBase } = locomotionGeometry('tracks');
  const belt = useMemo(() => beltGeometry(radius, halfBase), [radius, halfBase]);
  const cleats = useRef<Array<InstancedMesh | null>>([]);
  const sprockets = useRef<Array<Group | null>>([]);
  const travel = useRef(0);
  const scratch = useMemo(() => ({ dummy: new Object3D(), point: { x: 0, y: 0, a: 0 } }), []);
  const total = halfBase * 4 + Math.PI * radius * 2;

  useFrame((_, dt) => {
    const spin = context?.drive.current.wheelSpin ?? 0;
    const step = Math.min(dt, 0.05);
    travel.current += spin * radius * step;
    for (const sprocket of sprockets.current) if (sprocket) sprocket.rotation.z -= spin * step;
    const { dummy, point } = scratch;
    for (const mesh of cleats.current) {
      if (!mesh) continue;
      for (let i = 0; i < CLEATS; i += 1) {
        beltPoint(travel.current + (i / CLEATS) * total, radius + 0.012, halfBase, point);
        dummy.position.set(point.x, point.y, 0);
        dummy.rotation.set(0, 0, point.a);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {SIDES.map((side, sideIndex) => (
        <Part key={side} position={[0, radius, side * halfTrack]} floor={radius}>
          <mesh geometry={belt} material={m.rubber} castShadow={!context?.lite} userData={BAKE_TAG} />
          <instancedMesh
            ref={(node) => {
              cleats.current[sideIndex] = node;
            }}
            args={[undefined, undefined, CLEATS]}
            material={m.rubberLight}
            frustumCulled={false}
          >
            <boxGeometry args={[0.05, 0.05, BELT_WIDTH + 0.03]} />
          </instancedMesh>
          {AXLES.map((ax, axleIndex) => (
            <Bake
              key={ax}
              position={[ax * halfBase, 0, 0]}
              ref={(node) => {
                sprockets.current[sideIndex * 2 + axleIndex] = node;
              }}
            >
              <Cyl rad={radius - 0.06} h={BELT_WIDTH - 0.04} axis="z" m={m.hubYellow} seg={12} />
              <Cyl rad={0.05} h={BELT_WIDTH + 0.06} axis="z" m={m.steel} seg={8} />
              {SLOTS.map((angle) => (
                <Box key={angle} s={[0.1, 0.04, BELT_WIDTH - 0.02]} p={[Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0]} r={[0, 0, angle]} m={m.chip} shadow={false} />
              ))}
            </Bake>
          ))}
          {[-0.3, 0, 0.3].map((x) => (
            <Cyl key={x} rad={0.085} h={BELT_WIDTH - 0.06} axis="z" p={[x, -radius + 0.13, 0]} m={m.darkSteel} seg={10} />
          ))}
          <Box s={[halfBase * 2 + 0.1, 0.09, 0.03]} p={[0, 0.02, side * (BELT_WIDTH / 2 + 0.01)]} m={m.print} />
          <Box s={[0.5, 0.16, 0.03]} p={[0, -0.06, side * (BELT_WIDTH / 2 + 0.01)]} m={m.printDark} />
        </Part>
      ))}
    </>
  );
}

interface LocomotionProps {
  id: string;
}

export function Locomotion({ id }: LocomotionProps) {
  if (id === 'tracks') return <Tracks />;
  if (id === 'offroad_wheels') return <OffroadWheels />;
  return <StreetWheels />;
}
