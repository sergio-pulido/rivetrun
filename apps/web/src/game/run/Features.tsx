'use client';

import { useEffect, useMemo } from 'react';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import { LANES, UI } from '../palette';
import { sampleTrack, type Incline, type TrackLayout } from '../track';
import { QuadBuilder } from './quads';
import { hazardTexture } from './textures';

const BOX = new BoxGeometry(1, 1, 1);
const PLATE = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });

/** A wedge across every lane: incline from the ground at x = 0 up to `rise` at x = length, with a sheer face behind the lip. */
function wedgeGeometry(length: number, rise: number, kind: Incline['kind']) {
  const { zFront, zBack } = LANES;
  const zf = zFront - 0.06;
  const zb = zBack + 0.06;
  const top = kind === 'ramp' ? '#8d95a0' : '#9aa0a8';
  const side = kind === 'ramp' ? '#f6c51c' : '#6f757d';
  const lip = UI.safety;
  const lipFrom = Math.max(0, length - 0.22);
  const lipY = rise * (lipFrom / length);
  return new QuadBuilder()
    .quad([0, 0, zf], [lipFrom, lipY, zf], [lipFrom, lipY, zb], [0, 0, zb], undefined, [top, top, top, top])
    // The launch edge is painted so the lip reads at speed.
    .quad([lipFrom, lipY, zf], [length, rise, zf], [length, rise, zb], [lipFrom, lipY, zb], undefined, [lip, lip, lip, lip])
    .quad([0, 0, zf], [length, 0, zf], [length, rise, zf], [length, rise, zf], undefined, [side, side, side, side])
    .quad([length, 0, zf], [length, 0, zb], [length, rise, zb], [length, rise, zf], undefined, ['#4a5059', '#4a5059', '#6b727c', '#6b727c'])
    .build();
}

function Wedge({ layout, incline }: { layout: TrackLayout; incline: Incline }) {
  const length = incline.s1 - incline.s0;
  const geometry = useMemo(() => wedgeGeometry(length, incline.rise, incline.kind), [length, incline.rise, incline.kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const base = sampleTrack(layout, incline.s0 + 0.001);
  return <mesh geometry={geometry} material={PLATE} position={[base.x, base.y + 0.005, 0]} rotation={[0, 0, base.slopeRad]} castShadow receiveShadow />;
}

interface FeaturesProps {
  layout: TrackLayout;
}

/** Height features (gameplay v2): kicker ramps, the ledge of a drop, and hazard edges around gaps. */
export function Features({ layout }: FeaturesProps) {
  const hazard = useMemo(() => {
    const texture = hazardTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(1, 14);
    return new MeshStandardMaterial({ map: texture, roughness: 0.7 });
  }, []);
  const depth = LANES.zFront - LANES.zBack;
  const midZ = (LANES.zFront + LANES.zBack) / 2;
  return (
    <group dispose={null}>
      {layout.inclines.map((incline) => (
        <Wedge key={`${incline.kind}${incline.s0}`} layout={layout} incline={incline} />
      ))}
      {layout.gaps.flatMap((gap) =>
        [gap.s0 - 0.09, gap.s1 + 0.09].map((s) => {
          const edge = sampleTrack(layout, s);
          return <mesh key={s} geometry={BOX} material={hazard} position={[edge.x, edge.y + 0.012, midZ]} scale={[0.16, 0.024, depth - 0.1]} />;
        }),
      )}
    </group>
  );
}
