'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three';
import { LANES, UI } from '../palette';
import { mulberry32 } from '../rng';
import { OBSTACLE_HEIGHT, basinDepthAt, obstacleS, sampleTrack, type LaidSegment, type TrackLayout } from '../track';
import { checkerTexture, hazardTexture, labelTexture } from './textures';

interface Item {
  readonly p: readonly [number, number, number];
  readonly s: readonly [number, number, number];
  readonly yaw: number;
  readonly slope: number;
  readonly tilt?: number;
  readonly c: string;
}

const CONE = new ConeGeometry(1, 1, 5).translate(0, 0.5, 0);
const ICO = new IcosahedronGeometry(1, 0);
const BOX = new BoxGeometry(1, 1, 1);
const DISC = new CylinderGeometry(1, 1, 1, 10);
const LOG = new CylinderGeometry(1, 1, 1, 9);

const FLAT = new MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
const PAINT = new MeshStandardMaterial({ roughness: 0.7 });
const PUDDLE = new MeshStandardMaterial({ color: '#2c1a0e', roughness: 0.04, metalness: 0.4, envMapIntensity: 1.6 });

interface ScatterProps {
  geometry: BufferGeometry;
  material: Material;
  items: readonly Item[];
  shadow?: boolean;
}

/** One draw call for many static props. */
function Scatter({ geometry, material, items, shadow = false }: ScatterProps) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const dummy = new Object3D();
    dummy.rotation.order = 'ZYX';
    const color = new Color();
    items.forEach((item, i) => {
      dummy.position.set(item.p[0], item.p[1], item.p[2]);
      dummy.rotation.set(item.tilt ?? 0, item.yaw, item.slope);
      dummy.scale.set(item.s[0], item.s[1], item.s[2]);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
      node.setColorAt(i, color.set(item.c));
    });
    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
    node.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return <instancedMesh key={items.length} ref={mesh} args={[geometry, material, items.length]} castShadow={shadow} receiveShadow />;
}

const pick = <T,>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const DEFAULT_LANES: readonly number[] = [LANES.player, LANES.heuristic, LANES.random];
/** Half-width a robot needs clear around its lane centre. */
const LANE_CLEARANCE = 0.72;

/** Z bands between the lanes (and outside them), so big props never sit under a robot. */
function vergesFor(lanes: readonly number[]): Array<readonly [number, number]> {
  const sorted = [...lanes].sort((a, b) => b - a);
  const front = sorted[0]!;
  const back = sorted[sorted.length - 1]!;
  const bands: Array<readonly [number, number]> = [];
  if (LANES.zFront - 0.1 > front + LANE_CLEARANCE) bands.push([front + LANE_CLEARANCE, LANES.zFront - 0.1]);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const mid = (sorted[i]! + sorted[i + 1]!) / 2;
    const half = Math.min(0.18, Math.max(0.04, (sorted[i]! - sorted[i + 1]!) / 2 - LANE_CLEARANCE));
    bands.push([mid - half, mid + half]);
  }
  if (back - LANE_CLEARANCE > LANES.zBack + 0.1) bands.push([LANES.zBack + 0.1, back - LANE_CLEARANCE]);
  return bands;
}

/** Painted lane lines: halfway between neighbouring lanes. */
const lineZs = (lanes: readonly number[]): number[] => {
  const sorted = [...lanes].sort((a, b) => b - a);
  return sorted.slice(0, -1).map((z, i) => (z + sorted[i + 1]!) / 2);
};

interface Dressed {
  readonly tufts: Item[];
  readonly blobs: Item[];
  readonly paint: Item[];
  readonly puddles: Item[];
  readonly trees: Item[];
}

