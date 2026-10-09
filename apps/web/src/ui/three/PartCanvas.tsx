'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { Box3, Sphere, Vector3, type Group, type PerspectiveCamera } from 'three';
import type { Part } from '@rivetrun/contracts';
// The game session's own part models, mounted alone.
import { Attachments } from '@/game/robot/Attachments';
import { Battery, Motors } from '@/game/robot/Body';
import { locomotionGeometry } from '@/game/robot/drive';
import { Locomotion } from '@/game/robot/Locomotion';
import { BenchLight } from './BenchLight';
import { PartsProvider } from './PartsProvider';

const MAX_DPR = 1.5;
const NO_PARTS: readonly string[] = [];

function Model({ part }: { readonly part: Part }) {
  const geo = locomotionGeometry(part.slot === 'locomotion' ? part.id : 'offroad_wheels');
  const floor = -geo.deckY;
  if (part.slot === 'locomotion') return <Locomotion id={part.id} />;
  if (part.slot === 'motor') return <Motors id={part.id} geo={geo} floor={floor} />;
  if (part.slot === 'battery') return <Battery id={part.id} floor={floor} />;
  return <Attachments sensors={part.slot === 'sensor' ? [part.id] : [...NO_PARTS]} extras={part.slot === 'extra' ? [part.id] : [...NO_PARTS]} floor={floor} />;
}

const VIEW_DIRECTION = new Vector3(2.4, 1.5, 3.6).normalize();
const FIT_MARGIN = 1.25;

/** Centres the part on the turntable axis and backs the camera off until the whole part fits. */
function Turntable({ part }: { readonly part: Part }) {
  const turn = useRef<Group>(null);
  const model = useRef<Group>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));

  useLayoutEffect(() => {
    const node = model.current;
    if (!node) return;
    node.position.set(0, 0, 0);
    node.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(node);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    node.position.copy(node.worldToLocal(sphere.center.clone()).multiplyScalar(-1));
    const halfFov = (camera.fov * Math.PI) / 360;
    const tightest = Math.min(halfFov, Math.atan(Math.tan(halfFov) * aspect));
    camera.position.copy(VIEW_DIRECTION).multiplyScalar((sphere.radius * FIT_MARGIN) / Math.sin(tightest));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, aspect, part.id]);

  useFrame((_, dt) => {
    if (turn.current) turn.current.rotation.y += Math.min(dt, 0.05) * 0.6;
  });

  return (
    <group ref={turn} dispose={null}>
      <group ref={model}>
        <Model part={part} />
      </group>
    </group>
  );
}

interface PartCanvasProps {
  readonly part: Part;
  /** Called once the first frame can draw, so the page can drop its placeholder. */
  readonly onReady?: () => void;
}

export default function PartCanvas({ part, onReady }: PartCanvasProps) {
  return (
    <Canvas dpr={[1, MAX_DPR]} camera={{ fov: 30, near: 0.05, far: 60, position: [2.4, 1.7, 3.6] }} gl={{ antialias: true, alpha: true }} onCreated={() => onReady?.()} style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
      <BenchLight />
      <PartsProvider>
        <Turntable key={part.id} part={part} />
      </PartsProvider>
    </Canvas>
  );
}
