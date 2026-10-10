// The order of the jobs. A robot with three parcels to move has six ways to do it, and they are not the same
// length: the planner works out, for each job it could start with, how long everything takes from there.

export interface TourJob {
  readonly id: string;
  /** Tile index where the job starts (the parcel) and where it leaves the robot (its bay; the same tile for a scan). */
  readonly from: number;
  readonly to: number;
}

/** Above this many jobs every order is too many to try: the nearest job is taken each time instead. */
const EXACT_UP_TO = 7;

/**
 * Tiles for the shortest way to do `need` of the jobs starting at `start`, then on to `end` when there is one.
 * `tiles(a, b)` is the driving distance between two tile indexes.
 */
export function bestTour(start: number, jobs: readonly TourJob[], need: number, end: number | undefined, tiles: (from: number, to: number) => number): number {
  const closing = (at: number): number => (end === undefined ? 0 : tiles(at, end));
  if (need <= 0 || jobs.length === 0) return closing(start);
  if (jobs.length > EXACT_UP_TO) {
    const nearest = [...jobs].sort((a, b) => tiles(start, a.from) - tiles(start, b.from))[0]!;
    return tiles(start, nearest.from) + tiles(nearest.from, nearest.to) + bestTour(nearest.to, jobs.filter((job) => job !== nearest), need - 1, end, tiles);
  }
  let best = Infinity;
  for (const job of jobs) {
    const rest = bestTour(job.to, jobs.filter((other) => other !== job), need - 1, end, tiles);
    best = Math.min(best, tiles(start, job.from) + tiles(job.from, job.to) + rest);
  }
  return best;
}
