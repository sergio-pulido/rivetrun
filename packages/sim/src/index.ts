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
export { createRun, step, withAction, markDecision, jumpAirtimeS, jumpChargePower, fanHop, fanHoldFor, safeContactSpeedMps, PHYSICS, ACTION_PROFILES, SCAN_RULES } from './physics';
export { GAMEPLAY_VERSION } from '@rivetrun/contracts';
export {
  SCAN, START_TRIGGER, advanceBrain, availableActions, buildQuestion, detectDecisionPoint, lookahead, observe, optionsNow, perceive, safeSpeedMps, scannableZone, senses,
} from './perception';
export { score, why, whyLine } from './score';
export { heuristicBrain, heuristicDecide, randomBrain, utility } from './brains';
export { controlToAction, decisionLog, driveController, replayDrive, replayEpisode, runController, runHeadless, runHeuristicSync } from './controller';
export { assessBuild, capabilities, capabilityList, meetsDemand, missionDemands, partGives, partsProviding } from './strategy';
export type { BuildAssessment, Capabilities, CapabilityId, CapabilityItem, DemandTest, SegmentAssessment, SegmentDemand, SegmentVerdict } from './strategy';
export type { DriveLogEntry } from './controller';
export { naiveDrive, carefulDrive, fullThrottleCheck } from './stranger';
export type { FullThrottleCheck } from './stranger';
export { SIMPLIFICATIONS } from './simplifications';
export type { Simplification } from './simplifications';
export { movingOut, wayOut, STUCK_RULES } from './wayout';
export type { WayOut } from './wayout';
export { LEAK_BUILDS, LEAK_DIVERGE_M, LEAK_VARIANTS, leakMission, leakSamples } from './leak';
export type { LeakSample } from './leak';
export type { ReplayResult } from './controller';
export { DRIVE_VERSION } from '@rivetrun/contracts';
