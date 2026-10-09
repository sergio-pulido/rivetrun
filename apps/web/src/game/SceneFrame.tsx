'use client';

import { Canvas, useFrame, type CanvasProps, type RootState } from '@react-three/fiber';
import { Component, useCallback, useEffect, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { quality } from './quality';
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
}

/**
 * Every 3D view goes through this frame, so none of them can show a black box:
 * a loading cover stays up until the first frame has been drawn, the scene falls back to plain lights
 * after 3 s, and a lost WebGL context or a crash in the scene becomes a message instead of a void.
 */
export function SceneFrame({ children, camera, label, tips = false, bare = false, alpha = false, canvasStyle, onReady, onCreated }: SceneFrameProps) {
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

  const failed = phase === 'failed' ? '3D view unavailable on this device' : lost ? '3D view paused · reload to resume' : null;

  return (
    <>
      {phase !== 'failed' && (
        <SceneBoundary onError={fail}>
          <Canvas
            shadows
            dpr={[1, tier.maxDpr]}
            camera={camera}
            gl={{ antialias: true, alpha, powerPreference: 'high-performance' }}
            style={{ position: 'absolute', inset: 0, ...canvasStyle }}
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
      {(bare || phase === 'shown') && !failed ? null : <SceneLoader label={label} tips={tips} leaving={phase === 'ready' && !failed} failed={failed} />}
    </>
  );
}
