'use client';

import { useEffect, useRef } from 'react';
import WorkshopCanvas, { type WorkshopCanvasProps } from '@/game/WorkshopCanvas';

/** A canvas element is 300 × 150 until the 3D renderer has measured its box and sized it. */
const UNSIZED = { width: 300, height: 150 } as const;

interface BenchCanvasProps extends WorkshopCanvasProps {
  /** Called once the 3D bench is actually drawing: the renderer has sized its canvas and a frame has passed. */
  readonly onReady?: () => void;
}

/**
 * The game session's workshop turntable, as its own lazy chunk.
 * It reports ready from an animation frame, not on mount: a page that is not being rendered gets no frames,
 * so the drawn placeholder stays up instead of fading to an empty stage.
 */
export default function BenchCanvas({ onReady, ...props }: BenchCanvasProps) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onReady) return;
    let frame = 0;
    const check = (): void => {
      const canvas = box.current?.querySelector('canvas');
      if (canvas && (canvas.width !== UNSIZED.width || canvas.height !== UNSIZED.height)) {
        // One more frame, so the first image is on screen before the placeholder starts to fade.
        frame = requestAnimationFrame(onReady);
        return;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [onReady]);

  return (
    <div ref={box} className="h-full w-full">
      <WorkshopCanvas {...props} />
    </div>
  );
}
