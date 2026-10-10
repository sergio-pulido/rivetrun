import type { Episode, Outcome, TerrainId } from '@rivetrun/contracts';
import { TERRAINS, TUNING } from './data';
import type { RunState } from './types';

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** One line explaining the run, from ground truth. */
export function why(state: RunState): string {
  const { stats, spec, sim } = state;
  const has = (sensor: 'imu' | 'ultrasonic' | 'camera' | 'moisture' | 'scout_drone'): boolean => spec.sensorRangeM[sensor] !== undefined;
  const terrain = TERRAINS[stats.lastTerrain].name.toLowerCase();
  const slipEntries = Object.entries(stats.slipSByTerrain) as [TerrainId, number][];
  const worstSlip = slipEntries.sort((a, b) => b[1] - a[1])[0];
  const impact = stats.worstImpact;
  const water = stats.damageByCause.water ?? 0;
  const impactTotal = stats.damageByCause.impact ?? 0;
  const tip = stats.damageByCause.tip_over ?? 0;

  const impactLine = (): string =>
    impact!.air === 'fall'
      ? `Fell into a gap${state.falls > 1 ? ` ${state.falls} times` : ''}${spec.jumpImpulseMps > 0 ? '' : ' — no piston to jump it'}`
      : impact!.air === 'landing'
      ? `Landed hard at ${round1(impact!.speedMps)} m/s${spec.impactDamageFactor < 1 ? '' : ' — no bumper'}`
      : impact!.obstacle === undefined
      ? `Slammed onto ${TERRAINS[impact!.roughEntry ?? 'rock'].name.toLowerCase()} at ${round1(impact!.speedMps)} m/s${has('scout_drone') ? '' : ' — no scout drone to see it in time'}`
      : `Hit the ${impact!.obstacle} at ${round1(impact!.speedMps)} m/s${has('ultrasonic') ? '' : ' — no ultrasonic to see it coming'}`;
  // Mud ingress is logged as water damage; name the thing the player actually drove through.
  const hasWater = state.world.segments.some((segment) => segment.terrain === 'water');
  const waterLine = (): string => `Took ${Math.round(water)}% ${hasWater ? 'water' : 'mud ingress'} damage — no waterproof case`;
  const slipLine = (): string =>
    `Slipped ${Math.round(worstSlip![1])} s on ${TERRAINS[worstSlip![0]].name.toLowerCase()}${has('imu') ? '' : ' — no IMU'}`;

  if (state.dnfReason === 'stuck' && state.falls >= 3) return `Fell into the gap ${state.falls} times${spec.jumpImpulseMps > 0 ? '' : ' — no piston to jump it'}`;
  if (state.dnfReason === 'stuck' && state.blockedBy) {
    return `Blocked by a ${state.blockedBy} — ${spec.wheelSizeMm} mm ${spec.locomotionName.toLowerCase()} clear ${round1(spec.clearanceCm)} cm; it needs climb mode, bigger wheels or a jump`;
  }
  const gapAhead = state.world.features.find((f) => f.type === 'gap' && f.endM > sim.x && f.startM - sim.x <= 1.5);
  if (state.dnfReason === 'stuck' && gapAhead) {
    return `Stopped at a ${Math.round((gapAhead.endM - gapAhead.startM) * 100)} cm gap${spec.jumpImpulseMps > 0 ? ' and never took the jump' : ' — no ramp, no piston to jump it'}`;
  }
  const slope = state.world.segments[state.segmentIndex]!.slopeDeg;
  // A player can see the hill; the missing IMU only explains it when a Brain was driving.
  if (state.dnfReason === 'stuck' && slope >= 5 && state.config.manual) return `Stuck on a ${slope}° ${terrain} slope — it needs climb mode, a winch or more grip`;
  if (state.dnfReason === 'stuck' && slope >= 5 && !has('imu')) return `Stuck on a ${slope}° ${terrain} slope — no IMU to feel the tilt`;
  const here = state.world.segments[state.segmentIndex]!;
  if (state.dnfReason === 'stuck' && here.terrain === 'water' && here.depthCm > spec.maxWadingDepthCm) {
    return spec.maxSwimDepthCm > 0
      ? spec.maxSwimDepthCm < here.depthCm
        ? `Sank in ${here.depthCm} cm of water — too deep even for thrusters`
        : `Lost headway in ${here.depthCm} cm of water${here.currentMps ? ' — swept back by the current' : ''}`
      : `Sank in ${here.depthCm} cm of water — sealed, but no thruster kit to swim`;
  }
  if (state.dnfReason === 'damage' && here.terrain === 'water' && here.depthCm > spec.maxWadingDepthCm && !spec.waterproof) {
    return `Flooded in ${here.depthCm} cm of water — no waterproof case`;
  }
  if (state.dnfReason === 'stuck') return `Bogged down on ${terrain} — ${spec.locomotionName.toLowerCase()} could not grip`;
  if (state.dnfReason === 'battery') return `Battery died on ${terrain} at ${Math.round((sim.x / state.world.lengthM) * 100)}% of the track`;
  if (state.dnfReason === 'timeout') return `Ran out of time on ${terrain}`;
  if (state.dnfReason === 'damage') {
    if (water >= impactTotal && water >= tip && water > 0) return `Drowned the electronics on ${terrain} — no waterproof case`;
    if (impact && impactTotal >= tip) return `Wrecked: ${impactLine().toLowerCase()}`;
    return `Tipped over on a slope too steep for ${spec.locomotionName.toLowerCase()}`;
  }
  if (impact && impactTotal >= 3 && impactTotal >= water) return impactLine();
  if (water >= 3) return waterLine();
  if (worstSlip && worstSlip[1] >= 2) return slipLine();
  if (tip >= 3) return `Scraped ${Math.round(tip)}% off on a slope too steep for ${spec.locomotionName.toLowerCase()}`;
  if (impact && impactTotal >= 0.5) return impactLine();
  if (sim.damage < 0.5) return `Clean run: no damage, ${Math.round(sim.battery)}% battery left`;
  return `Finished with ${Math.round(sim.damage)}% damage and ${Math.round(sim.battery)}% battery left`;
}

