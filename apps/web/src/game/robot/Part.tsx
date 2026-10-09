'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import { RobotContext } from './drive';
import type { V3 } from './primitives';

interface PartProps {
  children: ReactNode;
  position?: V3;
  rotation?: V3;
  /** Local Y of the ground in this part's parent frame (where it lands on DNF). */
  floor?: number;
}

interface Flight {
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  delay: number;
}

const GRAVITY = 11;
const POP_S = 0.38;

/** A detachable robot part: pops in when mounted, flies off and bounces on DNF. */
export function Part({ children, position = [0, 0, 0], rotation = [0, 0, 0], floor = -0.4 }: PartProps) {
  const context = useContext(RobotContext);
  const group = useRef<Group>(null);
  const pop = useRef(context?.popIn ? 0 : 1);
  const flight = useRef<Flight>({ active: false, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, delay: 0 });

  useFrame((_, rawDt) => {
    const node = group.current;
    if (!node) return;
    const dt = Math.min(rawDt, 0.05);
    const dnf = context?.drive.current.dnf ?? false;
    const fly = flight.current;

    if (dnf && !fly.active) {
      const out = Math.sign(position[0]) || (Math.random() < 0.5 ? -1 : 1);
      Object.assign(fly, {
        active: true,
        vx: out * (0.6 + Math.random() * 2.2) + 0.8,
        vy: 2.6 + Math.random() * 3.6,
        vz: (Math.random() - 0.25) * 2.4,
        wx: (Math.random() - 0.5) * 14,
        wy: (Math.random() - 0.5) * 10,
        wz: (Math.random() - 0.5) * 14,
        delay: Math.random() * 0.18,
      });
    } else if (!dnf && fly.active) {
      fly.active = false;
      node.position.set(position[0], position[1], position[2]);
      node.rotation.set(rotation[0], rotation[1], rotation[2]);
    }

    if (fly.active) {
      if (fly.delay > 0) {
        fly.delay -= dt;
        return;
      }
      fly.vy -= GRAVITY * dt;
      node.position.x += fly.vx * dt;
      node.position.y += fly.vy * dt;
      node.position.z += fly.vz * dt;
      node.rotation.x += fly.wx * dt;
      node.rotation.y += fly.wy * dt;
      node.rotation.z += fly.wz * dt;
      if (node.position.y < floor && fly.vy < 0) {
        node.position.y = floor;
        fly.vy = Math.abs(fly.vy) > 0.9 ? -fly.vy * 0.45 : 0;
        fly.vx *= 0.62;
        fly.vz *= 0.62;
        fly.wx *= 0.5;
        fly.wy *= 0.5;
        fly.wz *= 0.5;
      }
      return;
    }

    if (pop.current < 1) {
      pop.current = Math.min(1, pop.current + dt / POP_S);
      const k = pop.current - 1;
      // Back-ease-out: overshoots, then settles.
      node.scale.setScalar(Math.max(0.001, 1 + 2.7 * k * k * k + 1.7 * k * k));
    }
  });

  return (
    <group ref={group} position={position as [number, number, number]} rotation={rotation as [number, number, number]} scale={context?.popIn ? 0.001 : 1}>
      {children}
    </group>
  );
}
