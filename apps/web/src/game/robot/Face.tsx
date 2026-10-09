'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useMemo, useRef } from 'react';
import { MeshBasicMaterial, type Group, type Mesh } from 'three';
import { UI } from '../palette';
import { damp } from '../rng';
import { Bake } from './bake';
import { RobotContext, type Expression } from './drive';
import { useMats } from './materials';
import { Part } from './Part';
import { Box, Cyl, SPHERE } from './primitives';

type Shape = 'rect' | 'cross' | 'chevron' | 'wince';

interface Look {
  readonly shape: Shape;
  readonly w: number;
  readonly h: number;
  /** Inward tilt of rect eyes (determined / angry). */
  readonly tilt: number;
  readonly dx: number;
  readonly color: string;
  readonly mouthW: number;
  readonly mouthH: number;
  readonly yaw: number;
}

const BASE_YAW = 0.5;
const look = (partial: Partial<Look>): Look => ({
  shape: 'rect', w: 0.085, h: 0.095, tilt: 0, dx: 0, color: UI.led, mouthW: 0.09, mouthH: 0.016, yaw: BASE_YAW, ...partial,
});

/** LED-eye face per state: squint on brake, wide on accelerate, X eyes on DNF. */
const LOOKS: Readonly<Record<Expression, Look>> = {
  idle: look({}),
  cruise: look({}),
  accelerate: look({ w: 0.095, h: 0.15, mouthW: 0.06, mouthH: 0.045, color: '#8dfcff', yaw: 0.72 }),
  slow_down: look({ h: 0.052, mouthW: 0.07 }),
  brake: look({ w: 0.12, h: 0.022, mouthW: 0.14, color: '#ffd166' }),
  reverse: look({ dx: -0.035, h: 0.08, mouthW: 0.05, yaw: -0.15 }),
  climb_mode: look({ h: 0.06, tilt: 0.38, color: '#ffa23d', mouthW: 0.12 }),
  deploy_winch: look({ h: 0.07, tilt: 0.3, color: '#ffd166', mouthW: 0.05, mouthH: 0.04 }),
  jump: look({ w: 0.1, h: 0.16, mouthW: 0.05, mouthH: 0.06, color: '#8dfcff', yaw: 0.6 }),
  thinking: look({ w: 0.05, h: 0.05, color: '#ffffff', mouthW: 0.035, yaw: 0.1 }),
  slip: look({ w: 0.09, h: 0.09, color: '#ffe066', mouthW: 0.06, mouthH: 0.05 }),
  hurt: look({ shape: 'wince', color: '#ff7a5c', mouthW: 0.07, mouthH: 0.04 }),
  dnf: look({ shape: 'cross', color: '#ff4d3d', mouthW: 0.12, yaw: 0.2 }),
  finish: look({ shape: 'chevron', color: '#5dff8a', mouthW: 0.13, mouthH: 0.04, yaw: 0.2 }),
};

const EYE_X = 0.115;
const SCREEN_Z = 0.142;

interface FaceProps {
  floor: number;
}

