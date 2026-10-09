'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Build, GhostTrace, Mission } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, MISSIONS, PRESETS } from '@rivetrun/sim';
import { useRunAudio } from './audio/useRunAudio';
import type { DriveInput } from './drive/driveInput';
import { createFakeRun, fakeGhostTrace } from './fakeRun';
import { RunHud } from './hud/RunHud';
import { UI } from './palette';
import { quality } from './quality';
import { RunScene } from './run/RunScene';
import { createRunFeed, type RunFeed } from './runFeed';

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
   * the canvas shows the touch controls instead of the Brain sheet and tags the robot YOU.
   */
  drive?: DriveInput;
  /** Drive mode: Jev's live run on the same build, seed and track (a second RunFeed). Drawn as a ghost labelled JEV. */
  rival?: RunFeed;
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

/** The run view: R3F canvas with the 2.5D scene plus the HUD overlay. Fills its parent. */
export default function RunCanvas({ mission = MISSIONS.M5, build = PRESETS[DEFAULT_PRESET_ID].build, feed, ghosts, hud = true, drive, rival }: RunCanvasProps) {
  const demo = useDemoRun(mission, build, feed === undefined);
  const activeFeed = feed ?? demo.feed;
  const activeGhosts = ghosts ?? demo.ghosts;
  const [lost, setLost] = useState(false);
  useRunAudio(activeFeed, build);
  const tier = quality();

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: UI.ink }}>
      <Canvas
        shadows
        dpr={[1, tier.maxDpr]}
        camera={{ fov: 38, near: 0.5, far: 420, position: [0, 6, 20] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
        onCreated={({ gl, scene }) => {
          gl.domElement.addEventListener('webglcontextlost', () => setLost(true));
          gl.domElement.addEventListener('webglcontextrestored', () => setLost(false));
          // Dev only: read draw calls from the console (window.__rivetrun.info.render.calls).
          if (process.env.NODE_ENV !== 'production') (window as unknown as { __rivetrun?: unknown }).__rivetrun = { info: gl.info, scene };
        }}
      >
        <RunScene mission={mission} build={build} feed={activeFeed} ghosts={activeGhosts} particleBudget={tier.particles} hands={drive} rival={rival} />
      </Canvas>
      {lost && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs" style={{ color: UI.dim }}>
          3D view paused — reload to resume
        </div>
      )}
      {hud && <RunHud mission={mission} feed={activeFeed} ghosts={activeGhosts} drive={drive} rival={rival} build={build} />}
    </div>
  );
}
