'use client';

import WorkshopCanvas, { type WorkshopCanvasProps } from '@/game/WorkshopCanvas';

/**
 * The game session's workshop turntable, as its own lazy chunk.
 * Its `onReady` fires at the first drawn frame, so the drawn placeholder stays up until the bench is on screen.
 */
export default function BenchCanvas(props: WorkshopCanvasProps) {
  return <WorkshopCanvas {...props} />;
}
