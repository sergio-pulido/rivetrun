'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { RobotContext, restDrive, type RobotContextValue, type RobotDrive } from '@/game/robot/drive';
import { MaterialsContext, robotMaterials } from '@/game/robot/materials';

/**
 * What the game session's part models need around them: shared materials and a resting drive state.
 * The one place to update when the game session adds a field to its robot context.
 */
export function PartsProvider({ children }: { readonly children: ReactNode }) {
  const drive = useRef<RobotDrive>(restDrive());
  const context = useMemo<RobotContextValue>(() => ({ drive, popIn: false, lite: false, droneAway: false }), []);
  const materials = useMemo(() => robotMaterials(), []);
  return (
    <MaterialsContext.Provider value={materials}>
      <RobotContext.Provider value={context}>{children}</RobotContext.Provider>
    </MaterialsContext.Provider>
  );
}
