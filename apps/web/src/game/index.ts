'use client';

// Entry point for pages. three.js never renders on the server: both canvases are
// loaded with next/dynamic and ssr: false. In-canvas pieces (RobotModel, RunScene,
// WorkshopScene) live in '@/game/scene' so they stay out of server bundles.
import dynamic from 'next/dynamic';

/** Run view (scene + HUD). No `feed` prop ⇒ self-driving demo on a fake run. */
export const RunCanvas = dynamic(() => import('./RunCanvas'), { ssr: false });
/** Workshop turntable. Pass `build` and it updates live. */
export const WorkshopCanvas = dynamic(() => import('./WorkshopCanvas'), { ssr: false });

export type { RunCanvasProps } from './RunCanvas';
export type { WorkshopCanvasProps } from './WorkshopCanvas';
export { createRunFeed, useRunView } from './runFeed';
export type { RunFeed, RunView } from './runFeed';
export { BrainHud } from './hud/BrainHud';
export type { BrainHudProps } from './hud/BrainHud';
export { TopBar } from './hud/TopBar';
export type { TopBarProps } from './hud/TopBar';
export { RunHud } from './hud/RunHud';
export { createFakeRun, fakeGhostTrace } from './fakeRun';
// Procedural sound (Web Audio, no assets). The run view wires itself; other screens can fire one-shots.
export { initAudio, isMuted, play as playSfx, setMuted, toggleMute } from './audio/sfx';
export type { SoundName } from './audio/sfx';
export { ACTION_LABEL, POLICY_LABEL, POLICY_TINT, TERRAIN_LOOK, UI } from './palette';