function dress(layout: TrackLayout, lanes: readonly number[]): Dressed {
  const verges = vergesFor(lanes);
  const lines = lineZs(lanes);
  const out: Dressed = { tufts: [], blobs: [], paint: [], puddles: [], trees: [] };
  const { zFront, zBack } = LANES;
  layout.segments.forEach((segment, order) => {
    const rand = mulberry32(order * 977 + 13);
    const length = segment.s1 - segment.s0;
    const at = (s: number, z: number, lift = 0): readonly [number, number, number] => {
      const sample = sampleTrack(layout, s);
      return [sample.x, sample.y + lift, z];
    };
    const anywhere = () => zBack + 0.15 + rand() * (zFront - zBack - 0.3);
    const verge = () => {
      const band = pick(rand, verges);
      return band[0] + rand() * (band[1] - band[0]);
    };
    const gap = segment.gap;
    // Nothing grows or lies over a gap: a pick that lands on the hole moves just past it.
    const along = () => {
      const s = segment.s0 + 0.2 + rand() * (length - 0.4);
      return gap && s > gap.s0 - 0.15 && s < gap.s1 + 0.15 ? Math.min(segment.s1 - 0.1, gap.s1 + 0.15 + rand() * 0.6) : s;
    };
    // Paint stops at the hole too.
    const solid: Array<readonly [number, number]> = gap ? [[segment.s0, gap.s0], [gap.s1, segment.s1]] : [[segment.s0, segment.s1]];
    const slope = segment.slopeRad;
    const terrain = segment.pad ? 'pad' : segment.terrain;

    if (terrain === 'grass') {
      for (let i = 0; i < length * 16; i += 1) {
        const h = 0.1 + rand() * 0.2;
        out.tufts.push({ p: at(along(), anywhere()), s: [0.035 + rand() * 0.03, h, 0.035 + rand() * 0.03], yaw: rand() * 6, slope, tilt: (rand() - 0.5) * 0.5, c: pick(rand, ['#4c9a33', '#6cbc45', '#83cf57', '#3f8a2c']) });
      }
      for (let i = 0; i < length * 0.5; i += 1) {
        out.blobs.push({ p: at(along(), verge(), 0.06), s: [0.05, 0.05, 0.05], yaw: 0, slope, c: pick(rand, ['#ffe066', '#ffffff', '#ff9a4d']) });
      }
    }
    if (terrain === 'sand') {
      for (let i = 0; i < length * 3; i += 1) {
        out.blobs.push({ p: at(along(), anywhere(), -0.02), s: [0.3 + rand() * 0.5, 0.05 + rand() * 0.04, 0.14 + rand() * 0.2], yaw: (rand() - 0.5) * 0.6, slope, c: pick(rand, ['#f2d894', '#dcb96c', '#edcf86']) });
      }
      for (let i = 0; i < length * 0.4; i += 1) {
        out.blobs.push({ p: at(along(), verge(), 0.03), s: [0.07, 0.05, 0.06], yaw: rand() * 6, slope, c: pick(rand, ['#f7efe0', '#c98f6b']) });
      }
    }
    if (terrain === 'mud') {
      for (let i = 0; i < length * 2.2; i += 1) {
        out.blobs.push({ p: at(along(), anywhere(), -0.02), s: [0.14 + rand() * 0.26, 0.05 + rand() * 0.06, 0.12 + rand() * 0.2], yaw: rand() * 6, slope, c: pick(rand, ['#4a2f1c', '#6b4428', '#3a2414']) });
      }
      for (let i = 0; i < length * 0.9; i += 1) {
        const r = 0.2 + rand() * 0.42;
        out.puddles.push({ p: at(along(), anywhere(), 0.006), s: [r, 0.012, r * (0.5 + rand() * 0.4)], yaw: rand() * 3, slope, c: '#ffffff' });
      }
    }
    if (terrain === 'ice') {
      for (let i = 0; i < length * 1.4; i += 1) {
        const h = 0.18 + rand() * 0.5;
        out.blobs.push({ p: at(along(), verge(), h * 0.3), s: [0.07 + rand() * 0.1, h, 0.07 + rand() * 0.1], yaw: rand() * 6, slope, tilt: (rand() - 0.5) * 0.7, c: pick(rand, ['#ecf9ff', '#b9e6fb', '#ffffff']) });
      }
      for (let i = 0; i < length * 2; i += 1) {
        out.blobs.push({ p: at(along(), anywhere(), 0), s: [0.1 + rand() * 0.3, 0.012, 0.03], yaw: rand() * 6, slope, c: '#ffffff' });
      }
    }
    if (terrain === 'rock') {
      for (let i = 0; i < length * 3.2; i += 1) {
        const r = 0.04 + rand() * 0.08;
        out.blobs.push({ p: at(along(), anywhere(), r * 0.4), s: [r * 1.3, r, r * 1.2], yaw: rand() * 6, slope, tilt: rand(), c: pick(rand, ['#6f747c', '#9a9fa8', '#5c6068', '#84807a']) });
      }
      for (let i = 0; i < length * 1.1; i += 1) {
        const r = 0.16 + rand() * 0.26;
        out.blobs.push({ p: at(along(), verge(), r * 0.5), s: [r * 1.2, r, r], yaw: rand() * 6, slope, tilt: rand(), c: pick(rand, ['#737882', '#8f949d', '#5f646c']) });
      }
    }
    if (terrain === 'asphalt' || terrain === 'pad') {
      const paint = terrain === 'pad' ? UI.safety : '#f1f3f5';
      for (const [from, to] of solid) {
        if (to - from < 0.05) continue;
        for (let s = from + 0.6; s < to - 1.0; s += 1.9) {
          for (const z of lines) out.paint.push({ p: at(s + 0.45, z, 0.008), s: [0.9, 0.012, 0.09], yaw: 0, slope, c: paint });
        }
        const mid = (from + to) / 2;
        out.paint.push({ p: at(mid, 1.3, 0.008), s: [to - from, 0.012, 0.1], yaw: 0, slope, c: UI.safety });
        out.paint.push({ p: at(mid, -4.95, 0.008), s: [to - from, 0.012, 0.1], yaw: 0, slope, c: '#f1f3f5' });
      }
    }
    if (terrain === 'water') {
      // Reeds where the water meets dry ground (not where two water segments join).
      const shores = [
        ...(segment.dryIn ? [segment.s0 + 0.25] : []),
        ...(segment.dryOut ? [segment.s1 - 0.65] : []),
      ];
      for (let i = 0; i < 5; i += 1) {
        const z = verge();
        for (const shore of shores) {
          const h = 0.5 + rand() * 0.5;
          out.tufts.push({ p: at(shore + rand() * 0.4, z), s: [0.03, h, 0.03], yaw: 0, slope: 0, tilt: (rand() - 0.5) * 0.3, c: pick(rand, ['#5f8a3a', '#7aa64a']) });
        }
      }
      // Deep water: weed and rocks on the bed.
      if (segment.basin > 1) {
        const onBed = (s: number, z: number, lift = 0) => at(s, z, lift - basinDepthAt(segment, s));
        for (let i = 0; i < length * 1.6; i += 1) {
          out.tufts.push({ p: onBed(along(), anywhere()), s: [0.05, 0.35 + rand() * 0.9, 0.05], yaw: rand() * 6, slope: 0, tilt: (rand() - 0.5) * 0.5, c: pick(rand, ['#2e7d5b', '#3f9a6a', '#256650']) });
        }
        for (let i = 0; i < length * 0.7; i += 1) {
          const r = 0.12 + rand() * 0.24;
          out.blobs.push({ p: onBed(along(), verge(), r * 0.4), s: [r * 1.3, r, r * 1.1], yaw: rand() * 6, slope: 0, tilt: rand(), c: pick(rand, ['#3d4450', '#59606a', '#2e3328']) });
        }
      }
    }

    // Backdrop land: trees, boulders or ice by biome.
    // The ground falls away behind the strip: only treetops and boulders poke above the back edge.
    const count = Math.round((length / 10) * 6);
    for (let i = 0; i < count; i += 1) {
      const z = zBack - 0.9 - rand() * 4;
      const sunk = 1 + (zBack - z) * 0.55;
      const base = at(along(), z, -sunk);
      if (terrain === 'rock' || terrain === 'ice' || terrain === 'sand' || terrain === 'water') {
        const r = 0.5 + rand() * 0.6;
        const c = terrain === 'ice' ? pick(rand, ['#eef8ff', '#c7e6f6']) : terrain === 'rock' ? pick(rand, ['#6f747c', '#8a8f98']) : pick(rand, ['#c9a45e', '#b9925a']);
        out.blobs.push({ p: [base[0], base[1] + sunk - r * 0.5, base[2]], s: [r * 1.3, r * (terrain === 'ice' ? 1.7 : 0.9), r], yaw: rand() * 6, slope: 0, tilt: rand() * 0.6, c });
      } else {
        const h = sunk + 0.35 + rand() * 1.25;
        out.trees.push({ p: base, s: [0.5 + rand() * 0.3, h, 0.5 + rand() * 0.3], yaw: rand() * 6, slope: 0, c: pick(rand, ['#2f7a3a', '#3f8f42', '#27663a', '#4f9a45']) });
      }
    }
  });
  return out;
}

