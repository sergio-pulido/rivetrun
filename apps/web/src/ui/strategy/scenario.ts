import type { Build, Mission, Segment, TerrainId } from '@rivetrun/contracts';
import { PARTS_BY_ID, TERRAINS } from '@rivetrun/sim';
import { formatSeconds } from '@/ui/format';
import { assessBuild, meetsDemand, missionDemands, type BuildAssessment, type CapabilityId, type SegmentVerdict } from './sim';

const MAX_STARS = 3;

/** What a stretch of track has on it besides its ground: slope, obstacle, depth, ramp / gap / drop, current. */
export function segmentFacts(segment: Segment): readonly string[] {
  const feature = segment.feature;
  return [
    segment.slopeDeg >= 1 ? `${segment.slopeDeg}° climb` : null,
    segment.slopeDeg <= -1 ? `${-segment.slopeDeg}° descent` : null,
    segment.obstacle ?? null,
    segment.depthCm ? `${segment.depthCm} cm deep` : null,
    feature?.type === 'ramp' ? `${feature.launchDeg}° ramp` : null,
    feature?.type === 'gap' ? `${feature.widthM} m gap` : null,
    feature?.type === 'drop' ? `${feature.heightM} m drop` : null,
    segment.currentMps ? `current ${segment.currentMps} m/s` : null,
  ].flatMap((fact) => (fact ? [fact] : []));
}

export interface ScenarioDemand {
  readonly capability: CapabilityId;
  /** The sim's wording, e.g. "Swim 90 cm". */
  readonly label: string;
  /** Whether the build meets it by the sim's rule; null when the sim cannot say. */
  readonly met: boolean | null;
}

export interface ScenarioSegment {
  readonly index: number;
  readonly startM: number;
  readonly endM: number;
  readonly terrain: TerrainId;
  readonly facts: readonly string[];
  readonly demands: readonly ScenarioDemand[];
  /** How the build did here on the test run; null when there is no test run to read. */
  readonly verdict: SegmentVerdict | null;
  /** What happened here, in the sim's words. */
  readonly note: string | null;
}

/** The mission as a strip: each segment with what is on it, what it demands and how this build does there. */
export function scenarioSegments(mission: Mission, build: Build, assessment: BuildAssessment | null = assessBuild(build, mission)): readonly ScenarioSegment[] {
  const demands = missionDemands(mission);
  const starts = mission.track.segments.reduce<number[]>((acc, segment) => [...acc, acc[acc.length - 1]! + segment.lengthM], [0]);
  return mission.track.segments.map((segment, index) => {
    const tested = assessment?.segments.find((entry) => entry.segmentIndex === index);
    const tests = demands?.find((entry) => entry.segmentIndex === index)?.tests ?? [];
    return {
      index,
      startM: starts[index]!,
      endM: starts[index + 1]!,
      terrain: segment.terrain,
      facts: segmentFacts(segment),
      demands: tests.map((test) => ({ capability: test.capability, label: test.label, met: meetsDemand(build, test) })),
      verdict: tested?.verdict ?? null,
      note: tested?.note ?? null,
    };
  });
}

export interface Trouble {
  readonly atM: number;
  readonly verdict: SegmentVerdict;
  readonly note: string;
}

export interface TestRunReport {
  readonly tone: 'ok' | 'warn' | 'bad';
  /** "DNF at 22 m" or "Finishes in 17.1 s · 2 of 3 stars". */
  readonly title: string;
  /** Why it failed, or what it finished with. */
  readonly detail: string;
  /** Where a finishing build lost time or took damage. */
  readonly trouble: readonly Trouble[];
  /** Capabilities the build lacks where it failed, or where it had trouble. */
  readonly missing: readonly CapabilityId[];
}

const unique = <T,>(items: readonly T[]): readonly T[] => [...new Set(items)];

/** A test run in a few lines: where the build fails and why, or how it finishes and where it struggles. */
export function testRunReport(assessment: BuildAssessment): TestRunReport {
  if (assessment.dnf) {
    return { tone: 'bad', title: `DNF at ${Math.round(assessment.dnf.atM)} m`, detail: assessment.dnf.why, trouble: [], missing: unique(assessment.dnf.missing) };
  }
  const rough = assessment.segments.filter((segment) => segment.verdict === 'damage' || segment.verdict === 'slow');
  return {
    tone: rough.length > 0 ? 'warn' : 'ok',
    title: `Finishes in ${formatSeconds(assessment.timeS)} s · ${assessment.stars} of ${MAX_STARS} stars`,
    detail: `${Math.round(assessment.damagePct)}% damage · ${Math.round(assessment.energyLeftPct)}% battery left`,
    trouble: rough.flatMap((segment) => (segment.note ? [{ atM: segment.startM, verdict: segment.verdict, note: segment.note }] : [])),
    missing: unique(rough.flatMap((segment) => segment.missing)),
  };
}

const CAPABILITY_NAME: Readonly<Partial<Record<CapabilityId, string>>> = {
  clearance: 'obstacle clearance',
  top_speed: 'top speed',
  climb: 'climbing',
  wading: 'wading depth',
  waterproof: 'sealed hull',
  thrust: 'thrust to swim',
  jump: 'a jump',
  ramp_speed: 'speed for the ramp',
  protection: 'impact protection',
  lookahead_obstacle: 'seeing obstacles ahead',
  lookahead_terrain: 'reading terrain ahead',
  lookahead_depth: 'measuring water depth',
  range: 'range',
};

/** A capability in a few plain words, for "missing: …" and "fit for …". */
export function capabilityName(id: CapabilityId): string {
  if (id.startsWith('traction:')) return `grip on ${TERRAINS[id.slice('traction:'.length) as TerrainId].name.toLowerCase()}`;
  return CAPABILITY_NAME[id] ?? id.replaceAll('_', ' ');
}

export interface Fix {
  readonly capability: CapabilityId;
  readonly name: string;
  /** Parts that provide it and are not on the build, best first. */
  readonly partIds: readonly string[];
}

/**
 * For each capability the build lacks: the parts that would provide it. Parts already fitted or not in the game yet are left out,
 * and a part that helps with several is listed once, under the capability it is the best answer to.
 */
export function fixesFor(missing: readonly CapabilityId[], build: Build, providers: (capability: CapabilityId) => readonly string[]): readonly Fix[] {
  const fitted = new Set<string>([build.locomotion, build.motor, build.battery, ...build.sensors, ...build.extras]);
  const ranked = missing.map((capability) => ({ capability, partIds: providers(capability) }));
  const bestRank = (id: string): number => Math.min(...ranked.map((entry) => entry.partIds.indexOf(id)).filter((rank) => rank >= 0));
  const taken = new Set<string>();
  return ranked.flatMap(({ capability, partIds }): Fix[] => {
    const mine = partIds.filter((id, rank) => !fitted.has(id) && !PARTS_BY_ID.get(id)?.comingSoon && !taken.has(id) && rank === bestRank(id));
    mine.forEach((id) => taken.add(id));
    return mine.length > 0 ? [{ capability, name: capabilityName(capability), partIds: mine }] : [];
  });
}
