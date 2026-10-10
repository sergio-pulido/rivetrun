'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useMemo, useRef, type RefObject } from 'react';
import { Vector3, type DirectionalLight, type Group, type PerspectiveCamera } from 'three';
import type { Build, GhostTrace, Mission, Policy, SimEffect } from '@rivetrun/contracts';
import { TUNING, deriveSpec } from '@rivetrun/sim';
import { atmosphereOf, weatherOverride } from '../atmosphere';
import { LANES, POLICY_LABEL, POLICY_TINT, TERRAIN_LOOK, UI, laneZ } from '../palette';
import { clamp, damp, lerp } from '../rng';
import { restDrive, type Expression, type RobotDrive } from '../robot/drive';
import { RobotModel } from '../robot/RobotModel';
import type { DriveInput } from '../drive/driveInput';
import type { RunFeed } from '../runFeed';
import { sensesOf } from '../sense';
import { PIT_DEPTH, basinDepthAt, layoutTrack, sampleTrack, type TrackLayout } from '../track';
import { Headlights } from './Headlights';
import { Particles, type ParticleEmitter } from './Particles';
import { restPose, type Pose } from './pose';
import { restRide, rideOver, stanceFor } from './ride';
import { ScoutDroneRig } from './ScoutDroneRig';
import { ScanPads } from './ScanPads';
import { SenseBand } from './SenseBand';
import { SpeedLines } from './SpeedLines';
import { EFFECT_PARTICLES, Tag, swimLift } from './shared';
import { World } from './World';

const SIM_DT = TUNING.dtMs / 1000;
/** How long the tumble into a gap plays before the robot is shown back at its respawn point. */
const FALL_MS = 650;

interface PlayerProps {
  feed: RunFeed;
  build: Build;
  layout: TrackLayout;
  pose: RefObject<Pose>;
  timeScale: RefObject<number>;
  particles: RefObject<ParticleEmitter | null>;
  /** Drive mode: the player's controls. The face follows the pedals and the tag reads YOU. */
  hands?: DriveInput;
  /** Night mission and a build whose lights switch themselves on. */
  lights?: boolean;
}

