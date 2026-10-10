'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, DoubleSide, CylinderGeometry, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, type InstancedMesh } from 'three';
import { LANES } from '../palette';
import { mulberry32 } from '../rng';
import { sampleTrack, type TrackLayout } from '../track';
import { Scatter, type Item } from './Dressing';
import { QuadBuilder } from './quads';
import { glowTexture, hazardTexture } from './textures';

// Earthquake Rescue (M7): the track runs through a collapsed street. Everything here is scenery placed around
// the sim's geometry, never on it: nothing stands in a lane, over a gap, on a ramp or deck, or against an obstacle.

const BOX = new BoxGeometry(1, 1, 1);
const ROD = new CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0);
const GLOW = new PlaneGeometry(1, 1);

const CONCRETE = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true });
const RUST = new MeshStandardMaterial({ roughness: 0.7, metalness: 0.5 });
const POST = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.3 });

const GREYS = ['#9a9c9f', '#85888c', '#aeb0b2', '#74777b', '#a39f97'] as const;
const RUSTS = ['#6b3f2a', '#55382b', '#7a4a30'] as const;

/** Half-width a robot needs clear around its lane centre (as in Dressing). */
const LANE_CLEARANCE = 0.74;
/** Back of the track: slabs and broken walls stand here, behind the last lane. */
const BACK = { near: LANES.random - LANE_CLEARANCE, far: LANES.zBack - 0.75 } as const;
/** Front edge: only low rubble, so nothing hides the robots. */
const FRONT = { near: LANES.player + LANE_CLEARANCE, far: LANES.zFront - 0.12 } as const;

interface Span {
  readonly s0: number;
  readonly s1: number;
}

export interface RescueDressingProps {
  layout: TrackLayout;
  /** Track spans to keep clear of tall pieces (scan pads and their tags). */
  clear?: readonly Span[];
  /** 0–1: fraction of the debris, dust and lights to draw (0.5 on weak devices and with ?quality=low). */
  budget?: number;
  /** Also build the slabs, walls and cordons here. False when the prop kit (run/rescue) supplies them: only grit and dust are drawn. */
  full?: boolean;
}

interface Built {
  readonly concrete: Item[];
  readonly rods: Item[];
  readonly posts: Item[];
  readonly beacons: Array<readonly [number, number, number]>;
  readonly tape: Array<{ readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }>;
}

