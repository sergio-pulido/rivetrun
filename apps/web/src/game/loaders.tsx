'use client';

import { SceneLoader } from './SceneLoader';

// Shown by next/dynamic while the three.js chunk of a canvas downloads: the same cover the scene
// keeps up until its first frame, so a slow network never shows an empty box either.
export const RunLoading = () => (
  <div className="relative h-full w-full overflow-hidden">
    <SceneLoader label="Building the track" tips />
  </div>
);

export const AttractLoading = () => (
  <div className="relative h-full w-full overflow-hidden">
    <SceneLoader label="Warming up the replay" tips />
  </div>
);
