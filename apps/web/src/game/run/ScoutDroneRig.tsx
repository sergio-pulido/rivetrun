'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  MeshBasicMaterial,
  RingGeometry,
  SRGBColorSpace,
  SpriteMaterial,
  type Group,
  type Mesh,
  type Sprite,
} from 'three';
import type { BrainQuestion } from '@rivetrun/contracts';
import { LANES, TERRAIN_LOOK, UI } from '../palette';
import { clamp, damp } from '../rng';
import { DroneModel } from '../robot/ScoutDrone';
import type { RunFeed } from '../runFeed';
import { sampleTrack, type TrackLayout } from '../track';
import type { Pose } from './pose';

/** The drone holds station this far ahead of the robot, and this high above the track. */
const AHEAD_M = 2.8;
const ALTITUDE_M = 2.9;
/** Drawn a little larger in flight than on its pad, so it reads on a phone. */
const FLIGHT_SCALE = 1.4;
/** The scan cone lands a little further on. */
const SCAN_AHEAD_M = 0.95;
const SCAN_RADIUS = 1.1;

// Apex at the origin, opening downwards, unit height and radius: scaled per frame.
const CONE = new ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0);
const RING = new RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);

function edgeLine(side: 1 | -1, material: LineDashedMaterial): Line {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, side, -1, 0], 3));
  const line = new Line(geometry, material);
  line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}

/** A sprite whose text can change every frame without allocating a texture per string. */
function useTag(): { material: SpriteMaterial; setText: (text: string) => void } {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 64;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false });
    let shown = '';
    const setText = (text: string) => {
      if (text === shown) return;
      shown = text;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 320, 64);
      ctx.fillStyle = 'rgba(8,24,27,0.92)';
      ctx.beginPath();
      ctx.roundRect(2, 2, 316, 60, 14);
      ctx.fill();
      ctx.strokeStyle = UI.cyan;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = UI.cyanText;
      ctx.font = '600 30px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 160, 34);
      texture.needsUpdate = true;
    };
    setText('SCANNING');
    return { material, setText };
  }, []);
}

interface ScoutDroneRigProps {
  feed: RunFeed;
  layout: TrackLayout;
  pose: RefObject<Pose>;
}

/**
 * The Scout Drone in flight (docs/design/v1/RunIce.dc.html): takes off from the robot, holds station ahead,
 * sweeps a cyan cone over the ground and tags what it reports. The tag shows perception only, never ground truth.
 */
