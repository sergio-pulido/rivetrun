'use client';

import { Canvas } from '@react-three/fiber';
import type { Build } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, PRESETS } from '@rivetrun/sim';
import { MAX_DPR } from './RunCanvas';
import { WorkshopScene } from './workshop/WorkshopScene';

export interface WorkshopCanvasProps {
  /** Updates live: pass the build being edited. */
  build?: Build;
  spin?: number;
}

/** Workshop view: robot on a turntable. Transparent background, fills its parent. */
export default function WorkshopCanvas({ build = PRESETS[DEFAULT_PRESET_ID].build, spin }: WorkshopCanvasProps) {
  return (
    <Canvas
      shadows
      dpr={[1, MAX_DPR]}
      camera={{ fov: 34, near: 0.2, far: 60, position: [0, 3, 7] }}
      gl={{ antialias: true, alpha: true }}
      // pan-y: vertical swipes still scroll the page; horizontal drags spin the turntable.
      style={{ width: '100%', height: '100%', touchAction: 'pan-y', cursor: 'grab' }}
    >
      <WorkshopScene build={build} spin={spin} />
    </Canvas>
  );
}
