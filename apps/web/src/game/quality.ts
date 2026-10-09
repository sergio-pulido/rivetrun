/** Device tier for the performance safety net. Decided once, on the client. */
export interface Quality {
  readonly weak: boolean;
  /** Upper bound for the canvas device-pixel ratio. */
  readonly maxDpr: number;
  /** Multiplier on particle pools and emission rates. */
  readonly particles: number;
}

const FULL: Quality = { weak: false, maxDpr: 1.5, particles: 1 };
const LOW: Quality = { weak: true, maxDpr: 1, particles: 0.5 };

let cached: Quality | null = null;

/** Weak = 4 logical cores or fewer. `?quality=low` / `?quality=high` in the URL forces a tier for testing. */
export function quality(): Quality {
  if (cached) return cached;
  if (typeof navigator === 'undefined') return FULL;
  const forced = new URLSearchParams(window.location.search).get('quality');
  const weak = forced === 'low' || (forced !== 'high' && (navigator.hardwareConcurrency ?? 8) <= 4);
  cached = weak ? LOW : FULL;
  return cached;
}
