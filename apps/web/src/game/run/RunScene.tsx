'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { Vector3, type DirectionalLight, type Group, type PerspectiveCamera } from 'three';
import type { Build, GhostTrace, Mission, Policy, SimEffect } from '@rivetrun/contracts';
import { TUNING } from '@rivetrun/sim';
import { LANES, POLICY_LABEL, POLICY_TINT, TERRAIN_LOOK, UI, laneZ } from '../palette';
import { clamp, damp, lerp } from '../rng';
import { restDrive, type Expression, type RobotDrive } from '../robot/drive';
import { RobotModel } from '../robot/RobotModel';
import type { RunFeed } from '../runFeed';
import { basinDepthAt, layoutTrack, rideOffset, sampleTrack, type TrackLayout } from '../track';
import { Particles, type ParticleEmitter } from './Particles';
import { restPose, type Pose } from './pose';
import { ScoutDroneRig } from './ScoutDroneRig';
import { EFFECT_PARTICLES, Tag, swimLift } from './shared';
import { World } from './World';

const SIM_DT = TUNING.dtMs / 1000;

interface PlayerProps {
  feed: RunFeed;
  build: Build;
  layout: TrackLayout;
  pose: RefObject<Pose>;
  timeScale: RefObject<number>;
  particles: RefObject<ParticleEmitter | null>;
}

function Player({ feed, build, layout, pose, timeScale, particles }: PlayerProps) {
  const group = useRef<Group>(null);
  const drive = useRef<RobotDrive>(restDrive());
  const pitch = useRef(0);
  const budget = useRef<Partial<Record<SimEffect, number>>>({});
  const lastDamageAt = useRef(0);
  const celebrated = useRef(false);
  const swim = useRef(0);

  useFrame(({ clock }, rawDt) => {
    // Unclamped (up to 0.5 s): easing must keep up with the sim even when frames are slow.
    const dt = Math.min(rawDt, 0.5);
    const view = feed.get();
    const state = view.state;
    const node = group.current;
    if (!node) return;
    if (!state) {
      pose.current.ready = false;
      node.visible = false;
      return;
    }
    const now = performance.now();
    const scale = view.done ? 0 : view.pending ? TUNING.decision.slowMoFactor : 1;
    timeScale.current = damp(timeScale.current ?? 1, view.done ? 1 : scale, 10, dt);
    // The sim ticks at 20 Hz (5 Hz in slow-mo): extrapolate one tick, then ease.
    const ahead = Math.min(((now - view.stateAt) / 1000) * scale, SIM_DT);
    const target = state.x + state.v * ahead;
    const p = pose.current;
    const jump = !p.ready || Math.abs(target - p.s) > 3;
    p.s = jump ? target : damp(p.s, target, 22, dt);
    p.t = state.t + ahead;
    p.v = state.v;
    p.thinking = view.pending !== null;
    const sample = sampleTrack(layout, p.s);
    p.x = sample.x;
    swim.current = damp(swim.current, state.thrusting ? 1 : 0, 2.5, dt);
    p.y = sample.y + rideOffset(sample.segment, p.s) + swim.current * swimLift(sample.segment, p.s, clock.elapsedTime);
    p.ready = true;

    const hop = (rideOffset(sample.segment, p.s + 0.25) - rideOffset(sample.segment, p.s - 0.25)) * 1.1;
    const wanted = (state.pitch * Math.PI) / 180 + clamp(hop, -0.45, 0.45);
    pitch.current = jump ? wanted : damp(pitch.current, wanted, 9, dt);
    node.visible = true;
    node.position.set(p.x, p.y, LANES.player);
    node.rotation.z = pitch.current;

    const slipping = state.effects.includes('slip');
    const wrecked = view.dnfReason !== null;
    if (view.lastDamage && view.lastDamage.at !== lastDamageAt.current) {
      lastDamageAt.current = view.lastDamage.at;
      p.shakeUntil = now + 380;
      particles.current?.emit('sparks', p.x + 0.7, p.y + 0.3, LANES.player, 26, 1);
    }
    const won = view.done && !wrecked;
    if (won && !celebrated.current) particles.current?.emit('confetti', p.x, p.y + 1.2, LANES.player, 90, 1);
    celebrated.current = won;
    const hurt = view.lastDamage !== null && now - view.lastDamage.at < 650;
    const expression: Expression = wrecked
      ? 'dnf'
      : view.done
        ? 'finish'
        : hurt
          ? 'hurt'
          : view.pending
            ? 'thinking'
            : slipping
              ? 'slip'
              : (view.decision?.decision.selected ?? 'idle');
    const d = drive.current;
    d.wheelSpin = view.done ? 0 : state.wheelSpin * (timeScale.current ?? 1);
    d.speed = state.v;
    d.slip = damp(d.slip, slipping && !view.done ? 1 : 0, 8, dt);
    d.expression = expression;
    d.dnf = wrecked;
    d.winch = state.effects.includes('winch') && !view.done;
    d.thrusting = state.thrusting === true && !view.done;

    const emitter = particles.current;
    if (!emitter) return;
    const dir = state.v >= 0 ? 1 : -1;
    const simDt = Math.min(dt, 0.05) * (timeScale.current ?? 1);
    const active: SimEffect[] = wrecked ? ['smoke'] : view.done ? [] : state.effects;
    for (const effect of active) {
      const spec = EFFECT_PARTICLES[effect];
      if (!spec) continue;
      const owed = (budget.current[effect] ?? 0) + spec.rate * simDt * (spec.where === 'rear' ? clamp(Math.abs(state.wheelSpin) / 5, 0.4, 1.6) : 1);
      const count = Math.floor(owed);
      budget.current[effect] = owed - count;
      if (count === 0) continue;
      const x = spec.where === 'rear' ? p.x - dir * 0.55 : spec.where === 'front' ? p.x + 0.7 : p.x - 0.1;
      const y = spec.where === 'top' ? p.y + 0.8 : effect === 'bubbles' ? p.y + 0.5 : p.y + 0.06;
      const color = effect === 'dust' ? TERRAIN_LOOK[state.terrain].dust : undefined;
      emitter.emit(spec.kind, x, y, LANES.player + (Math.random() < 0.5 ? 0.5 : -0.5), count, dir, color);
    }
    // A current: specks streaming past the robot through the water column.
    if ((state.waterCurrentMps ?? 0) > 0 && !view.done && Math.random() < simDt * 22 * (state.waterCurrentMps ?? 0)) {
      const column = basinDepthAt(sample.segment, p.s);
      emitter.emit('current', p.x + 1 + Math.random() * 3.5, sample.y - Math.random() * column * 0.9, LANES.zFront - Math.random() * 3, 1, 1);
    }
    // A little kick-up even when the sim reports no effect, so fast driving reads as fast.
    if (active.length === 0 && Math.abs(state.v) > 1.4 && !view.done && Math.random() < simDt * 9) {
      emitter.emit('dust', p.x - dir * 0.55, p.y + 0.05, LANES.player, 1, dir, TERRAIN_LOOK[state.terrain].dust);
    }
  });

  return (
    <group ref={group} visible={false}>
      <RobotModel build={build} drive={drive} droneAway />
      <Tag text={POLICY_LABEL.jev} color={UI.safety} y={1.95} />
    </group>
  );
}

