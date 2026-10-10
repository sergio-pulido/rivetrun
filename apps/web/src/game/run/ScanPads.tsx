'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry, MeshBasicMaterial, type Mesh } from 'three';
import type { Build, Mission } from '@rivetrun/contracts';
import { PARTS_BY_ID, SCAN_RULES } from '@rivetrun/sim';
import { LANES, UI } from '../palette';
import type { RunFeed } from '../runFeed';
import { sampleTrack, type TrackLayout } from '../track';
import { mk2Requested } from '../robot/mk2/flag';
import { stanceFor } from './ride';
import { Tag } from './shared';

type Zone = NonNullable<Mission['scanZones']>[number];
type Status = 'open' | 'locked' | 'done' | 'missed';

const BOX = new BoxGeometry(1, 1, 1);
const COLOR: Readonly<Record<Status, string>> = { open: UI.cyan, locked: '#7a828c', done: UI.ok, missed: UI.bad };
const EDGE = 0.07;

interface PadProps {
  layout: TrackLayout;
  zone: Zone;
  status: Status;
  /** From the middle of the robot to its nose: the sim measures the stop at the nose, the pad is drawn under the body. */
  nose: number;
  feed: RunFeed;
}

/**
 * One scan zone as a pad across the lanes. It is as long as the stop the sim accepts plus one robot,
 * and sits behind the zone's centre by that robot: a robot standing wholly on the pad is in the zone.
 */
function Pad({ layout, zone, status, nose, feed }: PadProps) {
  const fill = useRef<Mesh>(null);
  const reach = zone.halfLengthM + SCAN_RULES.reachM;
  const from = zone.atM - reach - nose * 2;
  const to = zone.atM + reach;
  const length = to - from;
  const at = sampleTrack(layout, (from + to) / 2);
  const color = COLOR[status];
  const material = useMemo(() => new MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, fog: false }), [color]);
  const edge = useMemo(() => new MeshBasicMaterial({ color, fog: false }), [color]);
  useEffect(
    () => () => {
      material.dispose();
      edge.dispose();
    },
    [material, edge],
  );
  const depth = LANES.zFront - LANES.zBack - 0.1;
  const midZ = (LANES.zFront + LANES.zBack) / 2;

  // The pad fills with light while this zone's 1.5 s hold runs.
  useFrame(({ clock }) => {
    const scan = feed.get().state?.scan;
    const progress = scan && scan.zoneId === zone.id ? scan.progress : 0;
    material.opacity = status === 'open' ? 0.2 + progress * 0.5 + (progress > 0 ? 0 : Math.sin(clock.elapsedTime * 3) * 0.05) : status === 'done' ? 0.3 : 0.12;
  });

  const label = status === 'locked' ? `NO SENSOR · ${zone.label.toUpperCase()}` : status === 'done' ? `SCANNED · ${zone.label.toUpperCase()}` : status === 'missed' ? `MISSED · ${zone.label.toUpperCase()}` : `SCAN · ${zone.label.toUpperCase()}`;
  return (
    <group position={[at.x, at.y, 0]} rotation={[0, 0, at.slopeRad]}>
      <mesh ref={fill} geometry={BOX} material={material} position={[0, 0.016, midZ]} scale={[length, 0.012, depth]} renderOrder={1} />
      {[-1, 1].map((side) => (
        <mesh key={`x${side}`} geometry={BOX} material={edge} position={[(side * (length - EDGE)) / 2, 0.02, midZ]} scale={[EDGE, 0.016, depth]} />
      ))}
      {[LANES.zFront - 0.05 - EDGE / 2, LANES.zBack + 0.05 + EDGE / 2].map((z) => (
        <mesh key={`z${z}`} geometry={BOX} material={edge} position={[0, 0.02, z]} scale={[length, 0.016, EDGE]} />
      ))}
      <group position={[0, 0, LANES.zBack - 0.1]}>
        <Tag text={label} color={color} y={1.25} />
      </group>
    </group>
  );
}

interface ScanPadsProps {
  layout: TrackLayout;
  zones: readonly Zone[];
  build: Build;
  feed: RunFeed;
}

/** Scan zones (gameplay v3): where to stop. Cyan = this build can scan it, grey = it lacks the sensor, green / red once done or missed. */
export function ScanPads({ layout, zones, build, feed }: ScanPadsProps) {
  const nose = useMemo(() => stanceFor(build.locomotion, mk2Requested('run')).nose, [build.locomotion]);
  const kinds = useMemo(() => new Set(build.sensors.map((id) => PARTS_BY_ID.get(id)?.effects.sensor)), [build.sensors]);
  // Done and missed come with the robot's Observation (5 Hz): repaint only when one of them changes.
  const [seen, setSeen] = useState('');
  useEffect(() => {
    const read = (): void => {
      const reported = feed.get().observation?.value.scanZones ?? [];
      setSeen(reported.map((zone) => `${zone.id}:${zone.done ? 'd' : zone.missed ? 'm' : ''}`).join('|'));
    };
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, [feed]);
  const state = useMemo(() => new Map(seen.split('|').map((entry) => entry.split(':') as [string, string])), [seen]);
  return (
    <group dispose={null}>
      {zones.map((zone) => {
        const flag = state.get(zone.id);
        const status: Status = flag === 'd' ? 'done' : flag === 'm' ? 'missed' : zone.needs.some((need) => kinds.has(need)) ? 'open' : 'locked';
        return <Pad key={zone.id} layout={layout} zone={zone} status={status} nose={nose} feed={feed} />;
      })}
    </group>
  );
}