function build(layout: TrackLayout, clear: readonly Span[], budget: number, full: boolean): Built {
  const rand = mulberry32(7007);
  const out: Built = { concrete: [], rods: [], posts: [], beacons: [], tape: [] };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const inside = (spans: readonly Span[], s: number, pad: number): boolean => spans.some((span) => s > span.s0 - pad && s < span.s1 + pad);
  // The sim's own geometry: nothing is placed on or against it.
  const solid: Span[] = [...layout.inclines, ...layout.gaps, ...layout.obstacles];
  const signs = (s: number): boolean => Math.abs(s - Math.round(s / 10) * 10) < 0.9;
  const at = (s: number) => sampleTrack(layout, s);

  // Slabs and broken walls along the back of the street.
  for (let s = 1.6; full && s < layout.lengthM - 1.5; s += 1.5 + rand() * 1.5) {
    if (inside(solid, s, 1.1) || inside(clear, s, 1.7) || signs(s)) continue;
    const here = at(s);
    const z = BACK.far + 0.15 + rand() * 0.35;
    if (rand() < 0.5) {
      // A floor slab that came down on one edge.
      const length = 1.3 + rand() * 1.1;
      const thick = 0.14 + rand() * 0.1;
      const lean = (rand() < 0.5 ? -1 : 1) * (0.18 + rand() * 0.5);
      const y = here.y + (Math.abs(Math.sin(lean)) * length) / 2 + (Math.cos(lean) * thick) / 2 - 0.02;
      out.concrete.push({ p: [here.x, y, z], s: [length, thick, 1.2 + rand() * 0.5], yaw: (rand() - 0.5) * 0.3, slope: lean, c: pick(GREYS) });
      // Rebar out of the raised edge.
      const edge = Math.sign(lean) * (length / 2) * Math.cos(lean);
      for (let i = 0; i < 2 + Math.floor(rand() * 2); i += 1) {
        out.rods.push({ p: [here.x + edge, y + (Math.abs(Math.sin(lean)) * length) / 2 - 0.05, z + (rand() - 0.5) * 0.9], s: [0.018, 0.3 + rand() * 0.45, 0.018], yaw: 0, slope: lean - Math.sign(lean) * (1.2 + rand() * 0.5), tilt: (rand() - 0.5) * 0.7, c: pick(RUSTS) });
      }
    } else {
      // What is left standing of a wall, with its reinforcement showing at the top.
      const height = 1.0 + rand() * 1.5;
      const width = 0.9 + rand() * 0.7;
      const lean = (rand() - 0.5) * 0.24;
      out.concrete.push({ p: [here.x, here.y + height / 2 - 0.03, z - 0.1], s: [0.22 + rand() * 0.1, height, width], yaw: (rand() - 0.5) * 0.5, slope: lean, c: pick(GREYS) });
      for (let i = 0; i < 3; i += 1) {
        out.rods.push({ p: [here.x - Math.sin(lean) * height, here.y + height - 0.06, z - 0.1 + (i - 1) * width * 0.3], s: [0.018, 0.25 + rand() * 0.4, 0.018], yaw: 0, slope: lean + (rand() - 0.5) * 0.9, tilt: (rand() - 0.5) * 0.6, c: pick(RUSTS) });
      }
    }
  }

  // Rubble: chunks at the back, low pieces along the front edge and thin grit between the lanes.
  const lanesBetween = [(LANES.player + LANES.heuristic) / 2, (LANES.heuristic + LANES.random) / 2];
  const chunks = Math.round(170 * budget);
  for (let i = 0; i < chunks; i += 1) {
    const s = 0.8 + rand() * (layout.lengthM - 1.6);
    if (inside(solid, s, 0.45)) continue;
    const here = at(s);
    const roll = rand();
    const back = roll < 0.5;
    const front = !back && roll < 0.78;
    const size = back ? 0.1 + rand() * 0.24 : front ? 0.06 + rand() * 0.1 : 0.03 + rand() * 0.035;
    const z = back ? BACK.near - rand() * (BACK.near - BACK.far) : front ? FRONT.near + rand() * (FRONT.far - FRONT.near) : lanesBetween[Math.floor(rand() * 2)]! + (rand() - 0.5) * 0.3;
    out.concrete.push({ p: [here.x, here.y + size * 0.3, z], s: [size * (0.8 + rand() * 0.9), size * (0.5 + rand() * 0.5), size * (0.8 + rand() * 0.9)], yaw: rand() * 6, slope: (rand() - 0.5) * 0.5, tilt: (rand() - 0.5) * 0.5, c: pick(GREYS) });
  }

  // Each hole and the drop is cordoned off along the back: two posts with a beacon, hazard tape between them.
  const cordons: Span[] = !full ? [] : [...layout.gaps, ...layout.inclines.filter((incline) => incline.kind === 'drop').map((incline) => ({ s0: incline.s1 - 0.4, s1: incline.s1 + 0.4 }))];
  for (const hole of cordons) {
    const ends = [Math.max(0.5, hole.s0 - 1.3), Math.min(layout.lengthM - 0.5, hole.s1 + 1.3)] as const;
    const z = BACK.near - 0.12;
    const feet = ends.map((s) => at(s));
    feet.forEach((foot) => {
      out.posts.push({ p: [foot.x, foot.y, z], s: [0.035, 0.95, 0.035], yaw: 0, slope: 0, c: '#e8eaee' });
      out.posts.push({ p: [foot.x, foot.y, z], s: [0.12, 0.05, 0.12], yaw: 0, slope: 0, c: '#30343a' });
      out.beacons.push([foot.x, foot.y + 1.02, z]);
    });
    out.tape.push({ x0: feet[0]!.x, y0: feet[0]!.y + 0.72, x1: feet[1]!.x, y1: feet[1]!.y + 0.72 });
  }
  return out;
}

const DUST = 48;

