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

/** The final post decides the result: try it three times before giving up. */
export async function reportFinal(code: string, seat: RaceSeat, raceNo: number, report: StateReport): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await reportState(code, seat, raceNo, report);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
}
