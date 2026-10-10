'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Object3D } from 'three';
import type { Build } from '@rivetrun/contracts';
import { RobotContext } from '../drive';
import { Part } from '../Part';
import { mk2Live } from './live';
import { loadMk2Kit, loadMk2KitLate, type Mk2Kit } from './loadModules';

const otherIds = (build: Build): string[] => [build.motor, build.battery, ...new Set(build.sensors), ...new Set(build.extras)];

/** Starts loading a build's kit and resolves when it is ready or has failed: a run waits for this, so its robot is there at the start. */
export function preloadMk2(build: Build): Promise<void> {
  return loadMk2Kit(build.locomotion, otherIds(build)).then(
    () => undefined,
    () => undefined,
  );
}

export interface Mk2State {
  /** The kit to draw. While the next build's kit loads this is still the previous one, so a part swap never blanks the robot. */
  readonly kit: Mk2Kit | null;
  /** `loading`: nothing to draw yet (first load). `failed`: the caller draws the procedural robot. */
  readonly status: 'off' | 'loading' | 'ready' | 'failed';
}

const OFF: Mk2State = { kit: null, status: 'off' };

/**
 * Loads what the MK-II export has for a build. A failure or a timeout is `failed` and the caller draws the
 * procedural robot instead, so the MK-II can never leave a robot missing.
 */
export function useMk2Kit(build: Build, enabled: boolean): Mk2State {
  const key = [build.locomotion, ...otherIds(build)].join('|');
  const [state, setState] = useState<{ key: string; kit: Mk2Kit | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const [locomotion, ...others] = key.split('|');
    loadMk2Kit(locomotion!, others)
      .then((kit) => {
        if (!cancelled) setState({ key, kit, failed: false });
      })
      .catch((cause: unknown) => {
        mk2Live.fail(cause instanceof Error ? cause.message : 'load failed');
        if (cancelled) return;
        setState({ key, kit: null, failed: true });
        // Too slow is not broken: the files keep loading, and when they arrive the MK-II takes over from the
        // fallback (a phone on a slow link is not left with the procedural robot for the whole session).
        // A kit that is really missing or broken rejects here as well and the fallback stays.
        loadMk2KitLate(locomotion!, others).then(
          (kit) => {
            if (!cancelled) setState({ key, kit, failed: false });
          },
          () => undefined,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  if (!enabled) return OFF;
  if (!state) return { kit: null, status: 'loading' };
  if (state.key === key) return { kit: state.kit, status: state.failed ? 'failed' : 'ready' };
  // A newer build is loading: keep drawing the last kit that loaded (or stay on the fallback).
  return { kit: state.kit, status: state.failed ? 'failed' : 'ready' };
}

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
  // One clone per robot and module: geometry and materials stay shared with the cached template. Clones are kept
  // across part swaps, so only the module that changed is rebuilt (and pops in); the rest stay exactly as they are.
  const clones = useRef(new Map<Mk2Kit['modules'][number], Object3D>());
  const built = useMemo(() => {
    const pivots: Pivots = { wheels: [], props: [], drums: [], rotors: [], feet: [] };
    const kept = new Map<Mk2Kit['modules'][number], Object3D>();
    const parts = shown.map((module) => {
      let clone = clones.current.get(module);
      if (!clone) {
        clone = module.root.clone(true);
        // The part pivots about its own centre (it tumbles when thrown off), so the geometry is shifted back by it.
        clone.position.sub(module.centre);
      }
      kept.set(module, clone);
      findPivots(clone, pivots);
      const lift = LOCOMOTION.has(module.id) ? 0 : kit.lift;
      return { module, clone, lift, pick: FIXED.has(module.id) ? undefined : { partId: module.id } };
    });
    clones.current = kept;
    return { parts, pivots, kick: { value: 0, wasAirborne: false } };
  }, [shown, kit.lift]);

  useEffect(() => mk2Live.mount(), []);

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
