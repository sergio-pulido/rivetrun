'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { Vector3, type DirectionalLight, type Group, type PerspectiveCamera } from 'three';
import type { Action, Build, GhostTrace, Mission, SimEffect } from '@rivetrun/contracts';
import { TERRAIN_LOOK } from '../palette';
import { clamp, damp, lerp } from '../rng';
import { restDrive, type RobotDrive } from '../robot/drive';
import { RobotModel } from '../robot/RobotModel';
import { layoutTrack, type TrackLayout } from '../track';
import { Particles, type ParticleEmitter } from './Particles';
import { restRide, rideOver, stanceFor } from './ride';
import { EFFECT_PARTICLES, Tag, swimLift } from './shared';
import { World } from './World';

/** One robot of the attract loop: a preset, its recorded run and what the brain chose along the way. */
export interface AttractEntry {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly build: Build;
  readonly trace: GhostTrace;
  readonly decisions: ReadonlyArray<{ readonly t: number; readonly selected: Action }>;
}

/** Replay clock, shared with the DOM legend. `t` is sim time within the current loop. */
export interface AttractClock {
  t: number;
  loop: number;
}

/** Seconds the finish (or the wrecks) stay on screen before the loop restarts. */
const HOLD_S = 4.5;
/** A robot that stopped keeps the camera this long, then the pack moves on without it. */
const LINGER_S = 2.5;

/** Evenly spread lane centres, front to back, with room for the widest robot. */
export function attractLanes(count: number): number[] {
  const front = 0.6;
  const back = -4.2;
  return Array.from({ length: count }, (_, i) => (count === 1 ? front : lerp(front, back, i / (count - 1))));
}

interface Slot {
  x: number;
  y: number;
  /** Sim time the run ended at, or null while it is still going. */
  endedAt: number | null;
}

interface ReplayProps {
  entry: AttractEntry;
  z: number;
  layout: TrackLayout;
  clock: RefObject<AttractClock>;
  slot: Slot;
  speed: number;
  particles: RefObject<ParticleEmitter | null>;
}

