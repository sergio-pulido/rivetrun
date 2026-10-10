'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';

/** Frames the scene draws before optional art starts to load. */
const FRAMES = 3;

/**
 * True once the scene has drawn its first few frames. The M7 backdrop and prop kit wait for it: decoding pictures
 * and models must never delay the first frame of a run (the loading cover, and the 15 s limit after which a device
 * is told its 3D view is unavailable).
 */
export function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current > FRAMES) return;
    frames.current += 1;
    if (frames.current > FRAMES) setSettled(true);
  });
  return settled;
}
