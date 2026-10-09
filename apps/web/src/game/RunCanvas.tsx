'use client';

import { PlaceholderRobot } from './PlaceholderRobot';
import { PlaceholderStage } from './PlaceholderStage';

/** Scaffold run view: side-on camera, flat strip, rotating placeholder robot. */
export default function RunCanvas() {
  return (
    <PlaceholderStage cameraPosition={[0, 1.8, 10]} groundColor="#3a4250" groundSize={[40, 3]}>
      <PlaceholderRobot />
    </PlaceholderStage>
  );
}
