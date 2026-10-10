'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Build, GhostTrace, Mission, SimState } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, MISSIONS, PRESETS } from '@rivetrun/sim';
import { useRunAudio } from './audio/useRunAudio';
import type { DriveInput } from './drive/driveInput';
import { createFakeRun, fakeGhostTrace } from './fakeRun';
import { useBrainChoice } from './hud/brainStore';
import { pilotOverride, type PilotTag } from './hud/strategy';
import { RunHud } from './hud/RunHud';
import { UI } from './palette';
import { quality } from './quality';
import { SceneFrame } from './SceneFrame';
import { mk2Requested } from './robot/mk2/flag';
import { useRobotSignal } from './robot/mk2/live';
import { preloadMk2 } from './robot/mk2/Mk2Parts';
import { RunScene } from './run/RunScene';
import { createRunFeed, type RunFeed } from './runFeed';
import { useTelemetryOpen } from './telemetry/telemetryStore';

/** A run waits at most this long for the robot's kit before it starts anyway. */
const KIT_WAIT_MS = 4000;

/** Mobile performance budget from the spec. Weak devices drop to 1 (see quality.ts). */
export const MAX_DPR = 1.5;

export interface RunCanvasProps {
  mission?: Mission;
  build?: Build;
  /**
   * Live run: `runController(config, brain, { onEvent: feed.push })`.
   * Omit it and the canvas drives itself with a looping fake run (demo mode).
   */
  feed?: RunFeed;
  /** Brain Duel traces. In demo mode they are faked too. */
  ghosts?: readonly GhostTrace[];
  /** Hide the DOM overlay (top bar + Brain HUD) to supply your own. */
  hud?: boolean;
  /**
   * Drive mode: the player's controls, from `createDriveInput()`. The sim samples `drive.read()` each tick;
   * the canvas shows the touch controls instead of the Brain sheet and tags the robot YOU. Pass the rival as the
   * single entry of `ghosts` (policy 'jev', or 'heuristic' when Jev's ghost was not ready): it is labelled from its policy.
   */
  drive?: DriveInput;
  /**
   * Called once when the scene has drawn its first frame (or has been given up on after 15 s).
   * Start the run from here if the first seconds must not be missed on a slow phone.
   */
  onReady?: () => void;
  /**
   * A robot picked on /play (RR-PLAN): who drives it and on what orders. The HUD shows it as one line under the top
   * bar and the robot's name tag reads the agent's name. With `hud={false}`, mount `StrategyChip` in your own HUD.
   */
  pilot?: PilotTag;
}

const DEMO_RESTART_MS = 4200;

/** Looping fake run + fake ghosts, until packages/sim drives the scene. */
function useDemoRun(mission: Mission, build: Build, enabled: boolean): { feed: RunFeed; ghosts: readonly GhostTrace[] } {
  const feed = useMemo(() => createRunFeed(), []);
  const ghosts = useMemo(
    () => (enabled ? [fakeGhostTrace(mission, build, 'heuristic'), fakeGhostTrace(mission, build, 'random')] : []),
    [mission, build, enabled],
  );
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = 0;
    let run = createFakeRun({ mission, build, onEvent: () => undefined });
    const launch = () => {
      feed.reset();
      run = createFakeRun({
        mission,
        build,
        onEvent: (event) => {
          feed.push(event);
          if (event.type === 'finish' || event.type === 'dnf') timer = window.setTimeout(launch, DEMO_RESTART_MS);
        },
      });
      run.start();
    };
    launch();
    return () => {
      window.clearTimeout(timer);
      run.stop();
    };
  }, [mission, build, enabled, feed]);
  return { feed, ghosts };
}

interface Pinnable {
  readonly feed: RunFeed;
  readonly pin: (patch: Partial<SimState> | null) => void;
}

/**
 * Dev only, for visual QA: `window.__rivetrun.pin({ x: 21.3, v: 0 })` holds the drawn robot at a sim
 * state so contact with an obstacle can be inspected; `pin(null)` lets go. The run itself is untouched.
 */
