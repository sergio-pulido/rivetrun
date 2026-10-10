'use client';

import { useMemo } from 'react';
import type { Build, Mission } from '@rivetrun/contracts';
import { fixesFor, testRunReport, type Fix, type TestRunReport } from './scenario';
import { assessBuild, capabilities, partsProviding, type BuildAssessment } from './sim';

export interface TestRunResult {
  /** Null when the sim could not run this build. */
  readonly assessment: BuildAssessment | null;
  readonly report: TestRunReport | null;
  /** Parts that would provide what the build lacked. */
  readonly fixes: readonly Fix[];
}

const NOT_RUN: TestRunResult = { assessment: null, report: null, fixes: [] };

/** The sim's test run for a build on a mission, recomputed when either changes. Cheap (a few ms), so it runs while rendering. */
export function useTestRun(build: Build, mission: Mission, priority: number, enabled = true): TestRunResult {
  return useMemo(() => {
    if (!enabled) return NOT_RUN;
    const assessment = assessBuild(build, mission, priority);
    if (!assessment) return NOT_RUN;
    const caps = capabilities(build);
    const senses = caps ? { ...caps.lookahead, tilt: caps.sensesTilt } : undefined;
    const report = testRunReport(assessment, senses ? { segments: mission.track.segments, senses } : undefined);
    return { assessment, report, fixes: fixesFor(report.missing, build, partsProviding) };
  }, [build, mission, priority, enabled]);
}