function Player({ feed, build, layout, pose, timeScale, particles, hands, lights = false }: PlayerProps) {
  const group = useRef<Group>(null);
  const drive = useRef<RobotDrive>(restDrive());
  const riding = useRef(restRide());
  const stance = useMemo(() => stanceFor(build.locomotion), [build.locomotion]);
  const budget = useRef<Partial<Record<SimEffect, number>>>({});
  const lastDamageAt = useRef(0);
  const celebrated = useRef(false);
  const swim = useRef(0);
  const landedAt = useRef(0);
  const squash = useRef(0);
  const fall = useRef({ at: 0, until: 0, x: 0, y: 0 });
  const snap = useRef(false);

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
    // Fell into a gap: the sim has already put the robot back at its respawn point. Show the tumble first.
    if (view.lastFall && view.lastFall.at !== fall.current.at) {
      fall.current = { at: view.lastFall.at, until: now + FALL_MS, x: pose.current.x, y: pose.current.y };
      pose.current.shakeUntil = now + 260;
    }
    if (now < fall.current.until && !view.done) {
      const k = 1 - (fall.current.until - now) / FALL_MS;
      node.visible = true;
      node.scale.set(1, 1, 1);
      node.position.set(fall.current.x + k * 0.35, fall.current.y - k * k * PIT_DEPTH, LANES.player);
      node.rotation.z = -k * 1.9;
      drive.current.expression = 'hurt';
      drive.current.wheelSpin = 6;
      // The camera holds on the hole; the pose snaps to the respawn point when the tumble ends.
      snap.current = true;
      return;
    }
    // Brain v3: the run does not slow down while the brain decides (latency is real, the last command holds).
    timeScale.current = 1;
    // The sim ticks at 20 Hz: extrapolate one tick, then ease. Nothing moves once the run is over.
    const ahead = view.done ? 0 : Math.min((now - view.stateAt) / 1000, SIM_DT);
    const target = state.x + state.v * ahead;
    const p = pose.current;
    const jump = !p.ready || snap.current || Math.abs(target - p.s) > 3;
    snap.current = false;
    p.s = jump ? target : damp(p.s, target, 22, dt);
    p.t = state.t + ahead;
    p.v = state.v;
    swim.current = damp(swim.current, state.thrusting ? 1 : 0, 2.5, dt);
    // The sim's x is the nose. On the ground the axles ride the sim's solid ground (ramps, decks,
    // obstacles); in the air the height comes from the sim and follows vy between ticks.
    const airborne = state.airborne === true;
    const airM = airborne ? Math.max(0, (state.heightM ?? 0) + (state.vy ?? 0) * ahead) : null;
    const ride = riding.current;
    rideOver(layout, stance, { nose: p.s, airM, pitchDeg: state.pitch, slopeDeg: state.slopeDeg }, jump, dt, ride);
    const under = ride.segment!;
    p.x = ride.x;
    p.y = ride.y + swim.current * swimLift(under, ride.s, clock.elapsedTime);
    p.ready = true;
    node.visible = true;
    node.position.set(p.x, p.y, LANES.player);
    node.rotation.z = ride.pitch;

    // Touchdown: dust from both axles, sparks if it hurt, a camera kick and a quick squash.
    if (view.lastLanding && view.lastLanding.at !== landedAt.current) {
      landedAt.current = view.lastLanding.at;
      const hard = clamp(view.lastLanding.impactMps / 4, 0.15, 1);
      const dust = TERRAIN_LOOK[state.terrain].dust;
      particles.current?.emit('dust', p.x - 0.5, p.y + 0.05, LANES.player, Math.round(8 + hard * 22), 1, dust);
      particles.current?.emit('dust', p.x + 0.5, p.y + 0.05, LANES.player, Math.round(8 + hard * 22), -1, dust);
      if (view.lastLanding.damagePct > 0) particles.current?.emit('sparks', p.x, p.y + 0.2, LANES.player, Math.round(10 + hard * 20), 1);
      p.shakeUntil = now + 120 + hard * 320;
      squash.current = hard;
    }
    squash.current = damp(squash.current, 0, 9, dt);
    node.scale.set(1 + squash.current * 0.1, 1 - squash.current * 0.2, 1);

    const slipping = state.effects.includes('slip') && !airborne;
    const wrecked = view.dnfReason !== null;
    if (view.lastDamage && view.lastDamage.at !== lastDamageAt.current) {
      lastDamageAt.current = view.lastDamage.at;
      p.shakeUntil = now + 380;
      // Contact is at the nose: that is where the sim stopped or slowed the robot.
      particles.current?.emit('sparks', p.x + stance.nose, p.y + 0.3, LANES.player, 26, 1);
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
            : airborne
              ? 'jump'
              : slipping
                ? 'slip'
                : hands
                  ? hands.peek().brake
                    ? 'brake'
                    : hands.peek().throttle
                      ? 'accelerate'
                      : 'cruise'
                  : (view.decision?.decision.selected ?? 'idle');
    const d = drive.current;
    d.airborne = airborne && !view.done;
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
      // Nothing is kicked up off the ground while the wheels are in the air.
      if (!spec || (airborne && spec.where === 'rear')) continue;
      const owed = (budget.current[effect] ?? 0) + spec.rate * simDt * (spec.where === 'rear' ? clamp(Math.abs(state.wheelSpin) / 5, 0.4, 1.6) : 1);
      const count = Math.floor(owed);
      budget.current[effect] = owed - count;
      if (count === 0) continue;
      const x = spec.where === 'rear' ? p.x - dir * 0.55 : spec.where === 'front' ? p.x + 0.7 : p.x - 0.1;
      const y = spec.where === 'top' ? p.y + 0.8 : effect === 'bubbles' ? p.y + 0.5 : p.y + 0.06;
      // Spinning wheels throw up whatever they stand on: mud, ice chips, spray, or the ground's own dust.
      const roost = effect === 'slip' ? (state.terrain === 'mud' ? 'mud' : state.terrain === 'ice' || state.terrain === 'snow' ? 'ice' : state.terrain === 'water' ? 'splash' : 'dust') : spec.kind;
      const color = roost === 'dust' ? TERRAIN_LOOK[state.terrain].dust : undefined;
      emitter.emit(roost, x, y, LANES.player + (Math.random() < 0.5 ? 0.5 : -0.5), count, dir, color);
    }
    // A current: specks streaming past the robot through the water column.
    if ((state.waterCurrentMps ?? 0) > 0 && !view.done && Math.random() < simDt * 22 * (state.waterCurrentMps ?? 0)) {
      const column = basinDepthAt(under, ride.s);
      emitter.emit('current', p.x + 1 + Math.random() * 3.5, sampleTrack(layout, ride.s).y - Math.random() * column * 0.9, LANES.zFront - Math.random() * 3, 1, 1);
    }
    // A little kick-up even when the sim reports no effect, so fast driving reads as fast.
    if (active.length === 0 && !airborne && Math.abs(state.v) > 1.4 && !view.done && Math.random() < simDt * 9) {
      emitter.emit('dust', p.x - dir * 0.55, p.y + 0.05, LANES.player, 1, dir, TERRAIN_LOOK[state.terrain].dust);
    }
  });

  return (
    <group ref={group} visible={false}>
      <RobotModel build={build} drive={drive} droneAway />
      {lights && <Headlights nose={stance.nose} />}
      <Tag text={hands ? POLICY_LABEL.human : POLICY_LABEL.jev} color={UI.safety} y={1.95} />
    </group>
  );
}