function pinnable(feed: RunFeed): Pinnable {
  let patch: Partial<SimState> | null = null;
  return {
    feed: {
      ...feed,
      get: () => {
        const view = feed.get();
        return patch && view.state ? { ...view, state: { ...view.state, ...patch }, stateAt: performance.now() } : view;
      },
    },
    pin: (next) => {
      patch = next;
    },
  };
}

/** The run view: R3F canvas with the 2.5D scene plus the HUD overlay. Fills its parent. */
export default function RunCanvas({ mission = MISSIONS.M5, build = PRESETS[DEFAULT_PRESET_ID].build, feed, ghosts, hud = true, drive, onReady, pilot: givenPilot }: RunCanvasProps) {
  const pilot = useMemo(() => givenPilot ?? pilotOverride() ?? undefined, [givenPilot]);
  const demo = useDemoRun(mission, build, feed === undefined);
  const activeFeed = feed ?? demo.feed;
  const activeGhosts = ghosts ?? demo.ghosts;
  useRunAudio(activeFeed, build, drive !== undefined);
  const dev = useMemo(() => (process.env.NODE_ENV === 'production' ? null : pinnable(activeFeed)), [activeFeed]);
  const tier = quality();
  const telemetryOpen = useTelemetryOpen();
  const brainChoice = useBrainChoice();
  // Whether something tall covers the lower part of an upright screen: the telemetry drawer, or the Brain sheet once it
  // is tapped open (it starts as one line). A page that draws its own HUD over a watched run keeps the old framing.
  const covered = hud ? telemetryOpen || (drive === undefined && brainChoice === 'open') : drive === undefined;
  const robot = useRobotSignal('run');
  // The run starts (onReady) when the scene has drawn AND the robot's kit is in, so the robot is on the start line
  // from the first moment. A kit that fails counts as in (the fallback robot is drawn); so does one that takes too long.
  const [kitIn, setKitIn] = useState(false);
  const [sceneIn, setSceneIn] = useState(false);
  const told = useRef(false);
  useEffect(() => {
    if (!mk2Requested('run')) {
      setKitIn(true);
      return undefined;
    }
    let live = true;
    const done = (): void => {
      if (live) setKitIn(true);
    };
    void preloadMk2(build).then(done);
    const late = window.setTimeout(done, KIT_WAIT_MS);
    return () => {
      live = false;
      window.clearTimeout(late);
    };
  }, [build]);
  const sceneReady = useCallback(() => setSceneIn(true), []);
  useEffect(() => {
    if (!kitIn || !sceneIn || told.current) return;
    told.current = true;
    onReady?.();
  }, [kitIn, sceneIn, onReady]);

  return (
    // data-robot: which robot the run draws (mk2, procedural with data-robot-reason, or loading), for QA.
    <div className="relative h-full w-full overflow-hidden" style={{ background: UI.ink }} {...robot}>
      <SceneFrame
        label="Building the track"
        failureHelp="The run itself still works: the gauges and controls are live."
        tips
        camera={{ fov: 38, near: 0.5, far: 420, position: [0, 6, 20] }}
        canvasStyle={{ touchAction: 'none' }}
        onReady={sceneReady}
        onCreated={({ gl, scene, camera }) => {
          // Dev only: read draw calls and the sim state from the console (window.__rivetrun.info.render.calls, .state()).
          if (dev) (window as unknown as { __rivetrun?: unknown }).__rivetrun = { info: gl.info, scene, camera, state: () => activeFeed.get().state, pin: dev.pin };
        }}
      >
        {(plain) => <RunScene mission={mission} build={build} feed={dev?.feed ?? activeFeed} ghosts={activeGhosts} particleBudget={tier.particles} hands={drive} plain={plain} raise={covered} playerName={drive ? undefined : pilot?.agent} flyIn={!tier.weak && feed !== undefined} />}
      </SceneFrame>
      {hud && <RunHud mission={mission} feed={activeFeed} ghosts={activeGhosts} drive={drive} build={build} pilot={pilot} />}
    </div>
  );
}
