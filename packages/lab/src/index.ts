// @rivetrun/lab — Lab Missions: a deterministic top-down grid simulation with the same parts, sensors, battery
// and brains as the rail. Pure TS: no DOM, no React, no Node APIs.
export * from './types';
export * from './schema';
export { DIRS, DIR_NAME, bearing, cellAt, dirBetween, expandRoute, indexOf, inside, lineOfSight, manhattan, markerCell, parseMap, roomCells, sameCell, stepCell, tileAt } from './grid';
export { LAB_TUNING, PACE, contactDamagePct, deriveRobot, rangeTiles, sensorSuite, tileMotion } from './robot';
export type { LabRobot, Pace, SensorSuite, TileMotion } from './robot';
export { doorOpen, isOpaque, knownShare, seeCell, weatherFactor } from './sensing';
export { enterCost, frontiers, navigate, pathTo } from './nav';
export type { Frontier, Nav, NavContext } from './nav';
export { energyView, navContextOf } from './context';
export type { EnergyView } from './context';
export { completion, defOf, finalGoal, hasRole, interactionBlockers, interactionsAt, objectiveStatus, objectivesDone } from './objectives';
export type { Interaction, ObjectiveStatus } from './objectives';
export { SOURCE_LABEL } from './autopilot';
export { command, createLab, retire, setPace, stepLab } from './engine';
export { buildLabQuestion, buildOptions, missionLine, observeLab } from './observe';
export { labHeuristicBrain, labHeuristicDecide, labRandomBrain, labUtility } from './brains';
export { scoreLab } from './score';
export type { LabOutcome } from './score';
export { applyOption, createLabDriver, frameOf, runLabEntries, runLabSync } from './controller';
export type { LabDecisionLog, LabDriver, LabFrame, LabMiss, LabRunEntry, LabRunOptions, LabRunResult } from './controller';
