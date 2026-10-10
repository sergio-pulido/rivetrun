/**
 * What the game simplifies, in one sentence each, with the screen it belongs on (overnight program, honesty guardrail).
 * The UI shows these as written; the numbers are the ones the physics uses.
 */
export interface Simplification {
  readonly id: string;
  readonly sentence: string;
  /** Where the player should meet it. */
  readonly screen: 'part sheet' | 'brief weather card' | 'brief objectives' | 'workshop senses' | 'drive coach marks' | 'lab';
  /** The part or mission it is about, when it is about one. */
  readonly partId?: string;
  readonly missionId?: string;
}

export const SIMPLIFICATIONS: readonly Simplification[] = [
  { id: 'noir_range', screen: 'part sheet', partId: 'camera_module_3_noir', sentence: 'The maker gives no range for this camera: the 6 m is the game camera\'s, and it is assumed fitted with IR lamps.' },
  { id: 'light_sensor_headlights', screen: 'part sheet', partId: 'ambient_light_veml7700', sentence: 'The real sensor only measures light. Switching headlights on with it is a game rule.' },
  { id: 'night_scan', screen: 'brief objectives', missionId: 'M9', sentence: 'A camera scan in the dark needs a NoIR camera or headlights: a game rule.' },
  { id: 'weather_sensor_factors', screen: 'part sheet', sentence: 'Sensor ranges in rain, fog, snow and darkness are fixed factors chosen for the game, not measurements.' },
  { id: 'puddles', screen: 'brief weather card', missionId: 'M8', sentence: 'The puddle on the ridge is a short stretch of 4 cm water, not a separate model.' },
  { id: 'wind_drag_only', screen: 'brief weather card', sentence: 'Wind acts only along the track, as drag on an estimated 0.04 m² of rover: no crosswind and no tipping.' },
  { id: 'gusts_seeded', screen: 'brief weather card', sentence: 'Gusts come at fixed moments for a given seed: the same run always meets the same gusts.' },
  { id: 'cold_capacity', screen: 'brief weather card', sentence: 'Cold takes about 1 % of usable battery per °C below 20 °C, down to half: a rule of thumb for LiPo packs, not a cell model.' },
  { id: 'snow_model', screen: 'brief weather card', missionId: 'M9', sentence: 'Snow is one surface with low grip and sinkage: no drifts, packing or melting.' },
  { id: 'core_kit', screen: 'workshop senses', sentence: 'Every robot knows its speed, distance, charge and current draw: the game assumes wheel encoders and a power sensor on the base rover.' },
  { id: 'air_levelling', screen: 'drive coach marks', sentence: 'In the air the robot levels itself, for you and for every brain: a game rule. A real rover has no such control.' },
  { id: 'charged_jump', screen: 'drive coach marks', sentence: 'Holding the jump button 0.3 to 1 second gives 40 to 100 % of the piston\'s push: a game curve, not a measured one.' },
  // One robot, two simulations: where the grid of the Lab Missions differs from the track.
  { id: 'lab_grid', screen: 'lab', sentence: 'Lab Missions run on a grid of tiles: mass, top speed, battery and sensor ranges come from the same build, the motion does not use the track\'s physics.' },
  { id: 'lab_ultrasonic_adjacent', screen: 'lab', partId: 'ultrasonic', sentence: 'On the grid the ultrasonic senses only the four tiles next to the robot; on the track it ranges 3 m ahead.' },
  { id: 'lab_load_speed', screen: 'lab', sentence: 'On the grid a loaded motor turns up to 60 % slower; on the track speed comes out of the forces on the robot.' },
  { id: 'lab_weather', screen: 'lab', sentence: 'Lab weather uses range factors set per scenario, not the track\'s wind, cold and visibility model.' },
  { id: 'lab_lidar_all_round', screen: 'lab', partId: 'lidar_rplidar_c1', sentence: 'On the grid the lidar sees walls and moving things all round, in line of sight; on the track it is a forward ranger.' },
  { id: 'lab_ramp_both_ways', screen: 'lab', sentence: 'A ramp tile costs as a climb in both directions: the grid has no height, so it cannot tell which way is down.' },
  { id: 'lab_forklift', screen: 'lab', sentence: 'A forklift turns back for a robot standing in its way and only hits one that drives onto its tile or the tile it is heading for.' },
];
