// @rivetrun/sim — deterministic simulation core. Pure TS: no DOM, no React, no Node APIs.
export * from './data';
export * from './types';
export { DROP_APPROACH_M, OBSTACLE_SIZE_M, SHORE_DEPTH_CM, SHORE_RAMP_M, obstacleHeightAt, compileTrack, segmentIndexAt, waterDepthCmAt } from './world';
export type { World, WorldFeature, WorldObstacle, WorldSegment } from './world';
export { BUILD_TUNING, buildIssues, deriveSpec } from './spec';
export { predictStats } from './stats';
export type { PredictedStats } from './stats';
export type { RobotSpec } from './spec';
export { weatherEffects, partWeatherNotes } from './weatherEffects';
export type { WeatherEffect } from './weatherEffects';
export { WEATHER, airDragN, canScanZone, cameraFactor, capacityFactor, conditionsOf, gustAt, headwindMps, rangerFactor } from './weather';
export { createRun, step, withAction, markDecision, jumpAirtimeS, jumpChargePower, safeContactSpeedMps, PHYSICS, ACTION_PROFILES, SCAN_RULES } from './physics';
export { GAMEPLAY_VERSION } from '@rivetrun/contracts';
export {
  SCAN, START_TRIGGER, advanceBrain, availableActions, buildQuestion, detectDecisionPoint, lookahead, observe, optionsNow, perceive, safeSpeedMps, scannableZone, senses,
} from './perception';
export { score, why, whyLine } from './score';
export { heuristicBrain, heuristicDecide, randomBrain, utility } from './brains';
export { controlToAction, decisionLog, driveController, replayDrive, runController, runHeadless, runHeuristicSync } from './controller';
export { assessBuild, capabilities, capabilityList, meetsDemand, missionDemands, partGives, partsProviding } from './strategy';
export type { BuildAssessment, Capabilities, CapabilityId, CapabilityItem, DemandTest, SegmentAssessment, SegmentDemand, SegmentVerdict } from './strategy';
export type { DriveLogEntry } from './controller';
