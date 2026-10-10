'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { Build } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, PRESETS } from '@rivetrun/sim';
import { haptic } from './drive/haptics';
import { pickKey, type RoverPick } from './robot/pick';
import { SceneFrame } from './SceneFrame';
import { WorkshopScene, type WorkshopStage } from './workshop/WorkshopScene';
import { useRobotSignal } from './robot/mk2/live';

export interface WorkshopCanvasProps {
  /** Updates live: pass the build being edited. */
  build?: Build;
  spin?: number;
  /** Called once when the bench has drawn its first frame: fade your placeholder out here, not on mount. */
  onReady?: () => void;
  /**
   * A tap on the rover: `{ partId }` for a catalog part, `{ printedPartId }` for a printed part
   * (ids of docs/inputs/printed-parts.json), or null when the tap hit nothing. The tapped part is outlined.
   */
  onPick?: (pick: RoverPick | null) => void;
  /** Controls the outline yourself (e.g. clear it when the sheet closes). Leave undefined to let taps drive it. */
  picked?: RoverPick | null;
  /**
   * The studio around the rover: `light` (light-grey seamless) or `dark` (graphite). Left out: light on the
   * Workshop's own pages (/workshop…), dark everywhere else, so the bench on dark pages stays dark.
   */
  stage?: WorkshopStage;
}

/** Workshop view: the rover on a turntable in a studio. Opaque once drawn; fills its parent. */
export default function WorkshopCanvas({ build = PRESETS[DEFAULT_PRESET_ID].build, spin, onReady, onPick, picked, stage }: WorkshopCanvasProps) {
  const onWorkshop = usePathname()?.startsWith('/workshop') ?? false;
  const look: WorkshopStage = stage ?? (onWorkshop ? 'light' : 'dark');
  const [own, setOwn] = useState<RoverPick | null>(null);
  const shown = picked === undefined ? own : picked;
  const robot = useRobotSignal('workshop');
  const pick = (next: RoverPick | null): void => {
    if (next) haptic(8);
    setOwn(next);
    onPick?.(next);
  };
  return (
    // data-picked: the current selection, readable by QA and e2e tests without touching WebGL.
    // data-robot: which robot is on the turntable (mk2, procedural with data-robot-reason, or loading).
    <div className="relative h-full w-full" data-picked={shown ? pickKey(shown) : ''} data-stage={look} {...robot}>
      <SceneFrame
        label="Powering up the bench"
        bare
        alpha
        camera={{ fov: 34, near: 0.2, far: 60, position: [0, 3, 7] }}
        // pan-y: vertical swipes still scroll the page; horizontal drags spin the turntable.
        canvasStyle={{ touchAction: 'pan-y', cursor: 'grab' }}
        onReady={onReady}
        onPointerMissed={() => pick(null)}
      >
        {(plain) => <WorkshopScene build={build} spin={spin} plain={plain} picked={shown} onPick={pick} stage={look} />}
      </SceneFrame>
    </div>
  );
}
