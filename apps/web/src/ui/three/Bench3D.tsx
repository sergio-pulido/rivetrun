'use client';

import type { Build } from '@rivetrun/contracts';
import { BenchCanvas } from './index';
import { RobotSketch } from './sketches';
import { Stage3D } from './Stage3D';

interface Bench3DProps {
  readonly build: Build;
  readonly spin?: number;
  readonly className?: string;
}

/** The robot on the workbench turntable: a drawn robot at first paint, the 3D bench once it has loaded. */
export function Bench3D({ build, spin, className }: Bench3DProps) {
  return (
    <Stage3D className={className} loadingLabel="Powering up the bench" placeholder={<RobotSketch width={230} />}>
      {(onReady) => <BenchCanvas build={build} spin={spin} onReady={onReady} />}
    </Stage3D>
  );
}