const ROCK_COLORS = ['#6a6f77', '#868b94', '#585c64'] as const;

function ObstacleProp({ layout, segment }: { layout: TrackLayout; segment: LaidSegment }) {
  const hazard = useMemo(() => {
    const texture = hazardTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(1, 14);
    return new MeshStandardMaterial({ map: texture, roughness: 0.7 });
  }, []);
  const kind = segment.obstacle;
  const boulders = useMemo(() => {
    const rand = mulberry32(Math.round(segment.s0 * 31) + 3);
    return Array.from({ length: 9 }, (_, i) => ({
      z: LANES.zBack + 0.5 + (i / 8) * (LANES.zFront - LANES.zBack - 1.2),
      x: (rand() - 0.5) * 0.5,
      r: 0.2 + rand() * 0.16,
      yaw: rand() * 6,
      color: ROCK_COLORS[i % 3]!,
    }));
  }, [segment.s0]);
  if (!kind) return null;
  const sample = sampleTrack(layout, obstacleS(segment));
  // Debris in a water segment lies on the bed, under the surface.
  const bed = basinDepthAt(segment, obstacleS(segment));
  const depth = LANES.zFront - LANES.zBack;
  const midZ = (LANES.zFront + LANES.zBack) / 2;
  const h = OBSTACLE_HEIGHT[kind];
  return (
    <group position={[sample.x, sample.y - bed, 0]} rotation={[0, 0, segment.slopeRad]}>
      {kind === 'step' && (
        <>
          <mesh geometry={BOX} position={[0, h / 2, midZ]} scale={[0.55, h, depth - 0.1]} castShadow receiveShadow>
            <meshStandardMaterial color="#9aa0a8" roughness={0.9} />
          </mesh>
          <mesh geometry={BOX} material={hazard} position={[-0.285, h / 2, midZ]} scale={[0.02, h, depth - 0.1]} />
          <mesh geometry={BOX} material={hazard} position={[0, h / 2, LANES.zFront - 0.04]} scale={[0.56, h, 0.02]} />
        </>
      )}
      {kind === 'log' && (
        <>
          <mesh geometry={LOG} position={[0, h * 0.85, midZ]} rotation={[Math.PI / 2, 0, 0]} scale={[h, depth - 0.2, h]} castShadow receiveShadow>
            <meshStandardMaterial color="#6b4527" roughness={1} flatShading />
          </mesh>
          <mesh geometry={LOG} position={[0, h * 0.85, LANES.zFront - 0.09]} rotation={[Math.PI / 2, 0, 0]} scale={[h * 0.86, 0.03, h * 0.86]}>
            <meshStandardMaterial color="#d9b382" roughness={1} />
          </mesh>
          <mesh geometry={LOG} position={[0, h * 0.85, LANES.zFront - 0.085]} rotation={[Math.PI / 2, 0, 0]} scale={[h * 0.5, 0.03, h * 0.5]}>
            <meshStandardMaterial color="#b98d5c" roughness={1} />
          </mesh>
          <mesh geometry={LOG} position={[0.1, h * 1.5, -1.4]} rotation={[0.4, 0, -0.5]} scale={[0.06, 0.4, 0.06]} castShadow>
            <meshStandardMaterial color="#5a3a20" roughness={1} />
          </mesh>
        </>
      )}
      {kind === 'rock' &&
        boulders.map((boulder) => (
          <mesh key={boulder.z} geometry={ICO} position={[boulder.x, boulder.r * 0.55, boulder.z]} rotation={[boulder.yaw, boulder.yaw, 0]} scale={[boulder.r * 1.25, boulder.r, boulder.r * 1.1]} castShadow receiveShadow>
            <meshStandardMaterial color={boulder.color} roughness={0.9} flatShading />
          </mesh>
        ))}
    </group>
  );
}

