// The sim's strategy layer (capabilities / missionDemands / assessBuild), read through one adapter:
// the screens show less when the sim cannot answer for a build, and never fall over because of it.
import type { Build, Mission } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';
import type { BuildAssessment, CapabilityId, CapabilityItem, DemandTest, SegmentDemand } from '@rivetrun/sim';

export type { BuildAssessment, CapabilityId, CapabilityItem, DemandTest, SegmentAssessment, SegmentDemand, SegmentVerdict } from '@rivetrun/sim';

/** Runs a sim function that may throw on a build it does not expect: the screen carries on without the answer. */
function attempt<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

/** A build's capabilities as a flat list with the sim's labels, for showing and for comparing two builds. */
export const capabilityList = (build: Build): readonly CapabilityItem[] | null => attempt(() => sim.capabilityList(build));

/** What a fitted part adds to its build; a drive, motor or battery is compared with the plainest one in its slot. */
export const partGives = (build: Build, partId: string): readonly CapabilityItem[] | null => attempt(() => sim.partGives(build, partId as Parameters<typeof sim.partGives>[1]));

/** Parts that provide or improve a capability, best first. Empty when the sim cannot say. */
export const partsProviding = (capability: CapabilityId): readonly string[] => attempt(() => sim.partsProviding(capability)) ?? [];

/** Whether the build meets one demand, by the sim's own rule. Null when the sim cannot say. Advisory: the test run is the real answer. */
export const meetsDemand = (build: Build, test: DemandTest): boolean | null => attempt(() => sim.meetsDemand(build, test));

export const missionDemands = (mission: Mission): readonly SegmentDemand[] | null => attempt(() => sim.missionDemands(mission));

/** A headless run of the heuristic on the mission's fixed drive seed. Deterministic for a given build and mission. */
export const assessBuild = (build: Build, mission: Mission, priority?: number): BuildAssessment | null =>
  attempt(() => sim.assessBuild(build, mission, priority === undefined ? undefined : { priority }));
