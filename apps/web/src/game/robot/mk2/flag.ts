// Which robot is drawn. The MK-II (apps/web/public/models/mk2) is the robot everywhere; the procedural
// robot is what a device gets when the kit fails or times out, and a manual override for testing.

const STORAGE_KEY = 'rivetrun.robot';

/**
 * Where the MK-II is the default. `everywhere`: Workshop, runs, race phones, the big screen's replay.
 * `workshop`: only on the Workshop turntable (the fallback if a real phone cannot hold the frame rate
 * with it in a run). One word to change; `?robot=mk2` still forces it anywhere for testing.
 */
export const MK2_DEFAULT: 'everywhere' | 'workshop' = 'everywhere';

export type Mk2Scope = 'workshop' | 'run';

let cached: 'mk2' | 'procedural' | null | undefined;

/** What this device was told with `?robot=mk2` or `?robot=procedural` (remembered on the device), if anything. */
function override(): 'mk2' | 'procedural' | null {
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') return null;
  let stored: string | null = null;
  try {
    const forced = new URLSearchParams(window.location.search).get('robot');
    if (forced === 'mk2' || forced === 'procedural') window.localStorage.setItem(STORAGE_KEY, forced);
    // `?robot=default` forgets an earlier override.
    if (forced === 'default') window.localStorage.removeItem(STORAGE_KEY);
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: no override, the default applies.
  }
  cached = stored === 'mk2' || stored === 'procedural' ? stored : null;
  return cached;
}

/** true when the MK-II should be drawn in this kind of view on this device. */
export function mk2Requested(scope: Mk2Scope = 'run'): boolean {
  const forced = override();
  if (forced) return forced === 'mk2';
  return MK2_DEFAULT === 'everywhere' || scope === 'workshop';
}
