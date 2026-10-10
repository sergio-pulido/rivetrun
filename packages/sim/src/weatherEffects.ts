import type { Build, Mission, PartId } from '@rivetrun/contracts';
import { PARTS_BY_ID, TERRAINS, TUNING } from './data';
import { deriveSpec } from './spec';
import { WEATHER, cameraFactor, canScan, capacityFactor, rangerFactor } from './weather';

export interface WeatherEffect {
  readonly id: string;
  readonly label: string;
  /** What it does to this build, with this build's numbers. */
  readonly detail: string;
  readonly affects: 'grip' | 'battery' | 'sensing' | 'drag' | 'traction' | 'other';
  readonly severity: 'info' | 'warn' | 'bad';
}

const one = (value: number): string => (Math.round(value * 10) / 10).toString();
const RANGER_NAME = { lidar: 'Lidar', tof: 'ToF', ultrasonic: 'Ultrasonic' } as const;

/** Every weather effect active on this mission for this build, from the same numbers the physics uses. Empty when calm and clear. */
export function weatherEffects(build: Build, mission: Mission): WeatherEffect[] {
  const spec = deriveSpec(build);
  const conditions = mission.conditions ?? {};
  const environment = { weather: mission.weather, frictionJitter: 1, sensorNoiseSeed: 0, ...(mission.conditions ? { conditions: mission.conditions } : {}) };
  const effects: WeatherEffect[] = [];
  const terrains = new Set(mission.track.segments.map((segment) => segment.terrain));

  if (mission.weather === 'rain') {
    const rain = TUNING.weather.rain;
    effects.push({ id: 'rain_grip', label: 'Rain', detail: `Grip ×${rain.frictionFactor} on every surface${terrains.has('mud') ? `; the robot sinks ×${rain.mudSinkageFactor} deeper in mud` : ''}`, affects: 'grip', severity: 'warn' });
  }
  if (mission.weather === 'cold' && terrains.has('ice')) {
    effects.push({ id: 'cold_ice', label: 'Cold', detail: `Ice grip ×${TUNING.weather.cold.iceFrictionFactor}`, affects: 'grip', severity: 'info' });
  }

  const capacity = capacityFactor(environment);
  if (capacity < 1) {
    const label = conditions.temperatureC !== undefined ? `Cold ${conditions.temperatureC} °C` : 'Cold';
    effects.push({
      id: 'cold_capacity', label,
      detail: `Usable battery capacity ×${one(capacity)}: ${one(spec.capacityWh * capacity)} Wh instead of ${one(spec.capacityWh)} Wh`,
      affects: 'battery', severity: capacity <= 0.7 ? 'bad' : 'warn',
    });
  }

  const wind = conditions.windMps ?? 0;
  const gust = conditions.gustMps ?? 0;
  const dragAt = (headwind: number): number => {
    const relative = spec.topSpeedMps + headwind;
    return 0.5 * WEATHER.airDensity * WEATHER.dragAreaM2 * relative * Math.abs(relative);
  };
  if (wind !== 0) {
    const drag = dragAt(wind);
    const share = Math.abs(drag) / spec.motorForceN;
    effects.push(wind > 0
      ? { id: 'headwind', label: `Headwind ${one(wind)} m/s`, detail: `Air drag ${one(drag)} N at top speed, ${Math.round(share * 100)} % of this build's drive force: more energy per metre`, affects: 'drag', severity: share >= 0.25 ? 'bad' : share >= 0.1 ? 'warn' : 'info' }
      : { id: 'tailwind', label: `Tailwind ${one(-wind)} m/s`, detail: `The wind pushes with ${one(-drag)} N at top speed: less energy per metre`, affects: 'drag', severity: 'info' });
  }
  if (gust > 0) {
    const peak = dragAt(wind + gust);
    // The lowest-grip surface on the track decides whether a gust can stop the robot.
    const grip = Math.min(...[...terrains].map((terrain) => TERRAINS[terrain].baseFriction * (spec.grip[terrain] ?? 1) * (mission.weather === 'rain' ? TUNING.weather.rain.frictionFactor : 1)));
    const holds = grip * spec.massKg * 9.81;
    const felt = spec.sources.includes('imu') ? 'the IMU feels each one' : 'no IMU: this build cannot feel them';
    effects.push({
      id: 'gusts', label: `Gusts to ${one(wind + gust)} m/s`,
      detail: `Up to ${one(peak)} N against the robot for 1.5–3 s; its tyres hold ${one(holds)} N on the slipperiest ground here. ${felt[0]!.toUpperCase()}${felt.slice(1)}`,
      affects: 'traction', severity: peak >= holds ? 'bad' : 'warn',
    });
  }

  const cameraRange = spec.sensorRangeM.camera;
  const seeing = cameraFactor(environment, { nightVision: spec.nightVision === true, lights: spec.autoLights === true });
  const why = [mission.weather === 'rain' ? 'rain' : '', conditions.precipitation === 'snow' ? 'snowfall' : '', conditions.visibility === 'fog' ? 'fog' : '', conditions.visibility === 'night' ? 'night' : ''].filter(Boolean).join(' + ');
  if (cameraRange !== undefined && seeing < 1) {
    effects.push({ id: 'camera_range', label: why[0]!.toUpperCase() + why.slice(1), detail: `Camera range ${one(cameraRange * seeing)} m instead of ${one(cameraRange)} m${conditions.visibility === 'night' && spec.autoLights ? ' with the headlights on' : ''}`, affects: 'sensing', severity: seeing <= 0.4 ? 'bad' : 'warn' });
  } else if (cameraRange !== undefined && conditions.visibility === 'night') {
    effects.push({ id: 'camera_night_ok', label: 'Night', detail: `This camera sees in the dark: full ${one(cameraRange)} m range`, affects: 'sensing', severity: 'info' });
  }
  const droneRange = spec.sensorRangeM.scout_drone;
  const droneSeeing = cameraFactor(environment, { aboveRain: true });
  if (droneRange !== undefined && droneSeeing < 1) {
    effects.push({ id: 'drone_range', label: 'Scout drone', detail: `Sees ${one(droneRange * droneSeeing)} m instead of ${one(droneRange)} m`, affects: 'sensing', severity: 'warn' });
  }
  const rangerRange = spec.sensorRangeM.ultrasonic;
  if (rangerRange !== undefined) {
    const source = spec.rangerSource === 'lidar' || spec.rangerSource === 'tof' ? spec.rangerSource : 'ultrasonic';
    const reach = rangerFactor(environment, source);
    if (reach < 1) effects.push({ id: 'ranger_range', label: RANGER_NAME[source], detail: `Range ${one(rangerRange * reach)} m instead of ${one(rangerRange)} m: droplets and flakes scatter the beam`, affects: 'sensing', severity: 'warn' });
    else if (seeing < 1 || conditions.visibility === 'night' || conditions.visibility === 'fog') effects.push({ id: 'ranger_ok', label: RANGER_NAME[source], detail: `Keeps its full ${one(rangerRange)} m in this weather`, affects: 'sensing', severity: 'info' });
  }

  if (conditions.visibility === 'night') {
    const cameraZones = (mission.scanZones ?? []).filter((zone) => zone.needs.includes('camera') || zone.needs.includes('scout_drone'));
    const lost = cameraZones.filter((zone) => !canScan(spec, environment, zone));
    if (lost.length > 0 && (cameraRange !== undefined || droneRange !== undefined)) {
      effects.push({ id: 'night_scan', label: 'Night', detail: `Too dark to scan the ${lost.map((zone) => zone.label).join(', ')}: a camera scan at night needs a NoIR camera or a light sensor for the headlights`, affects: 'sensing', severity: 'bad' });
    }
  }
  if (terrains.has('snow')) {
    const mu = TERRAINS.snow.baseFriction * (spec.grip.snow ?? 1);
    effects.push({ id: 'snow_ground', label: 'Snow on the ground', detail: `Grip ${one(mu * 100) }% of the robot's weight with this locomotion (ice: ${one(TERRAINS.ice.baseFriction * (spec.grip.ice ?? 1) * 100)} %), and it sinks in`, affects: 'traction', severity: mu < 0.25 ? 'bad' : mu < 0.4 ? 'warn' : 'info' });
  }
  return effects;
}

