'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace, type Group, type PerspectiveCamera } from 'three';
import type { Build } from '@rivetrun/contracts';
import { UI } from '../palette';
import { damp } from '../rng';
import { restDrive, type RobotDrive } from '../robot/drive';
import { robotMaterials } from '../robot/materials';
import { Box, Cyl } from '../robot/primitives';
import { RobotModel } from '../robot/RobotModel';

const TICKS = Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2);
const MAT_SIZE = 16;

/** Blueprint sheet under the turntable: grid, rings, crosshair, title block. Fades out at the edge. */
function blueprintTexture(): CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    const unit = size / MAT_SIZE;
    ctx.fillStyle = '#12314f';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i <= MAT_SIZE * 4; i += 1) {
      const major = i % 4 === 0;
      ctx.strokeStyle = major ? 'rgba(140,195,245,0.42)' : 'rgba(140,195,245,0.14)';
      ctx.lineWidth = major ? 2 : 1;
      const p = (i * unit) / 4;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200,230,255,0.7)';
    ctx.lineWidth = 2.5;
    for (const r of [1.75, 2.6]) {
      ctx.setLineDash(r > 2 ? [14, 10] : []);
      ctx.beginPath();
      ctx.arc(c, c, r * unit, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(c - 3.4 * unit, c);
    ctx.lineTo(c + 3.4 * unit, c);
    ctx.moveTo(c, c - 3.4 * unit);
    ctx.lineTo(c, c + 3.4 * unit);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,230,255,0.85)';
    ctx.font = '700 26px ui-monospace, Menlo, monospace';
    ctx.fillText('RIVETRUN · MK-I', c + 2.75 * unit, c + 3.3 * unit);
    ctx.font = '500 18px ui-monospace, Menlo, monospace';
    ctx.fillText('SCALE 1:4 · ALL DIMS IN MM', c + 2.75 * unit, c + 3.3 * unit + 26);
    ctx.fillText('Ø 350', c + 1.3 * unit, c - 1.35 * unit);
    // Soft vignette to transparent so the sheet melts into the page.
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createRadialGradient(c, c, 2.6 * unit, c, c, c);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Bench clutter: breadboard with jumpers, solder spool, screwdriver, loose screws. */
function BenchProps() {
  const m = robotMaterials();
  return (
    <group dispose={null}>
      <group position={[-2.5, 0, -1.1]} rotation={[0, 0.5, 0]}>
        <mesh position={[0, 0.05, 0]} scale={[1.1, 0.1, 0.7]} castShadow receiveShadow>
          <boxGeometry />
          <meshStandardMaterial color="#eef1f4" roughness={0.7} />
        </mesh>
        <Box s={[1.0, 0.012, 0.04]} p={[0, 0.105, 0.27]} m={m.wireRed} shadow={false} />
        <Box s={[1.0, 0.012, 0.04]} p={[0, 0.105, -0.27]} m={m.wireBlue} shadow={false} />
        <Box s={[0.28, 0.07, 0.2]} p={[-0.1, 0.13, 0]} m={m.chip} />
        <Box s={[0.03, 0.03, 0.4]} p={[0.25, 0.16, 0.05]} r={[0.3, 0, 0]} m={m.wireYellow} shadow={false} />
        <Box s={[0.03, 0.03, 0.34]} p={[0.36, 0.15, -0.05]} r={[-0.3, 0, 0]} m={m.wireRed} shadow={false} />
        <Cyl rad={0.04} h={0.1} p={[0.42, 0.15, 0.18]} m={m.ledRed} seg={8} />
      </group>
      <group position={[2.5, 0, -0.9]}>
        <Cyl rad={0.32} h={0.05} p={[0, 0.025, 0]} m={m.servo} seg={16} />
        <Cyl rad={0.2} h={0.36} p={[0, 0.2, 0]} m={m.steel} seg={16} />
        <Cyl rad={0.32} h={0.05} p={[0, 0.39, 0]} m={m.servo} seg={16} />
      </group>
      <group position={[2.2, 0.06, 1.5]} rotation={[0, -0.7, 0]}>
        <Cyl rad={0.07} h={0.6} axis="x" p={[-0.4, 0, 0]} m={m.print} seg={8} />
        <Cyl rad={0.022} h={0.7} axis="x" p={[0.2, 0, 0]} m={m.steel} seg={6} />
      </group>
      {[[-2.0, 1.4], [-1.75, 1.75], [-2.3, 1.85], [1.5, -2.1]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x!, 0, z!]} rotation={[0, x! * 3, Math.PI / 2]}>
          <Cyl rad={0.05} h={0.03} p={[0.05, 0, 0]} m={m.steel} seg={6} />
          <Cyl rad={0.02} h={0.16} p={[0.05, 0.09, 0]} m={m.steel} seg={5} />
        </group>
      ))}
    </group>
  );
}

