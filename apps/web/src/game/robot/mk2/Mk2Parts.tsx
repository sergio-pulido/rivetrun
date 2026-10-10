'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { Object3D } from 'three';
import type { Build } from '@rivetrun/contracts';
import { RobotContext } from '../drive';
import { Part } from '../Part';
import { loadMk2Kit, type Mk2Kit } from './loadModules';

const otherIds = (build: Build): string[] => [build.motor, build.battery, ...new Set(build.sensors), ...new Set(build.extras)];

/**
 * Loads what the MK-II export has for a build. `null` while loading or after any failure:
 * the caller draws the procedural robot in both cases, so the MK-II can never leave a robot missing.
 */
export function useMk2Kit(build: Build, enabled: boolean): Mk2Kit | null {
  const key = [build.locomotion, ...otherIds(build)].join('|');
  const [loaded, setLoaded] = useState<{ key: string; kit: Mk2Kit } | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const [locomotion, ...others] = key.split('|');
    loadMk2Kit(locomotion!, others)
      .then((kit) => {
        if (!cancelled) setLoaded({ key, kit });
      })
      .catch((cause: unknown) => {
        mk2Live.reason = cause instanceof Error ? cause.message : 'load failed';
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  return enabled && loaded?.key === key ? loaded.kit : null;
}

/** How many MK-II robots are on screen right now: lets the frame-rate badge say what is really being measured. */
/** `robots`: MK-II robots on screen. `reason`: why the last one fell back to the procedural robot, for the frame-rate badge. */
export const mk2Live: { robots: number; reason: string | null } = { robots: 0, reason: null };

interface Pivots {
  readonly wheels: Object3D[];
  readonly props: Object3D[];
  readonly drums: Object3D[];
  readonly rotors: Object3D[];
  readonly feet: Array<{ node: Object3D; restY: number }>;
}

/** Pivot nodes by the name prefixes of docs/MK2_ASSET_CONTRACT.md. Meshes are never pivots. */
function findPivots(root: Object3D, into: Pivots): void {
  root.traverse((node) => {
    if ((node as { isMesh?: boolean }).isMesh) return;
    const name = node.name;
    if (name.startsWith('wheel_') || name.startsWith('tread_')) into.wheels.push(node);
    else if (name.startsWith('drone_prop_')) into.props.push(node);
    else if (name === 'winch_drum') into.drums.push(node);
    else if (name.startsWith('thruster_rotor_')) into.rotors.push(node);
    else if (name === 'jump_piston_foot') into.feet.push({ node, restY: node.position.y });
  });
}

const FIXED: ReadonlySet<string> = new Set(['chassis', 'controller']);
const LOCOMOTION: ReadonlySet<string> = new Set(['wheels', 'offroad_wheels', 'tracks']);

interface Mk2PartsProps {
  kit: Mk2Kit;
  /** Run view: the scout drone flies ahead on its own rig, so its module stays off the rover. */
  droneAway: boolean;
}

/** The exported MK-II modules: one detachable piece each, pivots driven from the same RobotDrive as the procedural robot. */
export function Mk2Parts({ kit, droneAway }: Mk2PartsProps) {
  const context = useContext(RobotContext);
  const shown = useMemo(() => kit.modules.filter((module) => !(droneAway && module.id === 'scout_drone')), [kit, droneAway]);
  // One clone per robot: geometry and materials stay shared with the cached template.
  const built = useMemo(() => {
    const pivots: Pivots = { wheels: [], props: [], drums: [], rotors: [], feet: [] };
    const parts = shown.map((module) => {
      const clone = module.root.clone(true);
      // The part pivots about its own centre (it tumbles when thrown off), so the geometry is shifted back by it.
      clone.position.sub(module.centre);
      findPivots(clone, pivots);
      const lift = LOCOMOTION.has(module.id) ? 0 : kit.lift;
      return { module, clone, lift, pick: FIXED.has(module.id) ? undefined : { partId: module.id } };
    });
    return { parts, pivots, kick: { value: 0, wasAirborne: false } };
  }, [shown, kit.lift]);

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
      {built.parts.map(({ module, clone, lift, pick }) => (
        <Part key={module.id} position={[module.centre.x, module.centre.y + lift, module.centre.z]} floor={module.drop} pick={pick}>
          <primitive object={clone} />
        </Part>
      ))}
    </>
  );
}