/** Final Outcome (score + stars) for a finished or DNF run. */
export function score(state: RunState): Outcome {
  const { sim, spec } = state;
  const tuning = TUNING.score;
  // Furthest point reached: a fall puts the robot back, but the track it covered still counts.
  const progressFraction = state.finished ? 1 : Math.min(1, Math.max(0, Math.max(sim.x, state.bestX) / state.world.lengthM));
  const damagePct = round1(Math.min(100, sim.damage));
  const energyUsedPct = round1(Math.min(100, Math.max(0, 100 - sim.battery)));
  const points = state.finished
    ? tuning.base - tuning.perSecond * sim.t - tuning.perDamagePct * damagePct - tuning.perEnergyPct * energyUsedPct - spec.costEur / tuning.costDivisor
    : tuning.dnfMax * progressFraction;
  const rounded = Math.round(points);
  const threshold = state.config.mission.starThreshold;
  const stars = !state.finished ? 0 : rounded < threshold ? 1 : damagePct > 0 ? 2 : 3;
  return {
    finished: state.finished,
    timeS: sim.t,
    damagePct,
    energyUsedPct,
    costEur: spec.costEur,
    score: rounded,
    progressFraction: Math.round(progressFraction * 1000) / 1000,
    stars,
    ...(state.finished ? {} : { dnfReason: state.dnfReason ?? 'timeout' }),
    why: why(state),
  };
}

/** The "why" line for a recorded Episode. */
export function whyLine(episode: Episode): string {
  if (episode.outcome.why) return episode.outcome.why;
  return episode.outcome.finished ? 'Finished the course' : `Did not finish (${episode.outcome.dnfReason ?? 'unknown'})`;
}
