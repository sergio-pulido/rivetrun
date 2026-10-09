// @rivetrun/sim — deterministic simulation core. Pure TS: no DOM, no React, no Node APIs.
export * from './data';
export * from './types';
export { compileTrack, segmentIndexAt, waterDepthCmAt } from './world';
export type { World, WorldObstacle, WorldSegment } from './world';
export { buildIssues, deriveSpec } from './spec';
export type { RobotSpec } from './spec';
export { createRun, step, withAction, markDecision, PHYSICS, ACTION_PROFILES } from './physics';
export { perceive, lookahead, detectDecisionPoint, availableActions, buildQuestion } from './perception';
export { score, why, whyLine } from './score';
export { heuristicBrain, heuristicDecide, randomBrain, utility } from './brains';
export { runController, runHeadless } from './controller';
