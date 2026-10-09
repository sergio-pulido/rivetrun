'use client';

import type { Build } from '@rivetrun/contracts';
import type { RoverPick } from '@/game/robot/pick';
import { BenchCanvas } from './index';
import { RobotSketch } from './sketches';
import { Stage3D } from './Stage3D';

interface Bench3DProps {
  readonly build: Build;
  readonly spin?: number;
  /** A tap on a part of the rover (null = empty space). A drag that spins the turntable is not a tap. */
  readonly onPick?: (pick: RoverPick | null) => void;
  readonly className?: string;
}

/** The robot on the workbench turntable: a drawn robot at first paint, the 3D bench once it has loaded. */
export function Bench3D({ build, spin, onPick, className }: Bench3DProps) {
  return (
    <Stage3D className={className} loadingLabel="Powering up the bench" placeholder={<RobotSketch width={230} />}>
      {(onReady) => <BenchCanvas build={build} spin={spin} onReady={onReady} onPick={onPick} />}
    </Stage3D>
  );
}
