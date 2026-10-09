'use client';

import { useEffect } from 'react';
import WorkshopCanvas, { type WorkshopCanvasProps } from '@/game/WorkshopCanvas';

interface BenchCanvasProps extends WorkshopCanvasProps {
  /** Called once the 3D code has loaded and the canvas is mounted. */
  readonly onReady?: () => void;
}

/** The game session's workshop turntable, as its own lazy chunk that reports when it has arrived. */
export default function BenchCanvas({ onReady, ...props }: BenchCanvasProps) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return <WorkshopCanvas {...props} />;
}
