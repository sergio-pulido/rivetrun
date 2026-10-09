// Which robot is drawn. The MK-II asset is opt-in until it passes the phone gate
// (docs/MK2_ASSET_CONTRACT.md): the procedural robot is the default and the fallback.

const STORAGE_KEY = 'rivetrun.robot';

let cached: boolean | null = null;

/**
 * true when this device asked for the MK-II: open any page once with `?robot=mk2`
 * (remembered on the device); `?robot=procedural` switches it off again.
 */
export function mk2Requested(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  let wanted = false;
  try {
    const forced = new URLSearchParams(window.location.search).get('robot');
    if (forced === 'mk2' || forced === 'procedural') window.localStorage.setItem(STORAGE_KEY, forced);
    wanted = window.localStorage.getItem(STORAGE_KEY) === 'mk2';
  } catch {
    // Storage blocked: stay on the procedural robot.
  }
  cached = wanted;
  return wanted;
}