export function ScoutDroneRig({ feed, layout, pose }: ScoutDroneRigProps) {
  const drone = useRef<Group>(null);
  const cone = useRef<Group>(null);
  const footprint = useRef<Mesh>(null);
  const ping = useRef<Mesh>(null);
  const tagSprite = useRef<Sprite>(null);
  const flight = useRef({ ready: false, s: 0, y: 0, seenAtS: 0, question: null as BrainQuestion | null });
  const tag = useTag();
  const materials = useMemo(
    () => ({
      cone: new MeshBasicMaterial({ color: UI.cyan, transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false, fog: false }),
      edge: new LineDashedMaterial({ color: UI.cyan, dashSize: 0.03, gapSize: 0.035, transparent: true, opacity: 0.9, fog: false }),
      footprint: new MeshBasicMaterial({ color: UI.cyan, transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
      ping: new MeshBasicMaterial({ color: UI.cyan, transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
    }),
    [],
  );
  const edges = useMemo(() => [edgeLine(1, materials.edge), edgeLine(-1, materials.edge)], [materials]);

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
      edges.forEach((edge) => edge.geometry.dispose());
      tag.material.map?.dispose();
      tag.material.dispose();
    },
    [materials, edges, tag],
  );

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.5);
    const t = clock.elapsedTime;
    const p = pose.current;
    const f = flight.current;
    const visible = p.ready;
    for (const node of [drone.current, cone.current, footprint.current, ping.current, tagSprite.current]) if (node) node.visible = visible;
    if (!visible || !drone.current || !cone.current) {
      f.ready = false;
      return;
    }
    const view = feed.get();
    // When the run is over the drone comes back and hovers over the robot.
    const station = view.done ? 0.2 : AHEAD_M;
    if (!f.ready || Math.abs(p.s - f.s) > 12) {
      // Take off from the pad on the rear deck.
      f.s = p.s - 0.7;
      f.y = p.y + 1.1;
      f.ready = true;
    }
    const targetS = Math.min(p.s + station, layout.lengthM + 8);
    f.s = damp(f.s, targetS, 3.2, dt);
    const at = sampleTrack(layout, f.s);
    f.y = damp(f.y, at.y + ALTITUDE_M + (view.done ? -0.5 : 0), 3, dt);
    const bob = Math.sin(t * 2.4) * 0.07;
    drone.current.position.set(at.x, f.y + bob, LANES.player);
    drone.current.rotation.z = -clamp((targetS - f.s) * 0.22, -0.4, 0.4);
    drone.current.rotation.x = Math.sin(t * 1.7) * 0.05;

    // Scan cone from the camera ball to the ground ahead.
    const ground = sampleTrack(layout, f.s + SCAN_AHEAD_M);
    const apexY = f.y + bob - 0.14 * FLIGHT_SCALE;
    const dx = ground.x - at.x;
    const dy = apexY - ground.y;
    const length = Math.hypot(dx, dy);
    const scanning = !view.done;
    cone.current.visible = scanning;
    cone.current.position.set(at.x + 0.04, apexY, LANES.player);
    cone.current.rotation.z = Math.atan2(dx, dy);
    cone.current.scale.set(SCAN_RADIUS, length, SCAN_RADIUS * 0.8);
    materials.cone.opacity = 0.17 + 0.06 * Math.sin(t * 5);

    if (footprint.current && ping.current) {
      footprint.current.visible = scanning;
      ping.current.visible = scanning;
      footprint.current.position.set(ground.x, ground.y + 0.03, LANES.player);
      footprint.current.rotation.z = ground.slopeRad;
      footprint.current.scale.set(SCAN_RADIUS, 1, SCAN_RADIUS * 0.8);
      const k = (t * 0.9) % 1;
      ping.current.position.copy(footprint.current.position);
      ping.current.rotation.z = ground.slopeRad;
      ping.current.scale.set(SCAN_RADIUS * (0.15 + 0.85 * k), 1, SCAN_RADIUS * 0.8 * (0.15 + 0.85 * k));
      materials.ping.opacity = 0.85 * (1 - k);
    }

    // The tag: what the drone last reported, counted down as the robot closes in.
    const question = view.pending?.question ?? view.decision?.question ?? null;
    if (question !== f.question) {
      f.question = question;
      f.seenAtS = p.s;
    }
    const seen = question?.perceived;
    let text = 'SCANNING';
    if (seen && seen.terrainAhead !== 'unknown' && seen.terrainAheadDistanceM !== 'unknown') {
      const left = seen.terrainAheadDistanceM - (p.s - f.seenAtS);
      if (left > 0.4) text = `${TERRAIN_LOOK[seen.terrainAhead].label.toUpperCase()} · ${left < 10 ? left.toFixed(1) : Math.round(left)} m`;
    }
    tag.setText(text);
    if (tagSprite.current) {
      tagSprite.current.visible = scanning;
      tagSprite.current.position.set(ground.x, ground.y + 0.34, LANES.zFront - 0.25);
    }
  });

  return (
    <>
      <group ref={drone} visible={false} scale={FLIGHT_SCALE}>
        <DroneModel />
      </group>
      <group ref={cone} visible={false}>
        <mesh geometry={CONE} material={materials.cone} renderOrder={5} />
        {edges.map((edge, i) => (
          <primitive key={i} object={edge} />
        ))}
      </group>
      <mesh ref={footprint} geometry={RING} material={materials.footprint} visible={false} renderOrder={6} />
      <mesh ref={ping} geometry={RING} material={materials.ping} visible={false} renderOrder={6} />
      <sprite ref={tagSprite} material={tag.material} scale={[1.6, 0.32, 1]} visible={false} renderOrder={11} />
    </>
  );
}
