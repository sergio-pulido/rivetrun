'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box3, Sphere, Vector3, type Group, type Object3D, type PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

/** A component model from public/models/parts, loaded only when the player asks for the 3D view. */
function GlbModel({ url, onLoaded, onError }: { readonly url: string; readonly onLoaded: () => void; readonly onError: () => void }) {
  const [scene, setScene] = useState<Object3D | null>(null);
  useEffect(() => {
    let cancelled = false;
    new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        if (cancelled) return;
        setScene(gltf.scene);
        onLoaded();
      })
      .catch(() => {
        if (!cancelled) onError();
      });
    return () => {
      cancelled = true;
    };
  }, [url, onLoaded, onError]);
  return scene ? <primitive object={scene} /> : null;
}

const VIEW_DIRECTION = new Vector3(2.4, 1.5, 3.6).normalize();
const FIT_MARGIN = 1.25;

/** Centres the part on the turntable axis and backs the camera off until the whole part fits. */
interface TurntableProps {
  readonly part: Part;
  /** When set, this GLB is shown instead of the procedural part. */
  readonly modelUrl?: string;
  readonly onModelError?: () => void;
}

function Turntable({ part, modelUrl, onModelError }: TurntableProps) {
  // The fit below has to run again once an asynchronous model has arrived.
  const [loaded, setLoaded] = useState(0);
  const markLoaded = useCallback(() => setLoaded((count) => count + 1), []);
  const reportError = useCallback(() => onModelError?.(), [onModelError]);
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
  }, [camera, aspect, part.id, modelUrl, loaded]);

  useFrame((_, dt) => {
    if (turn.current) turn.current.rotation.y += Math.min(dt, 0.05) * 0.6;
  });

  return (
    <group ref={turn} dispose={null}>
      <group ref={model}>{modelUrl ? <GlbModel url={modelUrl} onLoaded={markLoaded} onError={reportError} /> : <Model part={part} />}</group>
    </group>
  );
}

interface PartCanvasProps {
  readonly part: Part;
  /** Called once the first frame can draw, so the page can drop its placeholder. */
  readonly onReady?: () => void;
  /** A GLB to show instead of the procedural part (the sheet's "3D" toggle). */
  readonly modelUrl?: string;
  /** The GLB could not be loaded: the caller goes back to the art it had. */
  readonly onModelError?: () => void;
}

export default function PartCanvas({ part, onReady, modelUrl, onModelError }: PartCanvasProps) {
  return (
    <Canvas dpr={[1, MAX_DPR]} camera={{ fov: 30, near: 0.05, far: 60, position: [2.4, 1.7, 3.6] }} gl={{ antialias: true, alpha: true }} onCreated={() => onReady?.()} style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
      <BenchLight />
      <PartsProvider>
        <Turntable key={`${part.id}:${modelUrl ?? ''}`} part={part} modelUrl={modelUrl} onModelError={onModelError} />
      </PartsProvider>
    </Canvas>
  );
}
