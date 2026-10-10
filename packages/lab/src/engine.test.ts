import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { command, createLab, setPace, stepLab } from './engine';
import { expandRoute, indexOf, lineOfSight, markerCell, parseMap, roomCells } from './grid';
import { deriveRobot, tileMotion } from './robot';
import { BASE, drive, last, scenarioOf, withSensors, you } from './testkit';
import type { Cell, KnownTile, LabScenario, LabState, LabTrigger } from './types';

const CORRIDOR = ['############', '#S.........#', '############'];
const start = (scenario: LabScenario, build: Build, seed = 1): LabState => createLab({ scenario, seed, entries: [{ agentId: 'you', build }] });
const knownAt = (state: LabState, cell: Cell): KnownTile | undefined => you(state).known[indexOf(state.scenario.map, cell)];
const knownCount = (state: LabState): number => you(state).known.filter((tile) => tile !== undefined).length;
const triggers = (states: readonly LabState[]): LabTrigger[] => states.flatMap((state) => you(state).trigger ?? []);

describe('grid', () => {
  it('parses tiles, terrain and markers, and rejects a ragged map', () => {
    const map = parseMap(['#####', '#S+^#', '#>sE#', '#####'], { defaultTerrain: 'grass', rampDeg: 20 });
    expect([map.width, map.height]).toEqual([5, 4]);
    expect(map.tiles[indexOf(map, { x: 2, y: 1 })]).toMatchObject({ kind: 'door' });
    expect(map.tiles[indexOf(map, { x: 3, y: 1 })]).toMatchObject({ kind: 'ramp', slopeDeg: 20 });
    expect(map.tiles[indexOf(map, { x: 1, y: 2 })]).toMatchObject({ kind: 'drop' });
    expect(map.tiles[indexOf(map, { x: 2, y: 2 })]).toMatchObject({ kind: 'floor', terrain: 'sand' });
    expect(markerCell(map, 'S')).toEqual({ x: 1, y: 1 });
    expect(map.tiles[indexOf(map, markerCell(map, 'E'))]).toMatchObject({ kind: 'floor', terrain: 'grass' });
    expect(() => parseMap(['###', '##'], { defaultTerrain: 'grass' })).toThrow(/row 1 is 2 wide/);
    expect(() => parseMap(['#?#'], { defaultTerrain: 'grass' })).toThrow(/unknown map character/);
  });

  it('finds a room by flood fill, stopping at walls and doors', () => {
    const map = parseMap(['#######', '#A.+B.#', '#..#..#', '#######'], { defaultTerrain: 'asphalt' });
    expect(roomCells(map, markerCell(map, 'A'))).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }].map((c) => indexOf(map, c)).sort((a, b) => a - b));
  });

  it('expands mover routes: a cycle closes, a bounce walks back', () => {
    expect(expandRoute([{ x: 0, y: 0 }, { x: 2, y: 0 }], 'bounce')).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }]);
    expect(expandRoute([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 'cycle')).toHaveLength(4);
    expect(() => expandRoute([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'bounce')).toThrow(/straight lines/);
  });

  it('line of sight stops at an opaque cell between the two ends', () => {
    const wall = (cell: Cell): boolean => cell.x === 2;
    expect(lineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 }, wall)).toBe(false);
    expect(lineOfSight({ x: 0, y: 0 }, { x: 2, y: 0 }, wall)).toBe(true);
    expect(lineOfSight({ x: 0, y: 0 }, { x: 0, y: 5 }, wall)).toBe(true);
    // Two walls touching at a corner leave no gap to look through.
    const corner = (cell: Cell): boolean => (cell.x === 1 && cell.y === 0) || (cell.x === 0 && cell.y === 1);
    expect(lineOfSight({ x: 0, y: 0 }, { x: 2, y: 2 }, corner)).toBe(false);
    expect(lineOfSight({ x: 0, y: 0 }, { x: 2, y: 2 }, (cell) => cell.x === 1 && cell.y === 0)).toBe(true);
  });
});

