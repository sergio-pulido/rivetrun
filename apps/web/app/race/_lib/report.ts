import type { Action, Episode } from '@rivetrun/contracts';
import type { RaceDnf } from './protocol';
import { postRaceAction } from './useRaceRoom';

export interface RaceSeat {
  readonly playerId: string;
  readonly token: string;
}

export interface StateReport {
  readonly x: number;
  readonly v: number;
  readonly damagePct: number;
  readonly batteryPct: number;
  readonly lastAction: Action | null;
  readonly lastActionP?: number | null;
  readonly latencyMs?: number | null;
  readonly thinking?: boolean;
  readonly done?: boolean;
  readonly finished?: boolean;
  readonly dnfReason?: RaceDnf | null;
  readonly score?: number | null;
  readonly episode?: Episode;
}

/** One state post. The server stamps the race time; this device only says what its sim did. */
export const reportState = (code: string, seat: RaceSeat, raceNo: number, report: StateReport): Promise<unknown> =>
  postRaceAction(code, { action: 'state', ...seat, raceNo, ...report });

/** How long the final post keeps trying: a little under the server's patience with a silent phone (GONE_MS). */
const FINAL_RETRY_MS = 18_000;

/**
 * The final post decides the result, so it outlasts a short loss of signal: it is retried until it lands or
 * the server would have closed this robot's run as disconnected anyway.
 */
export async function reportFinal(code: string, seat: RaceSeat, raceNo: number, report: StateReport): Promise<void> {
  const started = Date.now();
  for (let attempt = 0; Date.now() - started < FINAL_RETRY_MS; attempt++) {
    try {
      await reportState(code, seat, raceNo, report);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 400 * (attempt + 1))));
    }
  }
}
