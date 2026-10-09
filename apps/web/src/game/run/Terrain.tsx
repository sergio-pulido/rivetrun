'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, type BufferGeometry, type Mesh } from 'three';
import type { TerrainId } from '@rivetrun/contracts';
import { LANES, TERRAIN_LOOK } from '../palette';
import { floorCuts, floorDepthAt, type LaidSegment, type TrackLayout } from '../track';
import { QuadBuilder, type P2 } from './quads';
import { earthTexture, padTexture, terrainTexture } from './textures';

const CUT_DEPTH = 16;
const LIP = 0.24;
const FILLER_M = 60;
const WATER_DROP = 0.06;
const WATER_TOP = new Color('#49b3e6');
const WATER_DEEP = new Color('#0a3550');
const WALL_TOP = new Color('#1f7088');
const WALL_DEEP = new Color('#0b2c36');
const scratch = new Color();
/** Water gets darker with depth (0 at the surface → fully dark ~3 units down). */
const shade = (top: Color, deep: Color, depth: number): string => `#${scratch.copy(top).lerp(deep, Math.min(1, Math.max(0, depth / 3))).getHexString()}`;

interface Span {
  readonly segment: LaidSegment;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  /** Track-line heights (water level reference). */
  readonly lineA: number;
  readonly lineB: number;
}

/** Splits a segment into straight spans; water gets ramps down into its basin. */
function spansOf(segment: LaidSegment): Span[] {
  const cuts = floorCuts(segment);
  const at = (s: number) => {
    const f = (s - segment.s0) / (segment.s1 - segment.s0);
    const line = segment.y0 + (segment.y1 - segment.y0) * f;
    return { x: segment.x0 + (segment.x1 - segment.x0) * f, line, y: line - floorDepthAt(segment, s) };
  };
  return cuts.slice(0, -1).map((s, i) => {
    const a = at(s);
    const b = at(cuts[i + 1]!);
    return { segment, ax: a.x, ay: a.y, bx: b.x, by: b.y, lineA: a.line, lineB: b.line };
  });
}

interface Built {
  readonly tops: ReadonlyArray<{ key: string; geometry: BufferGeometry; terrain: TerrainId | 'pad' }>;
  readonly cut: BufferGeometry;
  readonly lip: BufferGeometry;
  readonly waterFront: BufferGeometry | null;
  readonly waterWall: BufferGeometry | null;
  readonly waters: readonly LaidSegment[];
}

function buildTerrain(layout: TrackLayout): Built {
  const first = layout.segments[0]!;
  const last = layout.segments[layout.segments.length - 1]!;
  const fillers: LaidSegment[] = [
    { ...first, s0: first.s0 - FILLER_M, s1: first.s0, x0: first.x0 - FILLER_M, x1: first.x0, y1: first.y0 },
    { ...last, s0: last.s1, s1: last.s1 + FILLER_M, x0: last.x1, x1: last.x1 + FILLER_M, y0: last.y1 },
  ];
  const all = [fillers[0]!, ...layout.segments, fillers[1]!];
  const bottom = layout.minY - CUT_DEPTH;
  const { zFront, zBack } = LANES;

  const tops = new Map<string, QuadBuilder>();
  const cut = new QuadBuilder();
  const lip = new QuadBuilder();
  const waterFront = new QuadBuilder();
  const waterWall = new QuadBuilder();

  for (const segment of all) {
    const key = segment.pad ? 'pad' : segment.terrain;
    const top = tops.get(key) ?? new QuadBuilder();
    tops.set(key, top);
    const look = TERRAIN_LOOK[segment.terrain];
    const lipColor = segment.pad ? '#565b64' : look.lip;
    for (const span of spansOf(segment)) {
      const { ax, ay, bx, by } = span;
      const uvTop: [P2, P2, P2, P2] = [[ax / 3, zFront / 3], [bx / 3, zFront / 3], [bx / 3, zBack / 3], [ax / 3, zBack / 3]];
      top.quad([ax, ay, zFront], [bx, by, zFront], [bx, by, zBack], [ax, ay, zBack], uvTop);
      cut.quad(
        [ax, bottom, zFront], [bx, bottom, zFront], [bx, by, zFront], [ax, ay, zFront],
        [[ax / 4, bottom / 4], [bx / 4, bottom / 4], [bx / 4, by / 4], [ax / 4, ay / 4]],
      );
      lip.quad(
        [ax, ay - LIP, zFront + 0.015], [bx, by - LIP, zFront + 0.015], [bx, by, zFront + 0.015], [ax, ay, zFront + 0.015],
        undefined,
        [lipColor, lipColor, lipColor, lipColor],
      );
      if (segment.gap && (span.lineA - ay > 0.01 || span.lineB - by > 0.01)) {
        // Far wall of a gap's pit: dark earth, so the hole never shows the sky through it.
        waterWall.quad(
          [ax, ay, zBack + 0.01], [bx, by, zBack + 0.01], [bx, span.lineB, zBack + 0.01], [ax, span.lineA, zBack + 0.01],
          undefined,
          ['#17100b', '#17100b', '#3a2a1d', '#3a2a1d'],
        );
      }
      if (segment.basin > 0) {
        const surfaceA = span.lineA - WATER_DROP;
        const surfaceB = span.lineB - WATER_DROP;
        const depthA = surfaceA - ay;
        const depthB = surfaceB - by;
        // Aquarium cut: the water column seen from the side, darker towards the bed.
        waterFront.quad(
          [ax, ay, zFront + 0.03], [bx, by, zFront + 0.03], [bx, surfaceB, zFront + 0.03], [ax, surfaceA, zFront + 0.03],
          undefined,
          [shade(WATER_TOP, WATER_DEEP, depthA), shade(WATER_TOP, WATER_DEEP, depthB), shade(WATER_TOP, WATER_DEEP, 0), shade(WATER_TOP, WATER_DEEP, 0)],
        );
        // Far wall of the basin, so deep water never shows the sky behind it.
        waterWall.quad(
          [ax, ay, zBack + 0.01], [bx, by, zBack + 0.01], [bx, surfaceB, zBack + 0.01], [ax, surfaceA, zBack + 0.01],
          undefined,
          [shade(WALL_TOP, WALL_DEEP, depthA), shade(WALL_TOP, WALL_DEEP, depthB), shade(WALL_TOP, WALL_DEEP, 0), shade(WALL_TOP, WALL_DEEP, 0)],
        );
        // Bright surface line along the cut.
        const foam = '#c9f3f8';
        lip.quad(
          [ax, surfaceA - 0.05, zFront + 0.045], [bx, surfaceB - 0.05, zFront + 0.045], [bx, surfaceB + 0.02, zFront + 0.045], [ax, surfaceA + 0.02, zFront + 0.045],
          undefined,
          [foam, foam, foam, foam],
        );
      }
    }
  }

  return {
    tops: [...tops.entries()].map(([key, builder]) => ({ key, geometry: builder.build(), terrain: key as TerrainId | 'pad' })),
    cut: cut.build(),
    lip: lip.build(),
    waterFront: waterFront.empty ? null : waterFront.build(),
    waterWall: waterWall.empty ? null : waterWall.build(),
    waters: layout.segments.filter((segment) => segment.basin > 0),
  };
}