describe('speed and energy come from the build', () => {
  const light: Build = { ...BASE, motor: 'motor_light' };
  const small: Build = { ...BASE, battery: 'battery_small' };
  const tracked: Build = { ...BASE, locomotion: 'tracks' };
  const runCorridor = (build: Build, pace: 'full' | 'eco' = 'full') => last(drive(setPace(start(scenarioOf(CORRIDOR), build), 'you', pace), { type: 'heading', dir: 'E' }));

  it('the light motor crosses the corridor sooner than the torque motor', () => {
    const fast = runCorridor(light);
    const slow = runCorridor(BASE);
    expect(you(fast).cell).toEqual({ x: 10, y: 1 });
    expect(you(slow).cell).toEqual({ x: 10, y: 1 });
    expect(fast.t).toBeLessThan(slow.t * 0.8);
  });

  it('the same drive takes a bigger share of the small battery', () => {
    expect(100 - you(runCorridor(small)).batteryPct).toBeGreaterThan((100 - you(runCorridor(BASE)).batteryPct) * 3);
  });

  it('eco pace is slower and cheaper per tile than full pace', () => {
    const full = runCorridor(BASE, 'full');
    const eco = runCorridor(BASE, 'eco');
    expect(eco.t).toBeGreaterThan(full.t * 1.2);
    expect(100 - you(eco).batteryPct).toBeLessThan((100 - you(full).batteryPct) * 0.85);
  });

  it('soft ground costs wheels more than tracks, and a steep ramp stops the build that cannot climb it', () => {
    const wheels = deriveRobot({ ...BASE, locomotion: 'wheels' }).spec;
    const tracks = deriveRobot(tracked).spec;
    const onSand = (spec: typeof wheels) => { const m = tileMotion(spec, 'sand', 0, 'full'); return m.ok ? m.drawW / m.speedMps : Infinity; };
    const onAsphalt = (spec: typeof wheels) => { const m = tileMotion(spec, 'asphalt', 0, 'full'); return m.ok ? m.drawW / m.speedMps : Infinity; };
    expect(onSand(wheels)).toBeGreaterThan(onAsphalt(wheels) * 1.5);
    expect(onSand(wheels) / onAsphalt(wheels)).toBeGreaterThan(onSand(tracks) / onAsphalt(tracks));
    expect(tileMotion(wheels, 'asphalt', 22, 'full')).toEqual({ ok: false, reason: 'tip' });
    expect(tileMotion(tracks, 'asphalt', 22, 'full').ok).toBe(true);
    expect(tileMotion(deriveRobot({ ...BASE, locomotion: 'wheels', extras: ['winch'] }).spec, 'asphalt', 22, 'full').ok).toBe(true);
  });
});

