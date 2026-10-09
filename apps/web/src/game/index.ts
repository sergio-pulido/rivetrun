'use client';

// Entry point for pages. three.js never renders on the server: both canvases are
// loaded with next/dynamic and ssr: false. In-canvas pieces (RobotModel, RunScene,
// WorkshopScene) live in '@/game/scene' so they stay out of server bundles.
import dynamic from 'next/dynamic';
import { AttractLoading, RunLoading } from './loaders';

/** Run view (scene + HUD). No `feed` prop ⇒ self-driving demo on a fake run. */
export const RunCanvas = dynamic(() => import('./RunCanvas'), { ssr: false, loading: RunLoading });
/** Workshop turntable. Pass `build` and it updates live. */
export const WorkshopCanvas = dynamic(() => import('./WorkshopCanvas'), { ssr: false });
/** Big-screen attract loop: every preset replays M5 side by side. No network, no loadout, no props needed. */
export const AttractCanvas = dynamic(() => import('./AttractCanvas'), { ssr: false, loading: AttractLoading });

export type { RunCanvasProps } from './RunCanvas';
export type { WorkshopCanvasProps } from './WorkshopCanvas';
// What a tap on the rover in the Workshop reports: a catalog part or a printed part.
export type { RoverPick } from './robot/pick';
export type { AttractCanvasProps } from './AttractCanvas';
export { createRunFeed, useRunView } from './runFeed';
export type { RunFeed, RunView } from './runFeed';
export { BrainHud } from './hud/BrainHud';
export type { BrainHudProps } from './hud/BrainHud';
export { TopBar } from './hud/TopBar';
export type { TopBarProps } from './hud/TopBar';
export { RunHud } from './hud/RunHud';
// The loading cover every 3D view shows until its first frame; use it for your own lazy 3D too.
export { SceneLoader } from './SceneLoader';
export type { SceneLoaderProps } from './SceneLoader';
// Drive mode (gameplay v2): the player's controls. Create one per run, pass it to RunCanvas, sample it in the sim loop.
export { createDriveInput } from './drive/driveInput';
export type { DriveInput, DriveInputState } from './drive/driveInput';
export { DriveControls } from './drive/DriveControls';
export type { DriveControlsProps } from './drive/DriveControls';
export { haptic } from './drive/haptics';
export { createFakeRun, fakeGhostTrace } from './fakeRun';
// Procedural sound (Web Audio, no assets). The run view wires itself; other screens can fire one-shots.
export { initAudio, isMuted, play as playSfx, setMuted, toggleMute } from './audio/sfx';
export type { SoundName } from './audio/sfx';
export { ACTION_LABEL, POLICY_LABEL, POLICY_TINT, TERRAIN_LOOK, UI } from './palette';
