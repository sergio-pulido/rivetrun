// Every gameplay constant lives here. v0 values; tuned later by scripts/balance.ts.
export const TUNING = {
  /** Fixed sim timestep. */
  dtMs: 50,
  /** Ghost frames are recorded at this rate against sim time. */
  ghostHz: 10,
  /** Hard stop for a run (DNF: timeout). */
  maxRunS: 180,
  defaultBudgetEur: 250,

  decision: {
    intervalS: 1.5,
    lookaheadS: 1.5,
    slipThresholdPct: 25,
    /** Jev budget; beyond it the heuristic decides with fallback: true. */
    timeoutMs: 1200,
    /** Run speed while a decision is pending. */
    slowMoFactor: 0.25,
  },

  weather: {
    clear: {},
    rain: { frictionFactor: 0.8, mudSinkageFactor: 1.3, cameraRangeFactor: 0.6 },
    cold: { batteryCapacityFactor: 0.8, iceFrictionFactor: 0.9 },
  },

  practice: {
    /** Practice missions jitter friction by ± this fraction per seed. */
    frictionJitter: 0.1,
  },

  score: {
    base: 1000,
    perSecond: 4,
    perDamagePct: 6,
    perEnergyPct: 2,
    costDivisor: 5,
    /** DNF score = dnfMax × progressFraction. */
    dnfMax: 200,
  },
} as const;

export type Tuning = typeof TUNING;