describe('fog of war is the sensor coverage', () => {
  const ROOM = [
    '###########',
    '#.........#',
    '#....S....#',
    '#.........#',
    '#####.#####',
    '#.........#',
    '###########',
  ];
  const at = (x: number, y: number): Cell => ({ x, y });

  it('no sensor: only the tile the robot is on', () => {
    const state = start(scenarioOf(ROOM), BASE);
    expect(knownCount(state)).toBe(1);
    expect(knownAt(state, at(5, 2))).toMatchObject({ blocked: false, visited: true });
    expect(knownAt(state, at(5, 2))?.terrain).toBeUndefined();
  });

  it('ultrasonic: the four tiles next to the robot, wall or free, nothing further', () => {
    const state = start(scenarioOf(['#####', '#.S.#', '#...#', '#####']), withSensors('ultrasonic'));
    expect(knownCount(state)).toBe(5);
    expect(knownAt(state, at(2, 0))).toMatchObject({ blocked: true, via: 'ultrasonic' });
    expect(knownAt(state, at(3, 1))).toMatchObject({ blocked: false, via: 'ultrasonic' });
    expect(knownAt(state, at(3, 2))).toBeUndefined();
  });

  it('lidar: walls all round in line of sight, but no labels and nothing behind a wall', () => {
    const scenario = scenarioOf(ROOM, { objects: [{ id: 'p', kind: 'parcel', label: 'Parcel', at: at(8, 2) }] });
    const state = start(scenario, withSensors('lidar_rplidar_c1'));
    expect(knownAt(state, at(1, 1))).toMatchObject({ blocked: false, via: 'lidar' });
    expect(knownAt(state, at(0, 2))).toMatchObject({ blocked: true, kind: 'wall' });
    expect(knownAt(state, at(1, 2))?.terrain).toBeUndefined();
    // Behind the wall, out of the doorway's line.
    expect(knownAt(state, at(1, 5))).toBeUndefined();
    // Straight through the doorway.
    expect(knownAt(state, at(5, 5))).toMatchObject({ blocked: false });
    // The parcel is in plain view of the lidar and still unknown: a ranger gives geometry, not things.
    expect(you(state).knownObjects.p).toBeUndefined();
  });

  it('camera: a cone ahead with labels, ground type and objects; nothing behind', () => {
    const scenario = scenarioOf(ROOM, { objects: [{ id: 'p', kind: 'parcel', label: 'Parcel', at: at(8, 2) }, { id: 'q', kind: 'parcel', label: 'Other', at: at(2, 2) }] });
    const state = start(scenario, withSensors('camera'));
    expect(knownAt(state, at(7, 2))).toMatchObject({ blocked: false, kind: 'floor', terrain: 'asphalt', via: 'camera' });
    expect(knownAt(state, at(4, 2))).toBeUndefined();
    expect(you(state).knownObjects.p).toMatchObject({ at: at(8, 2), via: 'camera' });
    expect(you(state).knownObjects.q).toBeUndefined();
    // Turning to face it brings the other parcel into view.
    const turned = last(drive(state, { type: 'step', dir: 'W' }));
    expect(you(turned).knownObjects.q).toMatchObject({ via: 'camera' });
  });

  it('scout drone: over the walls outdoors, line of sight under a ceiling', () => {
    const outdoors = start(scenarioOf(ROOM, { indoor: false }), withSensors('scout_drone'));
    const indoors = start(scenarioOf(ROOM, { indoor: true }), withSensors('scout_drone'));
    expect(knownAt(outdoors, at(1, 5))).toMatchObject({ blocked: false, via: 'scout_drone' });
    expect(knownAt(indoors, at(1, 5))).toBeUndefined();
    expect(knownCount(outdoors)).toBe(outdoors.scenario.map.tiles.length);
  });

  it('moisture probe: finds a soil sample on the next tile; a camera-less build without it does not', () => {
    const scenario = scenarioOf(['#####', '#S..#', '#####'], { objects: [{ id: 's1', kind: 'sample', label: 'Soil sample', at: at(2, 1), needs: ['moisture'] }] });
    expect(you(start(scenario, withSensors('moisture_probe'))).knownObjects.s1).toMatchObject({ via: 'moisture_probe' });
    expect(you(start(scenario, withSensors('ultrasonic'))).knownObjects.s1).toBeUndefined();
  });

  it('a mission plan with the floor plan gives walls and doors, but not the ground type', () => {
    const state = start(scenarioOf(['#####', '#S+s#', '#####'], { planMap: true }), BASE);
    expect(knownCount(state)).toBe(15);
    expect(knownAt(state, at(2, 1))).toMatchObject({ blocked: true, kind: 'door' });
    expect(knownAt(state, at(3, 1))?.terrain).toBeUndefined();
  });
});

