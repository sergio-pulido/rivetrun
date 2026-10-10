'use client';

import { useEffect, useMemo } from 'react';
import type { Build, GhostTrace, Mission, SimState } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, MISSIONS, PRESETS } from '@rivetrun/sim';
import { useRunAudio } from './audio/useRunAudio';
import type { DriveInput } from './drive/driveInput';
import { createFakeRun, fakeGhostTrace } from './fakeRun';
import { RunHud } from './hud/RunHud';
import { UI } from './palette';
import { quality } from './quality';
import { SceneFrame } from './SceneFrame';
import { RunScene } from './run/RunScene';
import { createRunFeed, type RunFeed } from './runFeed';
import { useTelemetryOpen } from './telemetry/telemetryStore';

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
export default function RunCanvas({ mission = MISSIONS.M5, build = PRESETS[DEFAULT_PRESET_ID].build, feed, ghosts, hud = true, drive, onReady }: RunCanvasProps) {
  const demo = useDemoRun(mission, build, feed === undefined);
  const activeFeed = feed ?? demo.feed;
  const activeGhosts = ghosts ?? demo.ghosts;
  useRunAudio(activeFeed, build, drive !== undefined);
  const dev = useMemo(() => (process.env.NODE_ENV === 'production' ? null : pinnable(activeFeed)), [activeFeed]);
  const tier = quality();
  const telemetryOpen = useTelemetryOpen();

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: UI.ink }}>
      <SceneFrame
        label="Building the track"
        tips
        camera={{ fov: 38, near: 0.5, far: 420, position: [0, 6, 20] }}
        canvasStyle={{ touchAction: 'none' }}
        onReady={onReady}
        onCreated={({ gl, scene, camera }) => {
          // Dev only: read draw calls and the sim state from the console (window.__rivetrun.info.render.calls, .state()).
          if (dev) (window as unknown as { __rivetrun?: unknown }).__rivetrun = { info: gl.info, scene, camera, state: () => activeFeed.get().state, pin: dev.pin };
        }}
      >
        {(plain) => <RunScene mission={mission} build={build} feed={dev?.feed ?? activeFeed} ghosts={activeGhosts} particleBudget={tier.particles} hands={drive} plain={plain} raise={telemetryOpen && hud} flyIn={!tier.weak && feed !== undefined} />}
      </SceneFrame>
      {hud && <RunHud mission={mission} feed={activeFeed} ghosts={activeGhosts} drive={drive} build={build} />}
    </div>
  );
}
