'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, MeshBasicMaterial, SRGBColorSpace, type Group, type Mesh } from 'three';
import { LANES, UI } from '../palette';
import type { RunFeed } from '../runFeed';
import { senseLabel, type Senses } from '../sense';
import { groundRise, sampleTrack, type TrackLayout } from '../track';
import type { Pose } from './pose';
import { Tag } from './shared';

const SLICES = 30;
const HALF_WIDTH = 0.66;
/** A blind robot gets a short hatched stub: this is all it "knows" ahead. */
const BLIND_STUB_M = 1.1;
/** The label rides this far ahead of the nose at most, so it stays in view when the range is longer than the screen. */
const LABEL_AHEAD_M = 2.1;
const LIFT = 0.035;

/** Along the band: bright at the nose, fading to its far edge, with a line where each sensor's range ends. */
function bandTexture(senses: Senses): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (senses.blind) {
      ctx.fillStyle = 'rgba(248, 81, 74, 0.2)';
      ctx.fillRect(0, 0, 256, 16);
      ctx.strokeStyle = 'rgba(248, 81, 74, 0.85)';
      ctx.lineWidth = 5;
      for (let x = -16; x < 272; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x + 18, -2);
        ctx.stroke();
      }
    } else {
      const fade = ctx.createLinearGradient(0, 0, 256, 0);
      fade.addColorStop(0, 'rgba(63, 208, 224, 0.4)');
      fade.addColorStop(1, 'rgba(63, 208, 224, 0.1)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, 256, 16);
      ctx.fillStyle = 'rgba(190, 244, 250, 0.9)';
      for (const range of senses.ranges) ctx.fillRect(Math.min(252, (range.rangeM / senses.forwardM) * 256 - 4), 0, 4, 16);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

interface SenseBandProps {
  layout: TrackLayout;
  pose: RefObject<Pose>;
  feed: RunFeed;
  senses: Senses;
}

/**
 * What the robot can sense, drawn on its lane: a band from its nose to the reach of its longest
 * forward sensor, with a line at each sensor's range. A build with no forward sensor gets a short
 * red hatched stub marked BLIND (docs/BRAIN_V3_SENSING.md).
 */
export function SenseBand({ layout, pose, feed, senses }: SenseBandProps) {
  const mesh = useRef<Mesh>(null);
  const label = useRef<Group>(null);
  // What the build can reach on paper; weather can shorten it (fog, night, rain), and then the sim's Observation says by how much.
  const [observed, setObserved] = useState<number | null>(null);
  const reach = useRef(senses.blind ? BLIND_STUB_M : senses.forwardM);
  const blind = observed === null ? senses.blind : observed <= 0;
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const uv = new Float32Array((SLICES + 1) * 4);
    const index: number[] = [];
    for (let i = 0; i <= SLICES; i += 1) {
      uv.set([i / SLICES, 0, i / SLICES, 1], i * 4);
      if (i < SLICES) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array((SLICES + 1) * 6), 3));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setIndex(index);
    return g;
  }, []);
  const material = useMemo(
    () => new MeshBasicMaterial({ map: bandTexture(senses), transparent: true, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false }),
    [senses],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );

  useFrame(() => {
    const node = mesh.current;
    const tag = label.current;
    if (!node || !tag) return;
    const p = pose.current;
    const shown = p.ready && !feed.get().done;
    node.visible = shown;
    tag.visible = shown;
    if (!shown) return;
    const seen = feed.get().observation?.value;
    if (seen) {
      const range = seen.blind ? 0 : Math.round(seen.forwardRangeM * 2) / 2;
      if (range !== observed) setObserved(range);
    }
    const length = observed === null ? reach.current : observed > 0 ? observed : BLIND_STUB_M;
    const position = geometry.getAttribute('position') as BufferAttribute;
    // The sim's x is the nose: sensing starts there.
    for (let i = 0; i <= SLICES; i += 1) {
      const s = p.s + (length * i) / SLICES;
      const at = sampleTrack(layout, s);
      const y = at.y + groundRise(layout, s) + LIFT;
      position.setXYZ(i * 2, at.x, y, LANES.player + HALF_WIDTH);
      position.setXYZ(i * 2 + 1, at.x, y, LANES.player - HALF_WIDTH);
    }
    position.needsUpdate = true;
    const s = p.s + Math.min(length, LABEL_AHEAD_M);
    const at = sampleTrack(layout, s);
    tag.position.set(at.x, at.y + groundRise(layout, s), LANES.player + HALF_WIDTH + 0.5);
  });

  return (
    <>
      <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} visible={false} />
      <group ref={label} visible={false}>
        <Tag text={blind ? 'BLIND' : observed !== null && Math.abs(observed - senses.forwardM) > 0.25 ? `SENSES ${observed} m` : senseLabel(senses)} color={blind ? UI.bad : UI.cyan} y={0.3} />
      </group>
    </>
  );
}