function Sign({ text, x, y, width = 2.6, color = '#0f141b', background = UI.safety }: { text: string; x: number; y: number; width?: number; color?: string; background?: string }) {
  const material = useMemo(
    () => new MeshBasicMaterial({ map: labelTexture(text, { color, background, border: '#0f141b' }), transparent: true }),
    [text, color, background],
  );
  const z = LANES.zBack - 0.35;
  const height = width / 4;
  return (
    <group position={[x, y, z]}>
      {[-width * 0.36, width * 0.36].map((offset) => (
        <mesh key={offset} geometry={BOX} position={[offset, 0.9, -0.05]} scale={[0.09, 1.8, 0.09]} castShadow>
          <meshStandardMaterial color="#3a4250" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 1.8 + height / 2, 0]} material={material}>
        <planeGeometry args={[width, height]} />
      </mesh>
    </group>
  );
}

interface DressingProps {
  layout: TrackLayout;
  /** Lane centres (Z). Default: the player and the two ghost lanes. */
  lanes?: readonly number[];
}

/** Everything that sits on the terrain: tufts, stones, paint, obstacles, signs, gates. */
export function Dressing({ layout, lanes = DEFAULT_LANES }: DressingProps) {
  const dressed = useMemo(() => dress(layout, lanes), [layout, lanes]);
  const checker = useMemo(() => {
    const texture = checkerTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(1, 11);
    return new MeshStandardMaterial({ map: texture, roughness: 0.8 });
  }, []);
  const finish = sampleTrack(layout, layout.lengthM);
  const marks = useMemo(() => {
    const list: Array<{ s: number; x: number; y: number }> = [];
    for (let s = 10; s < layout.lengthM - 3; s += 10) {
      const sample = sampleTrack(layout, s);
      list.push({ s, x: sample.x, y: sample.y });
    }
    return list;
  }, [layout]);
  const depth = LANES.zFront - LANES.zBack;
  const midZ = (LANES.zFront + LANES.zBack) / 2;

  return (
    <group dispose={null}>
      <Scatter geometry={CONE} material={FLAT} items={dressed.tufts} />
      <Scatter geometry={ICO} material={FLAT} items={dressed.blobs} shadow />
      <Scatter geometry={BOX} material={PAINT} items={dressed.paint} />
      <Scatter geometry={DISC} material={PUDDLE} items={dressed.puddles} />
      <Scatter geometry={CONE} material={FLAT} items={dressed.trees} />
      {layout.segments.map((segment) => (segment.obstacle ? <ObstacleProp key={segment.s0} layout={layout} segment={segment} /> : null))}

      <mesh geometry={BOX} position={[0, 0.006, midZ]} scale={[0.14, 0.012, depth]}>
        <meshStandardMaterial color="#f1f3f5" roughness={0.7} />
      </mesh>
      <Sign text="START" x={-1.6} y={0} />
      <mesh geometry={BOX} material={checker} position={[finish.x + 0.3, finish.y + 0.007, midZ]} scale={[0.6, 0.012, depth]} />
      <Sign text="FINISH" x={finish.x + 1.9} y={finish.y} background="#f1f3f5" />
      {marks.map((mark) => (
        <Sign key={mark.s} text={`${mark.s} m`} x={mark.x} y={mark.y - 0.9} width={1.3} color="#e6ebf2" background="#1a222d" />
      ))}
    </group>
  );
}
