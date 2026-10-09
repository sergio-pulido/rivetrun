'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group, OrthographicCamera } from 'three';
import type { Build } from '@rivetrun/contracts';
// The game session's robot is built from these part components; the exploded view mounts them one layer at a time.
import { Attachments } from '@/game/robot/Attachments';
import { Battery, Chassis, Controller, Motors } from '@/game/robot/Body';
import { locomotionGeometry } from '@/game/robot/drive';
import { Face } from '@/game/robot/Face';
import { Locomotion } from '@/game/robot/Locomotion';
import { BenchLight } from './BenchLight';
import { PartsProvider } from './PartsProvider';
import { ELEVATION, MODEL_SHIFT_X, VIEW_HEIGHT, explodedLayers, stackCentreY } from './exploded';

const MAX_DPR = 1.5;
const CAMERA_DISTANCE = 12;

/** Orthographic camera so the layers stay evenly spaced on screen and the DOM labels can line up with them. */
function LayerCamera({ centreY }: { readonly centreY: number }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const height = useThree((state) => state.size.height);
  useEffect(() => {
    camera.position.set(0, centreY + Math.sin(ELEVATION) * CAMERA_DISTANCE, Math.cos(ELEVATION) * CAMERA_DISTANCE);
    camera.lookAt(0, centreY, 0);
    camera.zoom = height / VIEW_HEIGHT;
    camera.updateProjectionMatrix();
  }, [camera, height, centreY]);
  return null;
}

function Stack({ build }: { readonly build: Build }) {
  const turn = useRef<Group>(null);
  const geo = locomotionGeometry(build.locomotion);
  const floor = -geo.deckY;
  const lift = Object.fromEntries(explodedLayers(build).map((layer) => [layer.key, layer.lift]));
  const deck = (key: string): [number, number, number] => [0, geo.deckY + (lift[key] ?? 0), 0];

  // A slow sway, so every layer shows its depth without ever turning its back.
  useFrame(({ clock }) => {
    if (turn.current) turn.current.rotation.y = -0.55 + Math.sin(clock.elapsedTime * 0.5) * 0.3;
  });

  return (
    <group position={[MODEL_SHIFT_X, 0, 0]}>
      <group ref={turn} dispose={null}>
        <Locomotion key={build.locomotion} id={build.locomotion} />
        <group position={deck('power')}>
          <Motors key={`${build.motor}-${build.locomotion}`} id={build.motor} geo={geo} floor={floor} />
          <Battery key={build.battery} id={build.battery} floor={floor} />
        </group>
        <group position={deck('chassis')}>
          <Chassis key={build.locomotion} geo={geo} floor={floor} />
        </group>
        <group position={deck('board')}>
          <Controller floor={floor} />
          <Face floor={floor} />
        </group>
        <group position={deck('sensors')}>
          <Attachments sensors={build.sensors} extras={build.extras} floor={floor} />
        </group>
      </group>
    </group>
  );
}

/** Exploded view of a build in five layers. Transparent background; fills its parent. */
interface ExplodedCanvasProps {
  readonly build: Build;
  /** Called once the first frame can draw, so the page can drop its loading hint. */
  readonly onReady?: () => void;
}

export default function ExplodedCanvas({ build, onReady }: ExplodedCanvasProps) {
  return (
    <Canvas orthographic dpr={[1, MAX_DPR]} camera={{ near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true }} onCreated={() => onReady?.()} style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
      <LayerCamera centreY={stackCentreY(build)} />
      <BenchLight />
      <PartsProvider>
        <Stack build={build} />
      </PartsProvider>
    </Canvas>
  );
}
