'use client';

import { PlaceholderRobot } from './PlaceholderRobot';
import { PlaceholderStage } from './PlaceholderStage';

/** Scaffold workshop view: robot on a workbench-sized pad, slow turntable. */
export default function WorkshopCanvas() {
  return (
    <PlaceholderStage cameraPosition={[2.6, 2.2, 3.6]} groundColor="#243042" groundSize={[6, 6]}>
      <PlaceholderRobot spin={0.4} />
    </PlaceholderStage>
  );
}
