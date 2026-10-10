// Words for the Lab Missions screens. Kept apart from the components so the tests can read them.
import type { Build } from '@rivetrun/contracts';
import { PARTS_BY_ID, SIMPLIFICATIONS } from '@rivetrun/sim';
import { LAB_DEFAULT_BUILDS, type LabOutcome, type LabScenarioId } from '@rivetrun/lab';

/** Said on every Lab screen: what this simulation is and is not. */
export const LAB_HONESTY = 'Lab Missions use a grid simulation: the robot moves tile by tile on a top-down map. Speed, battery and damage still come from your build.';

/** Where the grid departs from the track, one sentence each, from the sim's own list. */
export const LAB_SIMPLIFICATIONS: readonly string[] = SIMPLIFICATIONS.filter((item) => item.screen === 'lab').map((item) => item.sentence);

export interface ScenarioBrief {
  /** What to do, in one line, for the picker card. */
  readonly tagline: string;
  /** The part or two that decide it. */
  readonly matters: readonly string[];
  /** What to know before starting. */
  readonly tip: string;
}

export const SCENARIO_BRIEFS: Readonly<Record<LabScenarioId, ScenarioBrief>> = {
  maze: {
    tagline: 'Find the way out of an unmapped maze.',
    matters: ['Lidar', 'Camera', 'Ultrasonic'],
    tip: 'You know where the exit is, not how to get there. The map fills in only where your sensors reach: with none, you find the walls by hitting them.',
  },
  warehouse: {
    tagline: 'Three parcels, three bays, three forklifts.',
    matters: ['Lidar', 'Large battery'],
    tip: 'One parcel at a time. Forklifts turn back for a robot that is standing still and hit one that drives in front of them. A camera only looks ahead.',
  },
  mars: {
    tagline: 'Three soil samples and back before the battery runs out.',
    matters: ['Moisture probe', 'Camera', 'Large battery'],
    tip: 'Taking a sample needs the moisture probe. Sand is heavy going and a storm will cut what the camera sees. Craters are invisible to a lidar.',
  },
  house: {
    tagline: 'Four rooms, four checkpoints, and stairs.',
    matters: ['Camera'],
    tip: 'Only a camera can scan a checkpoint, and only a camera sees a drop. Doors open when you drive into them.',
  },
  ctf: {
    tagline: 'Your robot against Jev: first to bring the flag home.',
    matters: ['Fast motor', 'Camera'],
    tip: 'Drive into the robot that holds the flag to take it: it is stunned for 2 s. A robot that has just taken the flag is safe for 2 s.',
  },
};

/** The result headline. The e2e matches on these. */
export function resultHeading(outcome: Pick<LabOutcome, 'status' | 'dnfReason'>): string {
  if (outcome.status === 'complete') return 'Scenario complete';
  if (outcome.status === 'partial') return 'Ended early';
  switch (outcome.dnfReason) {
    case 'battery': return 'Out of battery';
    case 'damage': return 'Robot wrecked';
    case 'beaten': return 'Jev got the flag home';
    case 'stuck': return 'Nothing left to do';
    default: return 'Out of time';
  }
}

const partName = (id: string): string => PARTS_BY_ID.get(id)?.name ?? id;

/** "Camera, Ultrasonic" or "No sensors": what a build senses with, for a loadout card. */
export const sensorLine = (build: Build): string => (build.sensors.length > 0 ? build.sensors.map(partName).join(', ') : 'No sensors');

export interface LabLoadout {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly build: Build;
}

/** Robots to try a scenario with: the player's own, the one that suits it, and two that show what sensing is worth. */
export function labLoadouts(scenarioId: LabScenarioId, mine: Build): LabLoadout[] {
  const suited = LAB_DEFAULT_BUILDS[scenarioId];
  // Mars needs the probe in one of the two sensor slots.
  const second = scenarioId === 'mars' ? 'moisture_probe' : 'camera';
  return [
    { id: 'mine', name: 'My robot', note: 'The build on your Workshop bench.', build: mine },
    { id: 'suited', name: 'Recommended', note: 'A build that can complete this scenario.', build: suited },
    { id: 'lidar', name: 'Lidar loaner', note: 'Sees walls 12 m all round. On loan from the lab: no unlock needed here.', build: { ...suited, sensors: ['lidar_rplidar_c1', second] } },
    { id: 'blind', name: 'Blind', note: 'No sensors at all, and a bumper. See what that costs.', build: { ...suited, sensors: [], extras: ['bumper'] } },
  ];
}