/** Keeps the whole robot in frame for any canvas shape. */
function FitCamera() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const halfV = (camera.fov * Math.PI) / 360;
    const halfWidth = 1.75;
    const halfHeight = 1.25;
    const distance = Math.max(halfWidth / (Math.tan(halfV) * aspect), halfHeight / Math.tan(halfV)) + 1.2;
    const elevation = 0.42;
    camera.position.set(0, 0.75 + Math.sin(elevation) * distance, Math.cos(elevation) * distance);
    camera.lookAt(0, 0.72, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export interface WorkshopSceneProps {
  build: Build;
  /** Turntable speed, rad/s. Drag horizontally to spin it by hand. */
  spin?: number;
}

/** Robot on a turntable over a blueprint sheet. Swap the build and parts pop in live. Mount inside a <Canvas>. */
export function WorkshopScene({ build, spin = 0.45 }: WorkshopSceneProps) {
  const gl = useThree((state) => state.gl);
  const table = useRef<Group>(null);
  const drive = useRef<RobotDrive>(restDrive());
  const motion = useRef({ velocity: spin, dragging: false, lastX: 0, happyUntil: 0 });
  const sheet = useMemo(() => new MeshBasicMaterial({ map: blueprintTexture(), transparent: true, depthWrite: false }), []);
  const m = robotMaterials();

  useEffect(() => () => {
    sheet.map?.dispose();
    sheet.dispose();
  }, [sheet]);

  // A happy face and a wheel spin-up every time a part changes.
  useEffect(() => {
    motion.current.happyUntil = performance.now() + 1100;
  }, [build]);

  useEffect(() => {
    const element = gl.domElement;
    const state = motion.current;
    const down = (event: PointerEvent) => {
      state.dragging = true;
      state.lastX = event.clientX;
    };
    const move = (event: PointerEvent) => {
      if (!state.dragging || !table.current) return;
      const dx = event.clientX - state.lastX;
      state.lastX = event.clientX;
      table.current.rotation.y += dx * 0.012;
      state.velocity = dx * 0.5;
    };
    const up = () => {
      state.dragging = false;
    };
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      element.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = motion.current;
    if (!state.dragging && table.current) {
      state.velocity = damp(state.velocity, spin, 2.5, dt);
      table.current.rotation.y += state.velocity * dt;
    }
    const happy = performance.now() < state.happyUntil;
    drive.current.expression = happy ? 'finish' : 'idle';
    drive.current.wheelSpin = damp(drive.current.wheelSpin, happy ? 7 : 0.9, 4, dt);
  });

  return (
    <>
      <FitCamera />
      <hemisphereLight args={['#cfe4ff', '#1a2433', 0.9]} />
      <directionalLight
        position={[3.5, 6.5, 4.5]}
        intensity={2.6}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-camera-left={-3.2}
        shadow-camera-right={3.2}
        shadow-camera-top={3.2}
        shadow-camera-bottom={-3.2}
        shadow-camera-near={1}
        shadow-camera-far={18}
      />
      <directionalLight position={[-5, 3, -5]} intensity={1.5} color={UI.blueprint} />
      <pointLight position={[0, 0.5, 2.6]} intensity={5} color={UI.safety} distance={6} />
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#16202c']} />
        <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={2} color={UI.blueprint} position={[-6, 2, -4]} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} color={UI.safety} position={[6, 1, 3]} scale={[4, 3, 1]} />
      </Environment>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} material={sheet}>
        <planeGeometry args={[MAT_SIZE, MAT_SIZE]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[MAT_SIZE, MAT_SIZE]} />
        <shadowMaterial transparent opacity={0.45} />
      </mesh>
      <BenchProps />

      <group ref={table} rotation={[0, -0.6, 0]}>
        <group dispose={null}>
          <Cyl rad={1.62} h={0.06} p={[0, 0.03, 0]} m={m.darkSteel} seg={48} />
          <Cyl rad={1.5} h={0.1} p={[0, 0.05, 0]} m={m.servo} seg={48} />
          <Cyl rad={1.38} h={0.11} p={[0, 0.055, 0]} m={m.head} seg={48} />
          {TICKS.map((angle, i) => (
            <Box
              key={angle}
              s={[i % 3 === 0 ? 0.14 : 0.07, 0.012, 0.022]}
              p={[Math.cos(angle) * 1.44, 0.104, Math.sin(angle) * 1.44]}
              r={[0, -angle, 0]}
              m={i % 9 === 0 ? m.print : m.steel}
              shadow={false}
            />
          ))}
        </group>
        <group position={[0, 0.11, 0]}>
          <RobotModel build={build} drive={drive} popIn />
        </group>
      </group>
    </>
  );
}