/** A full-colour robot replaying a recorded run against the attract clock. No physics, no network. */
function Replay({ entry, z, layout, clock, slot, speed, particles }: ReplayProps) {
  const group = useRef<Group>(null);
  const drive = useRef<RobotDrive>(restDrive());
  const memo = useRef({ frame: 0, decision: 0, swim: 0, celebrated: false, lastT: 0, shown: false });
  const riding = useRef(restRide());
  const stance = useMemo(() => stanceFor(entry.build.locomotion), [entry.build.locomotion]);
  const owed = useRef<Partial<Record<SimEffect, number>>>({});
  const frames = entry.trace.frames;
  const endT = frames[frames.length - 1]?.t ?? 0;

  useFrame(({ clock: wall }, rawDt) => {
    const node = group.current;
    if (!node || frames.length === 0) return;
    const dt = Math.min(rawDt, 0.5);
    const t = clock.current.t;
    const m = memo.current;
    const restarted = t < m.lastT;
    m.lastT = t;
    if (restarted) {
      m.frame = 0;
      m.decision = 0;
      m.celebrated = false;
    }
    while (m.frame < frames.length - 2 && frames[m.frame + 1]!.t <= t) m.frame += 1;
    while (m.decision < entry.decisions.length - 1 && entry.decisions[m.decision + 1]!.t <= t) m.decision += 1;
    const a = frames[m.frame]!;
    const b = frames[Math.min(m.frame + 1, frames.length - 1)]!;
    const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
    const ended = t >= endT;
    const finished = entry.trace.outcome.finished;
    const flying = a.airborne === true && !ended;
    const ride = riding.current;
    const input = {
      nose: lerp(a.x, b.x, k),
      airM: flying ? lerp(a.heightM ?? 0, b.heightM ?? 0, k) : null,
      pitchDeg: flying ? a.pitch : lerp(a.pitch, b.pitch, k),
      slopeDeg: flying ? a.slopeDeg : lerp(a.slopeDeg, b.slopeDeg, k),
    };
    rideOver(layout, stance, input, restarted || !m.shown || Math.abs(input.nose - stance.nose - ride.s) > 3, dt, ride);
    m.shown = true;
    m.swim = damp(m.swim, a.thrusting && !ended ? 1 : 0, 2.5, dt);
    const x = ride.x;
    const y = ride.y + m.swim * swimLift(ride.segment!, ride.s, wall.elapsedTime + z);
    node.position.set(x, y, z);
    node.rotation.z = ride.pitch;
    slot.x = x;
    slot.y = y;
    slot.endedAt = ended ? endT : null;

    const slipping = a.effects.includes('slip') && !ended;
    const wrecked = ended && !finished;
    const d = drive.current;
    d.wheelSpin = ended ? 0 : a.wheelSpin * speed;
    d.speed = a.v;
    d.slip = damp(d.slip, slipping ? 1 : 0, 8, dt);
    d.dnf = wrecked;
    d.winch = a.effects.includes('winch') && !ended;
    d.thrusting = a.thrusting === true && !ended;
    d.airborne = flying;
    d.expression = wrecked ? 'dnf' : ended ? 'finish' : slipping ? 'slip' : (entry.decisions[m.decision]?.selected ?? 'cruise');

    const emitter = particles.current;
    if (!emitter) return;
    if (ended && finished && !m.celebrated) emitter.emit('confetti', x, y + 1.2, z, 60, 1);
    m.celebrated = ended && finished;
    const simDt = Math.min(dt, 0.05) * speed;
    const dir = a.v >= 0 ? 1 : -1;
    const active: readonly SimEffect[] = wrecked ? ['smoke'] : ended ? [] : a.effects;
    for (const effect of active) {
      const spec = EFFECT_PARTICLES[effect];
      if (!spec) continue;
      // Four robots share one pool: each throws a little less than a lone player would.
      const due = (owed.current[effect] ?? 0) + spec.rate * 0.6 * simDt;
      const count = Math.floor(due);
      owed.current[effect] = due - count;
      if (count === 0) continue;
      const px = spec.where === 'rear' ? x - dir * 0.55 : spec.where === 'front' ? x + 0.7 : x - 0.1;
      const py = spec.where === 'top' ? y + 0.8 : effect === 'bubbles' ? y + 0.5 : y + 0.06;
      emitter.emit(spec.kind, px, py, z + (Math.random() < 0.5 ? 0.45 : -0.45), count, dir, effect === 'dust' ? TERRAIN_LOOK[a.terrain].dust : undefined);
    }
  });

  return (
    <group ref={group}>
      <RobotModel build={entry.build} drive={drive} droneAway />
      <Tag text={entry.label} color={entry.color} y={2.05} />
    </group>
  );
}

const ELEVATION = (19 * Math.PI) / 180;

interface RigProps {
  entries: readonly AttractEntry[];
  slots: readonly Slot[];
  clock: RefObject<AttractClock>;
  duration: number;
  speed: number;
  light: RefObject<DirectionalLight | null>;
  timeScale: RefObject<number>;
}

