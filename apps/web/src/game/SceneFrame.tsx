'use client';

import { Canvas, useFrame, type CanvasProps, type RootState } from '@react-three/fiber';
import { Component, useCallback, useEffect, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { quality } from './quality';
import { UI } from './palette';
import { SceneLoader } from './SceneLoader';

/** After this long without a first frame the scene drops its optional extras and draws with plain lights. */
const PLAIN_AFTER_MS = 3000;
/** After this long without a first frame the 3D view is declared unavailable; the page around it keeps working. */
const GIVE_UP_AFTER_MS = 15000;
const FADE_MS = 340;

/** Reports once the scene has really been drawn: the second frame starts only after the first was rendered. */
function FirstFrame({ onFirst }: { onFirst: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 2) onFirst();
  });
  return null;
}

interface BoundaryProps {
  onError: (error: Error) => void;
  children: ReactNode;
}

/** A crash inside the 3D tree (no WebGL, a bad asset, a scene bug) must not take the page or the HUD with it. */
class SceneBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

interface Problem {
  readonly title: string;
  readonly help: string;
}

/**
 * The 3D view is gone (lost context, no WebGL, a crash): say so and give a way on. It sits above whatever
 * overlay the page draws over the canvas (the HUD, the pedals), and only its two buttons take touches.
 */
function SceneProblem({ problem }: { problem: Problem }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-5" style={{ top: '46%' }} role="alert">
      <div className="w-full max-w-[340px] rounded-2xl px-4 py-3.5 text-center" style={{ border: `2px solid ${UI.warn}`, background: 'rgb(14 16 19 / 0.94)', color: UI.text }}>
        <p className="m-0 font-display text-[15px] font-bold uppercase tracking-[2px]" style={{ color: UI.warn }}>
          {problem.title}
        </p>
        <p className="m-0 mt-1.5 text-[13px] leading-snug">{problem.help}</p>
        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="pointer-events-auto h-11 rounded-xl px-5 font-display text-[14px] font-bold tracking-[1.5px]"
            style={{ background: UI.safety, color: UI.ink }}
          >
            RELOAD
          </button>
          <a href="/" className="pointer-events-auto flex h-11 items-center rounded-xl px-5 font-display text-[14px] font-bold tracking-[1.5px]" style={{ border: `1px solid ${UI.line}`, color: UI.text, textDecoration: 'none' }}>
            HOME
          </a>
        </div>
      </div>
    </div>
  );
}

export interface SceneFrameProps {
  /** The scene. `plain` turns true when it is taking too long: skip optional extras (reflections) and draw with plain lights. */
  children: (plain: boolean) => ReactNode;
  camera: CanvasProps['camera'];
  /** Loading label, e.g. "Building the track". */
  label: string;
  /** Rotate gameplay tips while loading (full-screen scenes). */
  tips?: boolean;
  /** No cover of its own: the parent draws a placeholder under a transparent canvas (workshop). */
  bare?: boolean;
  alpha?: boolean;
  canvasStyle?: CSSProperties;
  /** Called once, when the first frame is on screen (or when the view is given up on). Start the action here. */
  onReady?: () => void;
  onCreated?: (state: RootState) => void;
  /** A tap or click that hit nothing interactive in the scene. */
  onPointerMissed?: () => void;
}

/**
 * Every 3D view goes through this frame, so none of them can show a black box:
 * a loading cover stays up until the first frame has been drawn, the scene falls back to plain lights
 * after 3 s, and a lost WebGL context or a crash in the scene becomes a message instead of a void.
 */
export function SceneFrame({ children, camera, label, tips = false, bare = false, alpha = false, canvasStyle, onReady, onCreated, onPointerMissed }: SceneFrameProps) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'shown' | 'failed'>('loading');
  const [plain, setPlain] = useState(false);
  const [lost, setLost] = useState(false);
  const told = useRef(false);
  const tier = quality();

  const ready = useCallback(() => {
    if (told.current) return;
    told.current = true;
    onReady?.();
  }, [onReady]);

  const onFirst = useCallback(() => {
    setPhase((current) => (current === 'loading' ? 'ready' : current));
    ready();
  }, [ready]);

  const fail = useCallback(() => {
    setPhase('failed');
    // Whoever waits for the scene (a run about to start) must not wait forever.
    ready();
  }, [ready]);

  useEffect(() => {
    if (phase !== 'loading') return undefined;
    const slow = window.setTimeout(() => setPlain(true), PLAIN_AFTER_MS);
    const dead = window.setTimeout(fail, GIVE_UP_AFTER_MS);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(dead);
    };
  }, [phase, fail]);

  // The cover fades out over the first frames, then leaves the page.
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const id = window.setTimeout(() => setPhase('shown'), FADE_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  const problem: Problem | null =
    phase === 'failed'
      ? { title: '3D view unavailable on this device', help: 'The run itself still works: the gauges and controls are live. Reload to try the 3D view again.' }
      : lost
        ? { title: '3D view paused', help: 'The graphics were reset. They usually come back by themselves in a moment; reload if they do not.' }
        : null;
  const failed = problem?.title ?? null;

  return (
    <>
      {phase !== 'failed' && (
        <SceneBoundary onError={fail}>
          <Canvas
            // Weak devices (and ?quality=low) skip the shadow pass: it redraws every caster, about a quarter of the draw calls.
            shadows={!tier.weak}
            dpr={[1, tier.maxDpr]}
            camera={camera}
            gl={{ antialias: true, alpha, powerPreference: 'high-performance' }}
            style={{ position: 'absolute', inset: 0, ...canvasStyle }}
            onPointerMissed={onPointerMissed}
            onCreated={(state) => {
              state.gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                setLost(true);
              });
              state.gl.domElement.addEventListener('webglcontextrestored', () => setLost(false));
              onCreated?.(state);
            }}
          >
            {children(plain)}
            <FirstFrame onFirst={onFirst} />
          </Canvas>
        </SceneBoundary>
      )}
      {(bare || phase === 'shown') && !failed ? null : <SceneLoader label={label} tips={tips} leaving={phase === 'ready' && !failed} failed={failed} blank={problem !== null} />}
      {problem ? <SceneProblem problem={problem} /> : null}
    </>
  );
}
