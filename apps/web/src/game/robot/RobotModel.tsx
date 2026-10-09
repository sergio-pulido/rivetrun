'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { Group } from 'three';
import type { Action, Build, SimState } from '@rivetrun/contracts';
import { Attachments } from './Attachments';
import { Battery, Chassis, Controller, Motors } from './Body';
import { RobotContext, locomotionGeometry, restDrive, type Expression, type RobotContextValue, type RobotDrive } from './drive';
import { Face } from './Face';
import { Locomotion } from './Locomotion';
import { MaterialsContext, ghostMaterials, robotMaterials } from './materials';

export interface RobotModelProps {
  build: Build;
  /** Per-frame control (run scene). When set, the convenience props below are ignored. */
  drive?: RefObject<RobotDrive>;
  /** Convenience: drive wheels, slip wobble and winch straight from a sim frame. */
  state?: SimState | null;
  /** Convenience: the last action the Brain chose, shown on the LED face. */
  action?: Action | null;
  expression?: Expression;
  dnf?: boolean;
  /** Translucent single-colour ghost. */
  ghostTint?: string;
  /** Parts pop in with a spring when they mount (workshop). */
  popIn?: boolean;
  /** Run view: the scout drone flies ahead, so the pad on the robot stays empty. */
  droneAway?: boolean;
}

/**
 * Procedural low-poly maker robot. Origin = ground under the centre, +X = forward.
 * Every part is a detachable <Part>: swap the build and the model rebuilds live.
 */
export function RobotModel({ build, drive, state, action, expression, dnf = false, ghostTint, popIn = false, droneAway = false }: RobotModelProps) {
  const own = useRef<RobotDrive>(restDrive());
  const active = drive ?? own;
  const sway = useRef<Group>(null);

  useEffect(() => {
    if (drive) return;
    const slipping = state?.effects.includes('slip') ?? false;
    own.current = {
      wheelSpin: state?.wheelSpin ?? 0,
      speed: state?.v ?? 0,
      slip: slipping ? 1 : 0,
      expression: dnf ? 'dnf' : (expression ?? (slipping ? 'slip' : (action ?? 'idle'))),
      dnf,
      winch: state?.effects.includes('winch') ?? false,
      thrusting: state?.thrusting ?? false,
    };
  }, [drive, state, action, expression, dnf]);

  const geo = locomotionGeometry(build.locomotion);
  const floor = -geo.deckY;
  const lite = ghostTint !== undefined;
  const materials = useMemo(() => (ghostTint ? ghostMaterials(ghostTint) : robotMaterials()), [ghostTint]);
  const context = useMemo<RobotContextValue>(() => ({ drive: active, popIn, lite, droneAway }), [active, popIn, lite, droneAway]);

  useFrame(({ clock }) => {
    const node = sway.current;
    if (!node) return;
    const { slip, speed, dnf: wrecked } = active.current;
    const t = clock.elapsedTime;
    // Wobble on slip; a faint suspension jiggle with speed.
    node.rotation.x = wrecked ? 0 : Math.sin(t * 21) * 0.13 * slip;
    node.rotation.y = wrecked ? 0 : Math.sin(t * 13) * 0.11 * slip;
    node.position.y = wrecked ? 0 : Math.abs(Math.sin(t * 17)) * 0.012 * Math.min(2, Math.abs(speed));
  });

  return (
    <MaterialsContext.Provider value={materials}>
      <RobotContext.Provider value={context}>
        {/* Shared materials and geometries must survive unmounts. */}
        <group dispose={null}>
          <group ref={sway}>
            <Locomotion key={build.locomotion} id={build.locomotion} />
            <group position={[0, geo.deckY, 0]}>
              <Chassis key={`chassis-${build.locomotion}`} geo={geo} floor={floor} />
              {!lite && <Motors key={`${build.motor}-${build.locomotion}`} id={build.motor} geo={geo} floor={floor} />}
              <Battery key={build.battery} id={build.battery} floor={floor} />
              <Controller floor={floor} />
              <Face floor={floor} />
              <Attachments sensors={build.sensors} extras={build.extras} floor={floor} />
            </group>
          </group>
        </group>
      </RobotContext.Provider>
    </MaterialsContext.Provider>
  );
}