interface GhostProps {
  trace: GhostTrace;
  build: Build;
  layout: TrackLayout;
  pose: RefObject<Pose>;
  timeScale: RefObject<number>;
  /** Drive mode: the one ghost is the rival (Jev, or the heuristic standing in) on the lane behind the player. */
  driving: boolean;
}

/** A translucent robot replaying a recorded headless run against sim time. */
function Ghost({ trace, build, layout, pose, timeScale, driving }: GhostProps) {
  const group = useRef<Group>(null);
  const drive = useRef<RobotDrive>(restDrive());
  const cursor = useRef(0);
  const riding = useRef(restRide());
  const stance = useMemo(() => stanceFor(build.locomotion), [build.locomotion]);
  const shown = useRef(false);
  const swim = useRef(0);
  const policy: Policy = trace.policy;
  const z = driving ? LANES.heuristic : laneZ(policy);

  useFrame(({ clock }, rawDt) => {
    const node = group.current;
    const frames = trace.frames;
    if (!node) return;
    const first = frames[0];
    if (!pose.current.ready || !first) {
      node.visible = false;
      shown.current = false;
      return;
    }
    const t = pose.current.t;
    if (cursor.current >= frames.length || frames[cursor.current]!.t > t) cursor.current = 0;
    while (cursor.current < frames.length - 2 && frames[cursor.current + 1]!.t <= t) cursor.current += 1;
    const a = frames[cursor.current]!;
    const b = frames[Math.min(cursor.current + 1, frames.length - 1)]!;
    const span = b.t - a.t;
    // A fall sends the ghost back to its respawn point with a time penalty: hold, then snap, never slide backwards.
    const respawn = b.x < a.x - 1;
    const k = respawn ? 0 : span > 0 ? clamp((t - a.t) / span, 0, 1) : 1;
    const ended = t >= frames[frames.length - 1]!.t;
    const dt = Math.min(rawDt, 0.5);
    const flying = a.airborne === true;
    const ride = riding.current;
    const input = {
      nose: lerp(a.x, b.x, k),
      airM: flying ? lerp(a.heightM ?? 0, b.heightM ?? 0, k) : null,
      pitchDeg: flying ? a.pitch : lerp(a.pitch, b.pitch, k),
      slopeDeg: flying ? a.slopeDeg : lerp(a.slopeDeg, b.slopeDeg, k),
    };
    // First frame, a respawn or a replay starting over: place it, do not ease it there.
    rideOver(layout, stance, input, !shown.current || Math.abs(input.nose - stance.nose - ride.s) > 3, dt, ride);
    shown.current = true;
    node.visible = true;
    swim.current = damp(swim.current, a.thrusting ? 1 : 0, 2.5, dt);
    node.position.set(ride.x, ride.y + swim.current * swimLift(ride.segment!, ride.s, clock.elapsedTime + 1.3), z);
    node.rotation.z = ride.pitch;
    const d = drive.current;
    const airborne = flying && !ended;
    const slipping = a.effects.includes('slip') && !airborne;
    d.wheelSpin = ended ? 0 : a.wheelSpin * (timeScale.current ?? 1);
    d.speed = a.v;
    d.slip = slipping && !ended ? 1 : 0;
    d.dnf = ended && !trace.outcome.finished;
    d.expression = d.dnf ? 'dnf' : ended ? 'finish' : airborne ? 'jump' : slipping ? 'slip' : 'cruise';
    d.winch = false;
    d.thrusting = a.thrusting === true && !ended;
    d.airborne = airborne;
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
/** Drive mode: more road ahead of the robot, since the player has to react to it. */
const VIEW_WIDTH_DRIVE_M = 7.4;
const MIN_VIEW_HEIGHT_M = 8.5;
const ELEVATION = (15 * Math.PI) / 180;
/** Width of the Brain sheet in the HUD (max-w-[430px]): the camera keeps the robot clear of it in landscape. */
const HUD_SHEET_WIDTH_PX = 430;

interface RigProps {
  pose: RefObject<Pose>;
  light: RefObject<DirectionalLight | null>;
  startX: number;
  /** Frame the scout drone ahead of the robot too. */
  wide: boolean;
  /** Drive mode: no Brain sheet over the lower screen, and the driver needs to see further ahead. */
  driving: boolean;
  /** A bottom sheet covers the lower screen in portrait after all (telemetry open while driving). */
  raise: boolean;
}

/** Side-on follow camera, framed for portrait, with decision zoom and impact shake. */
function CameraRig({ pose, light, startX, wide, driving, raise }: RigProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const focus = useRef({ x: startX, y: 0, init: false });
  const target = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.5);
    const p = pose.current;
    const f = focus.current;
    const aspect = size.width / Math.max(1, size.height);
    const portrait = aspect < 1;
    const halfV = (camera.fov * Math.PI) / 360;
    const byWidth = (driving ? VIEW_WIDTH_DRIVE_M : wide ? VIEW_WIDTH_DRONE_M : VIEW_WIDTH_M) / (2 * Math.tan(halfV) * aspect);
    const byHeight = MIN_VIEW_HEIGHT_M / (2 * Math.tan(halfV));
    const distance = Math.max(byWidth, byHeight);

    // Landscape (laptop, big screen): the Brain sheet sits bottom-centre, so park the robot left of it.
    const viewWidthM = 2 * distance * Math.tan(halfV) * aspect;
    const sheetLeftPx = (size.width - Math.min(HUD_SHEET_WIDTH_PX, size.width)) / 2;
    const robotPx = clamp(sheetLeftPx - 130, size.width * 0.12, size.width * 0.36);
    const lead = portrait ? (driving ? 1.7 : wide ? 1.35 : 0.75) : driving ? viewWidthM * 0.2 : (0.5 - robotPx / size.width) * viewWidthM;
    const leadX = (p.ready ? p.x : startX) + lead + clamp(p.v * 0.25, -0.5, 0.9);
    const leadY = p.ready ? p.y : 0;
    if (!f.init) {
      f.x = leadX;
      f.y = leadY;
      f.init = true;
    }
    f.x = Math.abs(leadX - f.x) > 6 ? leadX : damp(f.x, leadX, 6, dt);
    f.y = damp(f.y, leadY, 3.2, dt);

    // In portrait the Brain sheet (or the telemetry drawer, `raise`) covers the lower ~42 %: the robot sits in the clear band above it.
    const lift = distance * Math.tan(halfV) * (portrait ? (driving && !raise ? -0.3 : 0.2) : -0.12);
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
  /** Drive mode: the player's controls (tag reads YOU, wider view, no decision zoom; the one ghost is the rival). */
  hands?: DriveInput;
  /** Running late: skip the reflection environment and draw with plain lights. */
  plain?: boolean;
  /** A bottom sheet is open over the lower part of a portrait screen (telemetry in Drive mode): frame the robot above it. */
  raise?: boolean;
}

/** The 2.5D run view. Mount inside an R3F <Canvas>. Reads sim state only: no physics here. */
export function RunScene({ mission, build, feed, ghosts = [], particleBudget = 1, hands, plain = false, raise = false }: RunSceneProps) {
  const layout = useMemo(() => layoutTrack(mission.track), [mission.track]);
  const pose = useRef<Pose>(restPose());
  const hasDrone = build.sensors.includes('scout_drone');
  const senses = useMemo(() => sensesOf(build, mission.weather), [build, mission.weather]);
  const atmosphere = useMemo(() => atmosphereOf(mission, weatherOverride()), [mission]);
  // Lights come on by themselves only on a build with an ambient-light sensor (the sim's rule); others drive dark.
  const autoLights = useMemo(() => deriveSpec(build).autoLights === true, [build]);
  // The wind of the moment, gusts included, straight from the sim; the mission's steady wind before the first frame.
  const windNow = useCallback(() => feed.get().state?.windMps ?? atmosphere.windMps, [feed, atmosphere]);
  const timeScale = useRef(1);
  const particles = useRef<ParticleEmitter>(null);
  const sun = useRef<DirectionalLight>(null);
  return (
    <>
      <World layout={layout} atmosphere={atmosphere} windNow={windNow} sun={sun} budget={particleBudget} plain={plain} />

      {ghosts.map((trace) => (
        <Ghost key={trace.policy} trace={trace} build={build} layout={layout} pose={pose} timeScale={timeScale} driving={hands !== undefined} />
      ))}
      <Player feed={feed} build={build} layout={layout} pose={pose} timeScale={timeScale} particles={particles} hands={hands} lights={atmosphere.night && autoLights} />
      <SenseBand layout={layout} pose={pose} feed={feed} senses={senses} />
      {mission.scanZones && mission.scanZones.length > 0 ? <ScanPads layout={layout} zones={mission.scanZones} build={build} feed={feed} /> : null}
      {hasDrone && <ScoutDroneRig feed={feed} layout={layout} pose={pose} />}
      <SpeedLines pose={pose} budget={particleBudget} />
      <Particles ref={particles} timeScale={timeScale} budget={particleBudget} />
      <CameraRig pose={pose} light={sun} startX={0} wide={hasDrone} driving={hands !== undefined} raise={raise} />
    </>
  );
}