describe('moving through the grid', () => {
  it('a blind robot drives into the wall, is hurt, and learns the wall is there', () => {
    const states = drive(start(scenarioOf(CORRIDOR), BASE), { type: 'heading', dir: 'E' });
    const end = last(states);
    expect(you(end).cell).toEqual({ x: 10, y: 1 });
    expect(you(end).stats.bumps).toBe(1);
    expect(you(end).damagePct).toBeGreaterThan(3);
    expect(knownAt(end, { x: 11, y: 1 })).toMatchObject({ blocked: true, kind: 'wall', via: 'core' });
    expect(triggers(states).map((t) => t.label)).toContain('BLIND · hit a wall: no distance sensor');
    expect(states.flatMap((s) => s.events).find((e) => e.type === 'bump')).toMatchObject({ blind: true, into: 'wall' });
  });

  it('a bumper halves the damage and reports the contact itself', () => {
    const bare = last(drive(start(scenarioOf(CORRIDOR), BASE), { type: 'heading', dir: 'E' }));
    const padded = last(drive(start(scenarioOf(CORRIDOR), { ...BASE, extras: ['bumper'] }), { type: 'heading', dir: 'E' }));
    expect(you(padded).damagePct).toBeLessThan(you(bare).damagePct / 2);
    expect(knownAt(padded, { x: 11, y: 1 })).toMatchObject({ via: 'bumper' });
  });

  it('a robot that senses the wall stops short of it without a scratch', () => {
    const states = drive(start(scenarioOf(CORRIDOR), withSensors('ultrasonic')), { type: 'heading', dir: 'E' });
    expect(you(last(states)).cell).toEqual({ x: 10, y: 1 });
    expect(you(last(states)).stats.bumps).toBe(0);
    expect(you(last(states)).damagePct).toBe(0);
    expect(triggers(states).map((t) => t.cause)).toContain('dead_end');
  });

  it('a door takes a second to push open and stays open', () => {
    const scenario = scenarioOf(['#######', '#S.+..#', '#######']);
    const open = last(drive(start(scenario, BASE), { type: 'heading', dir: 'E' }));
    const noDoor = last(drive(start(scenarioOf(['#######', '#S....#', '#######']), BASE), { type: 'heading', dir: 'E' }));
    expect(you(open).cell).toEqual({ x: 5, y: 1 });
    expect(open.doorsOpen).toEqual([indexOf(scenario.map, { x: 3, y: 1 })]);
    expect(open.t - noDoor.t).toBeGreaterThan(0.9);
    expect(open.t - noDoor.t).toBeLessThan(1.3);
  });

  it('a lidar cannot see a drop: the robot falls, is put back, and remembers it', () => {
    const scenario = scenarioOf(['######', '#S.>.#', '######']);
    const states = drive(start(scenario, withSensors('lidar_rplidar_c1')), { type: 'heading', dir: 'E' });
    const end = last(states);
    expect(you(end).stats.falls).toBe(1);
    expect(you(end).cell).toEqual({ x: 2, y: 1 });
    expect(you(end).damagePct).toBe(25);
    expect(knownAt(end, { x: 3, y: 1 })).toMatchObject({ kind: 'drop' });
    expect(triggers(states).map((t) => t.cause)).toContain('fell');
    // It will not drive onto it a second time.
    const again = last(drive(end, { type: 'heading', dir: 'E' }));
    expect(you(again).stats.falls).toBe(1);
    expect(you(again).cell).toEqual({ x: 2, y: 1 });
  });

  it('a camera sees the drop and the robot stops before it', () => {
    const states = drive(start(scenarioOf(['######', '#S.>.#', '######']), withSensors('camera')), { type: 'heading', dir: 'E' });
    expect(you(last(states)).stats.falls).toBe(0);
    expect(you(last(states)).cell).toEqual({ x: 2, y: 1 });
    expect(you(last(states)).damagePct).toBe(0);
  });

  it('a ramp too steep for wheels stops them; tracks drive over it', () => {
    const scenario = scenarioOf(['######', '#S.^.#', '######'], {}, 22);
    const wheels = drive(start(scenario, { ...BASE, locomotion: 'wheels' }), { type: 'heading', dir: 'E' });
    expect(you(last(wheels)).cell).toEqual({ x: 2, y: 1 });
    // Without a camera or an IMU the robot only knows it did not get there, not that it was a ramp.
    expect(triggers(wheels).find((t) => t.cause === 'blocked')?.label).toBe('CORE · cannot get onto the tile ahead: the drive stalls or spins');
    expect(knownAt(last(wheels), { x: 3, y: 1 })).toMatchObject({ noGo: true });
    expect(knownAt(last(wheels), { x: 3, y: 1 })?.kind).toBeUndefined();
    // With a camera the ramp is on its map before it gets there: it does not try.
    const sighted = drive(start(scenario, { ...BASE, locomotion: 'wheels', sensors: ['camera'] }), { type: 'heading', dir: 'E' });
    expect(knownAt(last(sighted), { x: 3, y: 1 })).toMatchObject({ kind: 'ramp', slopeDeg: 22 });
    expect(you(last(sighted)).cell).toEqual({ x: 2, y: 1 });
    expect(you(last(drive(start(scenario, { ...BASE, locomotion: 'tracks' }), { type: 'heading', dir: 'E' }))).cell).toEqual({ x: 4, y: 1 });
  });

  it('the arrow pad moves one tile and refuses a wall the robot already knows', () => {
    const state = start(scenarioOf(CORRIDOR), withSensors('ultrasonic'));
    const one = last(drive(state, { type: 'step', dir: 'E' }));
    expect(you(one).cell).toEqual({ x: 2, y: 1 });
    const refused = last(drive(one, { type: 'step', dir: 'N' }));
    expect(you(refused).cell).toEqual({ x: 2, y: 1 });
    expect(you(refused).stats.bumps).toBe(0);
  });

  it('follows a corridor round its corners without asking', () => {
    const scenario = scenarioOf(['######', '#S...#', '####.#', '#....#', '#.####', '#...E#', '######']);
    const states = drive(start(scenario, withSensors('ultrasonic')), { type: 'heading', dir: 'E' });
    expect(you(last(states)).status).toBe('complete');
    // Three corners and not one decision asked on the way: the only trigger is finding the exit under the wheels.
    expect(triggers(states).map((t) => t.cause)).toEqual(['object_seen']);
  });
});

