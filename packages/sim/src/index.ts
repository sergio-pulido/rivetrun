// @rivetrun/sim — deterministic simulation core. Pure TS: no DOM, no React, no Node APIs.
export * from './data';
export * from './types';
export { DROP_APPROACH_M, OBSTACLE_SIZE_M, SHORE_DEPTH_CM, SHORE_RAMP_M, obstacleHeightAt, compileTrack, segmentIndexAt, waterDepthCmAt } from './world';
export type { World, WorldFeature, WorldObstacle, WorldSegment } from './world';
export { BUILD_TUNING, buildIssues, deriveSpec } from './spec';
export { predictStats } from './stats';
export type { PredictedStats } from './stats';
export type { RobotSpec } from './spec';
export { createRun, step, withAction, markDecision, jumpAirtimeS, PHYSICS, ACTION_PROFILES } from './physics';
export { perceive, lookahead, detectDecisionPoint, availableActions, buildQuestion } from './perception';
export { score, why, whyLine } from './score';
export { heuristicBrain, heuristicDecide, randomBrain, utility } from './brains';
export { controlToAction, driveController, runController, runHeadless } from './controller';
export { assessBuild, capabilities, capabilityList, meetsDemand, missionDemands, partGives, partsProviding } from './strategy';
export type { BuildAssessment, Capabilities, CapabilityId, CapabilityItem, DemandTest, SegmentAssessment, SegmentDemand, SegmentVerdict } from './strategy';
