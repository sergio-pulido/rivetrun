// Who sits in Jev's seat on /scenarios. Until the Lab decide endpoint is live this is the lab's own heuristic,
// answering after a fixed delay so that a race against it is a race. The page says so.
import { LAB_RIVAL_LATENCY_MS, labHeuristicDecide, type LabBrain } from '@rivetrun/lab';

export const STAND_IN_NAME = 'Heuristic';
export const STAND_IN_NOTE = `Jev's seat is filled by the lab's heuristic here, answering in ${LAB_RIVAL_LATENCY_MS} ms. It reads the same question Jev would get.`;

/** The heuristic, answering after `latencyMs` of real time. */
export function standInBrain(latencyMs: number = LAB_RIVAL_LATENCY_MS): LabBrain {
  return {
    decide: (question) =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ ...labHeuristicDecide(question), latencyMs }), latencyMs);
      }),
  };
}