function topMaterial(terrain: TerrainId | 'pad'): MeshStandardMaterial {
  if (terrain === 'pad') return new MeshStandardMaterial({ map: padTexture(), roughness: 0.9 });
  const look = TERRAIN_LOOK[terrain];
  const wet = terrain === 'water';
  return new MeshStandardMaterial({
    map: terrainTexture(terrain),
    roughness: wet ? 1 : look.roughness,
    metalness: wet ? 0 : look.metalness,
    envMapIntensity: terrain === 'ice' ? 1.6 : terrain === 'mud' ? 1.1 : 0.5,
  });
}

/** Low-poly animated water sheet over a basin. */
function WaterSheet({ segment }: { segment: LaidSegment }) {
  const mesh = useRef<Mesh>(null);
  const depth = LANES.zFront - LANES.zBack;
  const length = segment.s1 - segment.s0;
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(length, depth, Math.max(4, Math.round(length * 1.6)), 9);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, [length, depth]);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#3aa5ee', roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.7, flatShading: true, envMapIntensity: 1.5 }),
    [],
  );
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const position = geometry.attributes.position!;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setY(i, Math.sin(x * 2.3 + t * 2.1) * 0.03 + Math.sin(z * 2.9 - t * 1.6 + x) * 0.025);
    }
    position.needsUpdate = true;
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      position={[(segment.x0 + segment.x1) / 2, (segment.y0 + segment.y1) / 2 - WATER_DROP, (LANES.zFront + LANES.zBack) / 2]}
      rotation={[0, 0, segment.slopeRad]}
      receiveShadow
    />
  );
}

interface TerrainProps {
  layout: TrackLayout;
}

/** The track strip: textured tops per terrain, soil cut face, lip, land behind, water. */
export function Terrain({ layout }: TerrainProps) {
  const built = useMemo(() => buildTerrain(layout), [layout]);
  const materials = useMemo(
    () => ({
      tops: new Map(built.tops.map((top) => [top.key, topMaterial(top.terrain)])),
      cut: new MeshStandardMaterial({ map: earthTexture(), roughness: 1 }),
      lip: new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      waterFront: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.48, depthWrite: false }),
      waterWall: new MeshBasicMaterial({ vertexColors: true }),
    }),
    [built],
  );

  useEffect(
    () => () => {
      built.tops.forEach((top) => top.geometry.dispose());
      [built.cut, built.lip, built.waterFront, built.waterWall].forEach((geometry) => geometry?.dispose());
      materials.tops.forEach((material) => material.dispose());
      [materials.cut, materials.lip, materials.waterFront, materials.waterWall].forEach((material) => material.dispose());
    },
    [built, materials],
  );

  return (
    <group dispose={null}>
      {built.tops.map((top) => (
        <mesh key={top.key} geometry={top.geometry} material={materials.tops.get(top.key)} receiveShadow />
      ))}
      <mesh geometry={built.cut} material={materials.cut} />
      <mesh geometry={built.lip} material={materials.lip} />
      {built.waterWall && <mesh geometry={built.waterWall} material={materials.waterWall} />}
      {built.waterFront && <mesh geometry={built.waterFront} material={materials.waterFront} renderOrder={4} />}
      {built.waters.map((segment) => (
        <WaterSheet key={segment.s0} segment={segment} />
      ))}
    </group>
  );
}