/** Rubble and dust hanging in the air; with `full`, also collapsed concrete, rebar and cordons with beacons. Two to seven draw calls. */
export function RescueDressing({ layout, clear = [], budget = 1, full = true }: RescueDressingProps) {
  const built = useMemo(() => build(layout, clear, budget, full), [layout, clear, budget, full]);
  const camera = useThree((state) => state.camera);

  const tape = useMemo(() => {
    const quads = new QuadBuilder();
    const z = BACK.near - 0.12;
    for (const run of built.tape) {
      const mid = (run.y0 + run.y1) / 2 - 0.12;
      const xm = (run.x0 + run.x1) / 2;
      // Two straight lengths with a sag in the middle.
      const u = (xm - run.x0) / 0.36;
      quads.quad([run.x0, run.y0, z], [xm, mid, z], [xm, mid + 0.09, z], [run.x0, run.y0 + 0.09, z], [[0, 0], [u, 0], [u, 0.25], [0, 0.25]]);
      quads.quad([xm, mid, z], [run.x1, run.y1, z], [run.x1, run.y1 + 0.09, z], [xm, mid + 0.09, z], [[u, 0], [u * 2, 0], [u * 2, 0.25], [u, 0.25]]);
    }
    return quads.build();
  }, [built]);
  const tapeMaterial = useMemo(() => {
    const texture = hazardTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(1, 1);
    return new MeshBasicMaterial({ map: texture, vertexColors: false, side: DoubleSide });
  }, []);
  useEffect(() => () => tape.dispose(), [tape]);
  useEffect(() => () => tapeMaterial.dispose(), [tapeMaterial]);

  // Beacons: a lamp and a soft glow per post, pulsing together. No real lights: they would cost a pass each.
  const lamps = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);
  const lampMaterial = useMemo(() => new MeshBasicMaterial({ color: '#ff9a2e', toneMapped: false }), []);
  const glowMaterial = useMemo(() => new MeshBasicMaterial({ map: glowTexture(), color: '#ff8a1e', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, fog: false }), []);
  useEffect(() => () => {
    lampMaterial.dispose();
    glowMaterial.dispose();
  }, [lampMaterial, glowMaterial]);
  const glowing = budget >= 1;
  useEffect(() => {
    const dummy = new Object3D();
    built.beacons.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(0.09, 0.09, 0.09);
      dummy.updateMatrix();
      lamps.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, y, z + 0.06);
      dummy.scale.set(1.5, 1.5, 1);
      dummy.updateMatrix();
      glows.current?.setMatrixAt(i, dummy.matrix);
    });
    if (lamps.current) lamps.current.instanceMatrix.needsUpdate = true;
    if (glows.current) glows.current.instanceMatrix.needsUpdate = true;
  }, [built, glowing]);

  // Dust: slow motes in a box that follows the camera.
  const motes = Math.round(DUST * (budget >= 1 ? 1 : 0));
  const dust = useRef<InstancedMesh>(null);
  const dustMaterial = useMemo(() => new MeshBasicMaterial({ color: '#f0cfa4', transparent: true, opacity: 0.2, depthWrite: false, fog: false }), []);
  useEffect(() => () => dustMaterial.dispose(), [dustMaterial]);
  const seeds = useMemo(() => Array.from({ length: DUST }, (_, i) => [((i * 53) % 97) / 97, ((i * 31) % 89) / 89, ((i * 17) % 83) / 83] as const), []);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const beat = 0.5 + 0.5 * Math.sin(t * 5.2);
    lampMaterial.color.setRGB(1, 0.42 + beat * 0.3, 0.08 + beat * 0.14);
    glowMaterial.opacity = 0.12 + beat * 0.5;
    const node = dust.current;
    if (!node) return;
    for (let i = 0; i < motes; i += 1) {
      const [a, b, c] = seeds[i]!;
      const x = (((a * 15 + t * (0.12 + b * 0.2)) % 15) + 15) % 15 - 7.5;
      const y = 0.3 + ((b * 5 + t * 0.07 * (0.5 + c)) % 5);
      dummy.position.set(camera.position.x + x, camera.position.y - 6.2 + y, LANES.zBack + c * (LANES.zFront - LANES.zBack + 1.5));
      const size = 0.035 + a * 0.05;
      dummy.scale.set(size, size, size);
      dummy.rotation.set(t * a, t * b, 0);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    }
    node.instanceMatrix.needsUpdate = true;
  });

  return (
    <group dispose={null}>
      <Scatter geometry={BOX} material={CONCRETE} items={built.concrete} shadow />
      <Scatter geometry={ROD} material={RUST} items={built.rods} />
      <Scatter geometry={ROD} material={POST} items={built.posts} />
      {built.tape.length > 0 && <mesh geometry={tape} material={tapeMaterial} />}
      {built.beacons.length > 0 && <instancedMesh ref={lamps} args={[BOX, lampMaterial, built.beacons.length]} frustumCulled={false} />}
      {glowing && built.beacons.length > 0 && <instancedMesh ref={glows} args={[GLOW, glowMaterial, built.beacons.length]} frustumCulled={false} renderOrder={3} />}
      {motes > 0 && <instancedMesh key={motes} ref={dust} args={[BOX, dustMaterial, motes]} frustumCulled={false} />}
    </group>
  );
}