/** Advances the clock, loops it, and keeps the pack that is still racing in frame (landscape first). */
function AttractRig({ entries, slots, clock, duration, speed, light, timeScale }: RigProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const view = useRef({ x: 0, y: 0, width: 12, init: false });
  const target = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.5);
    const c = clock.current;
    c.t += Math.min(rawDt, 0.1) * speed;
    if (c.t > duration + HOLD_S) {
      c.t = 0;
      c.loop += 1;
    }
    timeScale.current = speed;

    // Frame the robots still running, plus any that only just stopped. When all have stopped, frame them all.
    let lo = Infinity;
    let hi = -Infinity;
    let ySum = 0;
    let n = 0;
    const everyoneDone = slots.every((slot) => slot.endedAt !== null);
    slots.forEach((slot, i) => {
      const done = slot.endedAt !== null && c.t - slot.endedAt > LINGER_S;
      const lost = done && !entries[i]!.trace.outcome.finished;
      if ((done && !everyoneDone) || (everyoneDone && lost && slots.some((other, j) => j !== i && entries[j]!.trace.outcome.finished))) return;
      lo = Math.min(lo, slot.x);
      hi = Math.max(hi, slot.x);
      ySum += slot.y;
      n += 1;
    });
    if (n === 0) return;
    const aspect = size.width / Math.max(1, size.height);
    const minWidth = aspect >= 1 ? 12 : 6.5;
    const wantWidth = clamp(hi - lo + (aspect >= 1 ? 8 : 4.5), minWidth, aspect >= 1 ? 30 : 12);
    // Leaders sit right of centre, with open track ahead of them.
    const wantX = lerp(lo, hi, 0.5) + wantWidth * 0.08;
    const v = view.current;
    const jump = !v.init || Math.abs(wantX - v.x) > 14;
    v.x = jump ? wantX : damp(v.x, wantX, 2.2, dt);
    v.y = jump ? ySum / n : damp(v.y, ySum / n, 2, dt);
    v.width = jump ? wantWidth : damp(v.width, wantWidth, 1.4, dt);
    v.init = true;

    const halfV = (camera.fov * Math.PI) / 360;
    const distance = v.width / (2 * Math.tan(halfV) * aspect);
    target.set(v.x, v.y + 0.4 + distance * Math.tan(halfV) * 0.1, -1.8);
    camera.position.set(target.x, target.y + Math.sin(ELEVATION) * distance, target.z + Math.cos(ELEVATION) * distance);
    camera.lookAt(target);

    const sun = light.current;
    if (sun) {
      sun.position.set(v.x + 7, v.y + 13, 9);
      sun.target.position.set(v.x, v.y, -1.8);
      sun.target.updateMatrixWorld();
    }
  });
  return null;
}

export interface AttractSceneProps {
  mission: Mission;
  entries: readonly AttractEntry[];
  /** Mutated every frame; read it from the DOM side for a legend. */
  clock: RefObject<AttractClock>;
  /** Playback rate against sim time. */
  speed?: number;
  particleBudget?: number;
  /** Running late: skip the reflection environment and draw with plain lights. */
  plain?: boolean;
}

/** Attract loop: recorded runs of several builds on one track, side by side on their own lanes. Mount inside a <Canvas>. */
export function AttractScene({ mission, entries, clock, speed = 1, particleBudget = 1, plain = false }: AttractSceneProps) {
  const layout = useMemo(() => layoutTrack(mission.track), [mission.track]);
  const lanes = useMemo(() => attractLanes(entries.length), [entries.length]);
  const slots = useMemo<Slot[]>(() => entries.map(() => ({ x: 0, y: 0, endedAt: null })), [entries]);
  const duration = useMemo(() => Math.max(0, ...entries.map((entry) => entry.trace.frames[entry.trace.frames.length - 1]?.t ?? 0)), [entries]);
  const sun = useRef<DirectionalLight>(null);
  const particles = useRef<ParticleEmitter>(null);
  const timeScale = useRef(speed);

  return (
    <>
      <World layout={layout} weather={mission.weather} sun={sun} budget={particleBudget} shadowSpan={16} lanes={lanes} plain={plain} />
      {entries.map((entry, i) => (
        <Replay key={entry.id} entry={entry} z={lanes[i]!} layout={layout} clock={clock} slot={slots[i]!} speed={speed} particles={particles} />
      ))}
      <Particles ref={particles} timeScale={timeScale} budget={particleBudget} />
      <AttractRig entries={entries} slots={slots} clock={clock} duration={duration} speed={speed} light={sun} timeScale={timeScale} />
    </>
  );
}
