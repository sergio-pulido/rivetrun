'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { Object3D } from 'three';
import type { Build } from '@rivetrun/contracts';
import { RobotContext } from '../drive';
import { Part } from '../Part';
import { MK2_FIXED, loadMk2Modules, type Mk2Module } from './loadModules';

const moduleIds = (build: Build): string[] => [build.locomotion, build.motor, build.battery, ...new Set(build.sensors), ...new Set(build.extras)];

/**
 * Loads the MK-II modules for a build. `null` while loading or after any failure:
 * the caller draws the procedural robot in both cases, so the MK-II can never leave a robot missing.
 */
export function useMk2Modules(build: Build, enabled: boolean): readonly Mk2Module[] | null {
  const key = moduleIds(build).join('|');
  const [loaded, setLoaded] = useState<{ key: string; modules: readonly Mk2Module[] } | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadMk2Modules(key.split('|'))
      .then((modules) => {
        if (!cancelled) setLoaded({ key, modules });
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  return enabled && loaded?.key === key ? loaded.modules : null;
}

/** How many MK-II robots are on screen right now: lets the frame-rate badge say what is really being measured. */
export const mk2Live = { robots: 0 };

interface Pivots {
  readonly wheels: Object3D[];
  readonly props: Object3D[];
  readonly drums: Object3D[];
  readonly rotors: Object3D[];
  readonly feet: Array<{ node: Object3D; restY: number }>;
}

/** Pivot nodes by the name prefixes of docs/MK2_ASSET_CONTRACT.md (mesh children carry a `__nn` suffix and are skipped). */
function findPivots(root: Object3D, into: Pivots): void {
  root.traverse((node) => {
    const name = node.name.replace(/_node$/, '');
    if (/__\d+$/.test(name)) return;
    if (name.startsWith('wheel_') || name.startsWith('tread_')) into.wheels.push(node);
    else if (name.startsWith('drone_prop_')) into.props.push(node);
    else if (name === 'winch_drum') into.drums.push(node);
    else if (name.startsWith('thruster_rotor_')) into.rotors.push(node);
    else if (name === 'jump_piston_foot') into.feet.push({ node, restY: node.position.y });
  });
}

interface Mk2PartsProps {
  modules: readonly Mk2Module[];
  /** Run view: the scout drone flies ahead on its own rig, so its module stays off the rover. */
  droneAway: boolean;
}

/** The MK-II rover: one detachable piece per module, pivots driven from the same RobotDrive as the procedural robot. */
export function Mk2Parts({ modules, droneAway }: Mk2PartsProps) {
  const context = useContext(RobotContext);
  const shown = useMemo(() => modules.filter((module) => !(droneAway && module.id === 'scout_drone')), [modules, droneAway]);
  // One clone per robot: geometry and materials stay shared with the cached template.
  const built = useMemo(() => {
    const pivots: Pivots = { wheels: [], props: [], drums: [], rotors: [], feet: [] };
    const parts = shown.map((module) => {
      const clone = module.root.clone(true);
      // The part pivots about its own centre (it tumbles when thrown off), so the geometry is shifted back by it.
      clone.position.sub(module.centre);
      findPivots(clone, pivots);
      const fixed = (MK2_FIXED as readonly string[]).includes(module.id);
      return { module, clone, pick: fixed ? undefined : { partId: module.id } };
    });
    return { parts, pivots, kick: { value: 0, wasAirborne: false } };
  }, [shown]);

  useEffect(() => {
    mk2Live.robots += 1;
    return () => {
      mk2Live.robots -= 1;
    };
  }, []);

  useFrame((_, rawDt) => {
    const drive = context?.drive.current;
    if (!drive) return;
    const dt = Math.min(rawDt, 0.05);
    const { pivots, kick } = built;
    for (const wheel of pivots.wheels) wheel.rotation.z -= drive.wheelSpin * dt;
    for (const prop of pivots.props) prop.rotation.y += 42 * dt;
    if (drive.winch) for (const drum of pivots.drums) drum.rotation.z -= 9 * dt;
    for (const rotor of pivots.rotors) rotor.rotation.x += (drive.thrusting ? 34 : 2) * dt;
    if (drive.airborne && !kick.wasAirborne) kick.value = 1;
    kick.wasAirborne = drive.airborne;
    kick.value = Math.max(0, kick.value - dt * 3.2);
    for (const foot of pivots.feet) foot.node.position.y = foot.restY - kick.value * 0.3;
  });

  return (
    <>
      {built.parts.map(({ module, clone, pick }) => (
        <Part key={module.id} position={[module.centre.x, module.centre.y, module.centre.z]} floor={module.drop} pick={pick}>
          <primitive object={clone} />
        </Part>
      ))}
    </>
  );
}