interface GhostProps {
  trace: GhostTrace;
  build: Build;
  layout: TrackLayout;
  pose: RefObject<Pose>;
  timeScale: RefObject<number>;
}

/** A translucent robot replaying a recorded headless run against sim time. */
function Ghost({ trace, build, layout, pose, timeScale }: GhostProps) {
  const group = useRef<Group>(null);
  const drive = useRef<RobotDrive>(restDrive());
  const cursor = useRef(0);
  const pitch = useRef(0);
  const swim = useRef(0);
  const policy: Policy = trace.policy;
  const z = laneZ(policy);

  useFrame(({ clock }, rawDt) => {
    const node = group.current;
    const frames = trace.frames;
    if (!node) return;
    const first = frames[0];
    if (!pose.current.ready || !first) {
      node.visible = false;
      return;
    }
    const t = pose.current.t;
    if (cursor.current >= frames.length || frames[cursor.current]!.t > t) cursor.current = 0;
    while (cursor.current < frames.length - 2 && frames[cursor.current + 1]!.t <= t) cursor.current += 1;
    const a = frames[cursor.current]!;
    const b = frames[Math.min(cursor.current + 1, frames.length - 1)]!;
    const span = b.t - a.t;
    const k = span > 0 ? clamp((t - a.t) / span, 0, 1) : 1;
    const ended = t >= frames[frames.length - 1]!.t;
    const s = lerp(a.x, b.x, k);
    const sample = sampleTrack(layout, s);
    const wanted = (lerp(a.pitch, b.pitch, k) * Math.PI) / 180;
    pitch.current = damp(pitch.current, wanted, 9, Math.min(rawDt, 0.5));
    node.visible = true;
    swim.current = damp(swim.current, a.thrusting ? 1 : 0, 2.5, Math.min(rawDt, 0.5));
    node.position.set(sample.x, sample.y + rideOffset(sample.segment, s) + swim.current * swimLift(sample.segment, s, clock.elapsedTime + 1.3), z);
    node.rotation.z = pitch.current;
    const d = drive.current;
    const slipping = a.effects.includes('slip');
    d.wheelSpin = ended ? 0 : a.wheelSpin * (timeScale.current ?? 1);
    d.speed = a.v;
    d.slip = slipping && !ended ? 1 : 0;
    d.dnf = ended && !trace.outcome.finished;
    d.expression = d.dnf ? 'dnf' : ended ? 'finish' : slipping ? 'slip' : 'cruise';
    d.winch = false;
    d.thrusting = a.thrusting === true && !ended;
  });

  return (
    <group ref={group} visible={false}>
      <RobotModel build={build} drive={drive} ghostTint={POLICY_TINT[policy]} droneAway />
      <Tag text={POLICY_LABEL[policy]} color={POLICY_TINT[policy]} y={2.05} />
    </group>
  );
}