/** Where a part matters in weather, for its part sheet. Empty when weather does not change what the part does. */
export function partWeatherNotes(partId: PartId): string[] {
  const part = PARTS_BY_ID.get(partId);
  if (!part) return [];
  const { effects } = part;
  const notes: string[] = [];
  if (effects.sensor === 'camera') {
    if (effects.nightVision) notes.push('Night: keeps its full range and can scan');
    else notes.push(`Night: range ×${WEATHER.camera.night}, and it cannot scan without headlights`);
    notes.push(`Fog: range ×${WEATHER.camera.fog}`, `Rain: range ×${TUNING.weather.rain.cameraRangeFactor}`, `Snowfall: range ×${WEATHER.camera.snow}`);
  }
  if (effects.sensor === 'scout_drone') notes.push('Rain: flies above it, full range', `Fog: range ×${WEATHER.camera.fog}`, `Night: range ×${WEATHER.camera.night}`, `Snowfall: range ×${WEATHER.camera.snow}`);
  if (effects.sensor === 'ultrasonic' && (effects.source === 'lidar' || effects.source === 'tof')) notes.push('Night: keeps its full range', `Fog: range ×${WEATHER.light.fog}`, `Heavy rain or snowfall: range ×${WEATHER.light.heavyRain}`);
  else if (effects.sensor === 'ultrasonic') notes.push('Fog, rain, snow and darkness do not change its range');
  if (effects.autoLights) notes.push(`Night: headlights on, an ordinary camera keeps ×${WEATHER.camera.nightWithLights} of its range instead of ×${WEATHER.camera.night} and can scan`);
  if (effects.sensor === 'imu') notes.push('Wind: feels gusts as they hit, so the driver can react');
  if (part.slot === 'battery') notes.push(`Cold: about ${WEATHER.capacityLossPerC * 100} % less usable capacity per °C below 20 °C`);
  if (part.slot === 'locomotion' && effects.grip?.snow !== undefined) notes.push(`Snow: grip ×${effects.grip.snow}`);
  return notes;
}