export function Face({ floor }: FaceProps) {
  const m = useMats();
  const context = useContext(RobotContext);
  const lite = context?.lite ?? false;
  const led = useMemo(() => new MeshBasicMaterial({ color: UI.led, toneMapped: false, transparent: lite, opacity: lite ? 0.55 : 1 }), [lite]);
  const head = useRef<Group>(null);
  const bars = useRef<Array<Mesh | null>>([]);
  const mouth = useRef<Mesh>(null);
  const tip = useRef<Mesh>(null);
  const smooth = useRef({ w: 0.085, h: 0.095, tilt: 0, dx: 0, mouthW: 0.09, mouthH: 0.016, yaw: BASE_YAW, nextBlink: 2, blink: 0 });

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    const expression = context?.drive.current.expression ?? 'idle';
    const target = LOOKS[expression];
    const s = smooth.current;
    s.w = damp(s.w, target.w, 16, dt);
    s.h = damp(s.h, target.h, 16, dt);
    s.tilt = damp(s.tilt, target.tilt, 14, dt);
    s.dx = damp(s.dx, target.dx, 12, dt);
    s.mouthW = damp(s.mouthW, target.mouthW, 14, dt);
    s.mouthH = damp(s.mouthH, target.mouthH, 14, dt);
    s.yaw = damp(s.yaw, target.yaw, 6, dt);
    led.color.set(target.color);

    if (t > s.nextBlink) {
      s.blink = 0.13;
      s.nextBlink = t + 1.8 + Math.random() * 3.2;
    }
    s.blink = Math.max(0, s.blink - dt);

    if (head.current) {
      const shake = expression === 'slip' ? Math.sin(t * 24) * 0.22 : 0;
      head.current.rotation.y = s.yaw + shake;
      head.current.rotation.z = damp(head.current.rotation.z, expression === 'dnf' ? -0.42 : expression === 'thinking' ? Math.sin(t * 3) * 0.08 : 0, 8, dt);
      head.current.rotation.x = damp(head.current.rotation.x, expression === 'accelerate' ? 0.08 : expression === 'dnf' ? 0.3 : 0, 8, dt);
    }

    for (let eye = 0; eye < 2; eye += 1) {
      const side = eye === 0 ? -1 : 1;
      const a = bars.current[eye * 2];
      const b = bars.current[eye * 2 + 1];
      if (!a || !b) continue;
      const cx = side * EYE_X + s.dx;
      if (target.shape === 'rect') {
        let h = s.h * (s.blink > 0 ? 0.12 : 1);
        let w = s.w;
        let y = 0.025;
        if (expression === 'thinking') y += Math.sin(t * 9 + eye * 1.6) * 0.03;
        if (expression === 'slip') {
          const wobble = 0.6 + 0.4 * Math.sin(t * 14 + eye * Math.PI);
          w *= wobble;
          h *= wobble;
        }
        a.visible = true;
        b.visible = false;
        a.position.set(cx, y, SCREEN_Z);
        a.rotation.z = -side * s.tilt;
        a.scale.set(w, h, 0.01);
      } else {
        const bar = 0.03;
        const cross = target.shape === 'cross';
        const chevron = target.shape === 'chevron';
        a.visible = true;
        b.visible = true;
        a.scale.set(cross ? 0.14 : 0.09, bar, 0.01);
        b.scale.set(cross ? 0.14 : 0.09, bar, 0.01);
        if (cross) {
          a.position.set(cx, 0.025, SCREEN_Z);
          b.position.set(cx, 0.025, SCREEN_Z);
          a.rotation.z = Math.PI / 4;
          b.rotation.z = -Math.PI / 4;
        } else if (chevron) {
          a.position.set(cx - 0.03, 0.03, SCREEN_Z);
          b.position.set(cx + 0.03, 0.03, SCREEN_Z);
          a.rotation.z = 0.75;
          b.rotation.z = -0.75;
        } else {
          a.position.set(cx, 0.05, SCREEN_Z);
          b.position.set(cx, 0.0, SCREEN_Z);
          a.rotation.z = side * 0.5;
          b.rotation.z = -side * 0.5;
        }
      }
    }

    if (mouth.current) {
      const drift = expression === 'thinking' ? Math.sin(t * 5) * 0.05 : 0;
      mouth.current.position.set(drift + s.dx, -0.075, SCREEN_Z);
      mouth.current.scale.set(s.mouthW, s.mouthH, 0.01);
      mouth.current.rotation.z = expression === 'dnf' ? 0.25 : 0;
    }
    if (tip.current) {
      const rate = expression === 'thinking' ? 14 : expression === 'dnf' ? 0 : 3;
      tip.current.visible = rate === 0 ? false : Math.sin(t * rate) > 0;
    }
  });

  return (
    <Part position={[0.04, 0.19, 0]} floor={floor + 0.15}>
      <Box s={[0.16, 0.12, 0.2]} p={[0, 0.06, 0]} m={m.servo} />
      <Cyl rad={0.035} h={0.36} p={[0, 0.3, 0]} m={m.steel} seg={8} />
      <Bake ref={head} position={[0, 0.56, 0]} rotation={[0, BASE_YAW, 0]}>
        <Box s={[0.52, 0.34, 0.26]} m={m.head} />
        <Box s={[0.56, 0.06, 0.3]} p={[0, 0.17, 0]} m={m.print} />
        <Box s={[0.04, 0.2, 0.1]} p={[0.28, 0, 0]} m={m.print} />
        <Box s={[0.04, 0.2, 0.1]} p={[-0.28, 0, 0]} m={m.print} />
        <Box s={[0.46, 0.27, 0.02]} p={[0, -0.01, 0.125]} m={m.screen} shadow={false} />
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            ref={(node) => {
              bars.current[i] = node;
            }}
            material={led}
          >
            <boxGeometry />
          </mesh>
        ))}
        <mesh ref={mouth} material={led}>
          <boxGeometry />
        </mesh>
        <Cyl rad={0.012} h={0.26} p={[-0.18, 0.32, -0.06]} m={m.steel} seg={5} />
        <mesh ref={tip} geometry={SPHERE} material={m.ledOrange} scale={0.035} position={[-0.18, 0.46, -0.06]} />
      </Bake>
    </Part>
  );
}
