'use client';

import type { Build } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, PRESETS } from '@rivetrun/sim';
import { SceneFrame } from './SceneFrame';
import { WorkshopScene } from './workshop/WorkshopScene';

export interface WorkshopCanvasProps {
  /** Updates live: pass the build being edited. */
  build?: Build;
  spin?: number;
  /** Called once when the bench has drawn its first frame: fade your placeholder out here, not on mount. */
  onReady?: () => void;
}

/** Workshop view: robot on a turntable. Transparent background, fills its parent. */
export default function WorkshopCanvas({ build = PRESETS[DEFAULT_PRESET_ID].build, spin, onReady }: WorkshopCanvasProps) {
  return (
    <div className="relative h-full w-full">
      <SceneFrame
        label="Powering up the bench"
        bare
        alpha
        camera={{ fov: 34, near: 0.2, far: 60, position: [0, 3, 7] }}
        // pan-y: vertical swipes still scroll the page; horizontal drags spin the turntable.
        canvasStyle={{ touchAction: 'pan-y', cursor: 'grab' }}
        onReady={onReady}
      >
        {(plain) => <WorkshopScene build={build} spin={spin} plain={plain} />}
      </SceneFrame>
    </div>
  );
}
