'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, type Group, type PerspectiveCamera } from 'three';
import type { Build } from '@rivetrun/contracts';
import { UI } from '../palette';
import { damp } from '../rng';
import { Bake } from '../robot/bake';
import { restDrive, type RobotDrive } from '../robot/drive';
import { addOutline } from '../robot/outline';
import { ownPick, pickKey, pickOf, type RoverPick } from '../robot/pick';
import { Reflections } from '../run/Reflections';
import { withBakeKey } from '../robot/materials';
import { Box, Cyl } from '../robot/primitives';
import { RobotModel } from '../robot/RobotModel';

const TICKS = Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2);
const FLOOR_SIZE = 16;
/** The studio: a dark neutral backdrop, so black tyres and grey prints both stand out against it. */
const BACKDROP = '#15171b';

/** The studio floor: a soft pool of light under the turntable that falls off into the backdrop. */
function floorTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    const pool = ctx.createRadialGradient(c, c, 0, c, c, c);
    pool.addColorStop(0, 'rgba(92, 98, 108, 1)');
    pool.addColorStop(0.28, 'rgba(62, 67, 75, 1)');
    pool.addColorStop(0.62, 'rgba(33, 36, 41, 1)');
    pool.addColorStop(1, 'rgba(21, 23, 27, 1)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// Bake keys: the turntable merges into one matte and one metal mesh (see robot/bake.tsx).
const TABLE = {
  base: withBakeKey(new MeshStandardMaterial({ color: '#1d2025' }), 'metal'),
  rim: withBakeKey(new MeshStandardMaterial({ color: '#30343c' }), 'matte'),
  // Lighter than the tyres that stand on it.
  top: withBakeKey(new MeshStandardMaterial({ color: '#5a606a' }), 'matte'),
  tick: withBakeKey(new MeshStandardMaterial({ color: '#a2a9b3' }), 'matte'),
  mark: withBakeKey(new MeshStandardMaterial({ color: UI.safety }), 'matte'),
};

/** Keeps the whole robot in frame for any canvas shape. */
function FitCamera() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const halfV = (camera.fov * Math.PI) / 360;
    const halfWidth = 1.45;
    const halfHeight = 1.12;
    const distance = Math.max(halfWidth / (Math.tan(halfV) * aspect), halfHeight / Math.tan(halfV)) + 1;
    const elevation = 0.4;
    camera.position.set(0, 0.8 + Math.sin(elevation) * distance, Math.cos(elevation) * distance);
    camera.lookAt(0, 0.8, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export interface WorkshopSceneProps {
  build: Build;
  /** Turntable speed, rad/s. Drag horizontally to spin it by hand. */
  spin?: number;
  /** Running late: skip the reflection environment and draw with plain lights. */
  plain?: boolean;
  /** The part to outline (a tap sets it through `onPick`). */
  picked?: RoverPick | null;
  /** A tap on a rover part: the catalog part or printed part under the finger. */
  onPick?: (pick: RoverPick) => void;
}

/**
 * The rover on a turntable in a plain studio: dark neutral backdrop, a soft pool of light on the floor,
 * three-point lighting and a faint shadow. Swap the build and the changed part pops in. Mount inside a <Canvas>.
 */
export function WorkshopScene({ build, spin = 0.45, plain = false, picked = null, onPick }: WorkshopSceneProps) {
  const gl = useThree((state) => state.gl);
  const table = useRef<Group>(null);
  const rover = useRef<Group>(null);
  const pickedKey = picked ? pickKey(picked) : null;

  // Outline every node that stands for the picked part (all four wheels, every instance of a printed bracket).
  // Runs after the parts have mounted and merged, and again when the build swaps parts in or out.
  useEffect(() => {
    const root = rover.current;
    if (!root || !pickedKey) return undefined;
    const removers: Array<() => void> = [];
    root.traverse((node) => {
      const own = ownPick(node);
      if (own && pickKey(own) === pickedKey) removers.push(addOutline(node));
    });
    return () => removers.forEach((remove) => remove());
  }, [pickedKey, build]);
  const drive = useRef<RobotDrive>(restDrive());
  const motion = useRef({ velocity: spin, dragging: false, lastX: 0, happyUntil: 0 });
  const sheet = useMemo(() => new MeshBasicMaterial({ map: floorTexture(), fog: false }), []);

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
      <color attach="background" args={[BACKDROP]} />
      {/* Three-point lighting. Key: high, front right, the one that casts the shadow. */}
      <directionalLight
        position={[3.6, 6.2, 4.4]}
        intensity={3.1}
        color="#fff6ea"
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
      {/* Fill: low, front left, cool and soft, so the side away from the key is never black. */}
      <directionalLight position={[-5, 2.4, 3.6]} intensity={1.5} color="#dfe8ff" />
      {/* Rim: from behind and above, to cut the dark tyres and the deck out of the backdrop. */}
      <directionalLight position={[-1.5, 5, -6]} intensity={2.6} color="#ffffff" />
      <hemisphereLight args={['#e9eef5', '#3a3d44', 0.85]} />
      <Reflections plain={plain}>
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#22252b']} />
        {/* Softboxes: black plastic and rubber only read through what they reflect. */}
        <Lightformer form="rect" intensity={3.2} color="#ffffff" position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#f2f5ff" position={[-6, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[7, 4, 1]} />
        <Lightformer form="rect" intensity={1.8} color="#fff4e6" position={[6, 2, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[7, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[0, 2, -7]} scale={[9, 3, 1]} />
      </Environment>
      </Reflections>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} material={sheet}>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <shadowMaterial transparent opacity={0.3} />
      </mesh>

      <group ref={table} rotation={[0, -0.6, 0]}>
        <group dispose={null}>
          <Bake>
          <Cyl rad={1.62} h={0.06} p={[0, 0.03, 0]} m={TABLE.base} seg={48} />
          <Cyl rad={1.5} h={0.1} p={[0, 0.05, 0]} m={TABLE.rim} seg={48} />
          <Cyl rad={1.38} h={0.11} p={[0, 0.055, 0]} m={TABLE.top} seg={48} />
          {TICKS.map((angle, i) => (
            <Box
              key={angle}
              s={[i % 3 === 0 ? 0.14 : 0.07, 0.012, 0.022]}
              p={[Math.cos(angle) * 1.44, 0.104, Math.sin(angle) * 1.44]}
              r={[0, -angle, 0]}
              m={i % 9 === 0 ? TABLE.mark : TABLE.tick}
              shadow={false}
            />
          ))}
          </Bake>
        </group>
        <group
          ref={rover}
          position={[0, 0.11, 0]}
          onClick={(event) => {
            // A drag that spun the turntable ends in a click too: only a still tap selects.
            if (event.delta > 6) return;
            event.stopPropagation();
            const pick = pickOf(event.object);
            if (pick) onPick?.(pick);
          }}
        >
          <RobotModel build={build} drive={drive} popIn scope="workshop" />
        </group>
      </group>
    </>
  );
}
