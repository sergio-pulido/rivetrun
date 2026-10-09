'use client';

// In-canvas components: mount them inside your own R3F <Canvas> (client-only).
export { RobotModel } from './robot/RobotModel';
export type { RobotModelProps } from './robot/RobotModel';
export type { Expression, RobotDrive } from './robot/drive';
export { RunScene } from './run/RunScene';
export type { RunSceneProps } from './run/RunScene';
export { WorkshopScene } from './workshop/WorkshopScene';
export type { WorkshopSceneProps } from './workshop/WorkshopScene';