const VIEW_WIDTH_M = 5.7;
/** With a scout drone the view opens up so the drone and its scan cone stay in frame. */
const VIEW_WIDTH_DRONE_M = 6.7;
const MIN_VIEW_HEIGHT_M = 8.5;
const ELEVATION = (15 * Math.PI) / 180;

interface RigProps {
  pose: RefObject<Pose>;
  light: RefObject<DirectionalLight | null>;
  startX: number;
  /** Frame the scout drone ahead of the robot too. */
  wide: boolean;
}

/** Side-on follow camera, framed for portrait, with decision zoom and impact shake. */
function CameraRig({ pose, light, startX, wide }: RigProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const focus = useRef({ x: startX, y: 0, zoom: 1, init: false });
  const target = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.5);
    const p = pose.current;
    const f = focus.current;
    const aspect = size.width / Math.max(1, size.height);
    const portrait = aspect < 1;
    const leadX = (p.ready ? p.x : startX) + (portrait ? (wide ? 1.35 : 0.75) : 2.4) + clamp(p.v * 0.25, -0.5, 0.9);
    const leadY = p.ready ? p.y : 0;
    if (!f.init) {
      f.x = leadX;
      f.y = leadY;
      f.init = true;
    }
    f.x = Math.abs(leadX - f.x) > 6 ? leadX : damp(f.x, leadX, 6, dt);
    f.y = damp(f.y, leadY, 3.2, dt);
    f.zoom = damp(f.zoom, p.thinking ? 0.86 : 1, 5, dt);

    const halfV = (camera.fov * Math.PI) / 360;
    const byWidth = (wide ? VIEW_WIDTH_DRONE_M : VIEW_WIDTH_M) / (2 * Math.tan(halfV) * aspect);
    const byHeight = MIN_VIEW_HEIGHT_M / (2 * Math.tan(halfV));
    const distance = Math.max(byWidth, byHeight) * f.zoom;
    // In portrait the Brain sheet covers the lower ~42 %: the robot sits in the clear band above it.
    const lift = distance * Math.tan(halfV) * (portrait ? 0.2 : -0.12);
    const shake = performance.now() < p.shakeUntil ? 0.09 : 0;
    target.set(f.x + (Math.random() - 0.5) * shake, f.y + 0.75 - lift + (Math.random() - 0.5) * shake, -1);
    camera.position.set(target.x, target.y + Math.sin(ELEVATION) * distance, target.z + Math.cos(ELEVATION) * distance);
    camera.lookAt(target);

    const sun = light.current;
    if (sun) {
      sun.position.set(f.x + 7, f.y + 13, 9);
      sun.target.position.set(f.x, f.y, -1.5);
      sun.target.updateMatrixWorld();
    }
  });
  return null;
}

export interface RunSceneProps {
  mission: Mission;
  build: Build;
  /** Fed by the sim: `runController(config, brain, { onEvent: feed.push })`. */
  feed: RunFeed;
  /** Brain Duel traces (HEURISTIC, RANDOM), each on its own lane. */
  ghosts?: readonly GhostTrace[];
  /** 0–1: particle and weather budget (0.5 on weak devices). */
  particleBudget?: number;
}

/** The 2.5D run view. Mount inside an R3F <Canvas>. Reads sim state only: no physics here. */
export function RunScene({ mission, build, feed, ghosts = [], particleBudget = 1 }: RunSceneProps) {
  const layout = useMemo(() => layoutTrack(mission.track), [mission.track]);
  const pose = useRef<Pose>(restPose());
  const hasDrone = build.sensors.includes('scout_drone');
  const timeScale = useRef(1);
  const particles = useRef<ParticleEmitter>(null);
  const sun = useRef<DirectionalLight>(null);
  return (
    <>
      <World layout={layout} weather={mission.weather} sun={sun} budget={particleBudget} />

      {ghosts.map((trace) => (
        <Ghost key={trace.policy} trace={trace} build={build} layout={layout} pose={pose} timeScale={timeScale} />
      ))}
      <Player feed={feed} build={build} layout={layout} pose={pose} timeScale={timeScale} particles={particles} />
      {hasDrone && <ScoutDroneRig feed={feed} layout={layout} pose={pose} />}
      <Particles ref={particles} timeScale={timeScale} budget={particleBudget} />
      <CameraRig pose={pose} light={sun} startX={0} wide={hasDrone} />
    </>
  );
}