describe('determinism', () => {
  const WAREHOUSE = ['#########', '#S......#', '#.##.##.#', '#......E#', '#########'];
  const scenario = scenarioOf(WAREHOUSE, {
    movers: [{ id: 'f1', label: 'Forklift', path: [{ x: 1, y: 3 }, { x: 6, y: 3 }], loop: 'bounce', speedMps: 1, damagePct: 30 }],
    weather: [{ id: 'storm', label: 'Dust storm', atS: 3, jitterS: 2, rangeFactor: { camera: 0.5 } }],
  });
  const play = (seed: number): LabState => {
    let state = command(start(scenario, withSensors('camera'), seed), 'you', { type: 'goto', to: { x: 7, y: 1 } });
    for (let i = 0; i < 400 && !state.done; i += 1) state = stepLab(state);
    return state;
  };

  it('the same seed and the same commands give the same run, step for step', () => {
    expect(JSON.stringify(play(7))).toBe(JSON.stringify(play(7)));
  });

  it('the seed moves the traffic and the weather, never the map', () => {
    const a = start(scenario, BASE, 1);
    const b = start(scenario, BASE, 2);
    expect(a.scenario.map).toBe(b.scenario.map);
    expect([a.movers[0]!.index, a.weather[0]!.atS]).not.toEqual([b.movers[0]!.index, b.weather[0]!.atS]);
  });

  it('stepLab does not change the state it is given', () => {
    const state = command(start(scenario, withSensors('camera'), 3), 'you', { type: 'heading', dir: 'E' });
    const before = JSON.stringify(state);
    stepLab(stepLab(state));
    expect(JSON.stringify(state)).toBe(before);
  });
});
