'use client';

import { memo, useMemo, type MouseEvent } from 'react';
import type { TerrainId } from '@rivetrun/contracts';
import { LAB_PLAYER, defOf, stepCell, tileAt, type AgentState, type Cell, type Dir, type LabObjectKind, type LabState } from '@rivetrun/lab';
// The rover and the ground colours of the run view, so the board reads as the same game. From the module itself:
// the game's index also exports its 3D scene.
import { ROBOT_COLORS, RobotGlyph, terrainTile } from '@/game/glyph';
import { TILE as T, inView, knownTiles, poseOf, shortId as short, trueTiles, type TileView } from './boardModel';
import { Plate, SpriteGlyph, SpriteMover, SpriteRover, SpriteTiles } from './LabSprites';
import { floorSprite, objectSprite, roverSprite, useLabSprites, type SpriteId } from './sprites';

/** Floor a ranger has mapped: free, ground type not known. */
const FLOOR = '#1b212a';
const ground = (terrain: TerrainId | undefined): string => (terrain ? terrainTile(terrain) : FLOOR);
const HEADING_DEG: Readonly<Record<Dir, number>> = { N: 0, E: 90, S: 180, W: 270 };

interface TilesProps {
  readonly tiles: readonly (TileView & { readonly sensed?: boolean })[];
}

/** The ground layer. Redrawn only when the robot's map changes, not on every frame. */
const Tiles = memo(function Tiles({ tiles }: TilesProps) {
  return (
    <g>
      {tiles.map((tile) => {
        const x = tile.x * T;
        const y = tile.y * T;
        if (tile.look === 'fog') return <rect key={tile.index} x={x} y={y} width={T} height={T} fill="url(#lab-fog)" />;
        if (tile.look === 'wall') {
          return (
            <g key={tile.index}>
              <rect x={x} y={y} width={T} height={T} fill="#4b535f" />
              <rect x={x} y={y} width={T} height={3} fill="#6a7380" />
              {tile.sensed === false ? <rect x={x} y={y} width={T} height={T} fill="url(#lab-unseen)" /> : null}
            </g>
          );
        }
        return (
          <g key={tile.index}>
            <rect x={x} y={y} width={T} height={T} fill={ground(tile.terrain)} stroke="#10141a" strokeWidth={0.5} />
            {tile.look === 'door' ? <rect x={x + 2} y={y + 8} width={T - 4} height={8} rx={2} fill="#ffb27a" /> : null}
            {tile.look === 'door-open' ? <rect x={x + 2} y={y + 8} width={T - 4} height={8} rx={2} fill="none" stroke="#ffb27a" strokeWidth={1.5} strokeDasharray="3 2" /> : null}
            {tile.look === 'drop' ? (
              <g>
                <rect x={x} y={y} width={T} height={T} fill="#f8514a" opacity={0.28} />
                <path d={`M${x + 4} ${y + 7}h16M${x + 4} ${y + 12}h16M${x + 4} ${y + 17}h16`} stroke="#f8514a" strokeWidth={2} />
              </g>
            ) : null}
            {tile.look === 'ramp' ? <path d={`M${x + 6} ${y + 15}l6 -6l6 6M${x + 6} ${y + 20}l6 -6l6 6`} stroke="#fbbf24" strokeWidth={1.8} fill="none" /> : null}
            {tile.noGo ? <path d={`M${x + 6} ${y + 6}l12 12M${x + 18} ${y + 6}l-12 12`} stroke="#f8514a" strokeWidth={2} /> : null}
            {tile.visited ? <circle cx={x + T / 2} cy={y + T / 2} r={1.6} fill="#ff7a1a" opacity={0.45} /> : null}
            {tile.sensed === false ? <rect x={x} y={y} width={T} height={T} fill="url(#lab-unseen)" /> : null}
          </g>
        );
      })}
    </g>
  );
});

interface GlyphProps {
  readonly kind: LabObjectKind;
  readonly id: string;
  readonly cell: Cell;
  readonly done: boolean;
  /** A base is drawn in its owner's colour. */
  readonly rival: boolean;
}

export function Glyph({ kind, id, cell, done, rival }: GlyphProps) {
  const cx = cell.x * T + T / 2;
  const cy = cell.y * T + T / 2;
  const text = (fill: string, label = short(id)) => (
    <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="var(--font-mono)" fill={fill}>{label}</text>
  );
  const opacity = done ? 0.4 : 1;
  switch (kind) {
    case 'exit':
      return <g opacity={opacity}><rect x={cx - 10} y={cy - 10} width={20} height={20} rx={3} fill="#4ade80" />{text('#06191c', 'E')}</g>;
    case 'parcel':
      return <g opacity={opacity}><rect x={cx - 8} y={cy - 8} width={16} height={16} rx={2} fill="#ffb27a" stroke="#160b03" />{text('#160b03')}</g>;
    case 'bay':
      return <g opacity={opacity}><rect x={cx - 10} y={cy - 10} width={20} height={20} rx={3} fill="none" stroke="#ffb27a" strokeWidth={1.6} strokeDasharray="4 2" />{text('#ffb27a')}</g>;
    case 'sample':
      return <g opacity={opacity}><path d={`M${cx} ${cy - 10}l9 10l-9 10l-9 -10z`} fill="#3fd0e0" />{text('#06191c')}</g>;
    case 'lander':
      return <g opacity={opacity}><path d={`M${cx} ${cy - 10}l10 19h-20z`} fill="#edeff2" />{text('#0e1013', 'L')}</g>;
    case 'checkpoint':
      return <g><circle cx={cx} cy={cy} r={9} fill="none" stroke={done ? '#4ade80' : '#fbbf24'} strokeWidth={2} /><circle cx={cx} cy={cy} r={3} fill={done ? '#4ade80' : '#fbbf24'} /></g>;
    case 'flag':
      return <g opacity={opacity}><path d={`M${cx - 6} ${cy + 10}v-20M${cx - 6} ${cy - 9}h13l-4 5l4 5h-13`} stroke="#edeff2" strokeWidth={2} fill="#f8514a" /></g>;
    case 'home':
      return <g><rect x={cx - 10} y={cy - 10} width={20} height={20} rx={10} fill="none" stroke={rival ? '#3fd0e0' : '#ff7a1a'} strokeWidth={2} />{text(rival ? '#3fd0e0' : '#ff7a1a', 'H')}</g>;
  }
}

interface RobotProps {
  readonly agent: AgentState;
  readonly color: string;
  readonly name: string;
  /** Draw the rover's top view for its locomotion instead of the glyph. */
  readonly sprites: boolean;
  /** With sprites: the picture of what it carries. */
  readonly carried?: SpriteId;
}

function Robot({ agent, color, name, sprites, carried }: RobotProps) {
  const pose = poseOf(agent);
  const cx = pose.x * T + T / 2;
  const cy = pose.y * T + T / 2;
  if (sprites) {
    return (
      <g>
        <SpriteRover cx={cx} cy={cy} headingDeg={HEADING_DEG[agent.heading]} sprite={roverSprite(agent.build.locomotion)} color={color} {...(carried ? { carried } : {})} />
        <title>{name}</title>
      </g>
    );
  }
  return (
    <g>
      <g transform={`rotate(${HEADING_DEG[agent.heading]} ${cx} ${cy})`}>
        <RobotGlyph cx={cx} cy={cy} size={22} color={color} />
      </g>
      {agent.carrying.length > 0 ? <circle cx={cx + 8} cy={cy - 8} r={4} fill="#edeff2" stroke="#0e1013" /> : null}
      <title>{name}</title>
    </g>
  );
}

interface LabBoardProps {
  readonly state: LabState;
  /** Draw the map as it really is, with what the robot never sensed hatched over: the result view. */
  readonly reveal?: boolean;
  /** Tap on a tile, in map coordinates. */
  readonly onTile?: (cell: Cell) => void;
}

/** The top-down map as the player's robot knows it: fog where no sensor has reported, its field of view tinted, and only the traffic it can see. */
export function LabBoard({ state, reveal = false, onTile }: LabBoardProps) {
  const { map } = state.scenario;
  const me = state.agents.find((agent) => agent.id === LAB_PLAYER)!;
  // The Blender agent's sprites once they have all loaded; this file's own SVG marks until then, or when one fails.
  const sprites = useLabSprites();
  // `known` is a new array only when the robot has sensed something new, `doorsOpen` only when a door opens and
  // `weatherActive` only when the weather turns (the engine keeps unchanged arrays from step to step).
  const tiles = useMemo(() => (reveal ? trueTiles(state, me) : knownTiles(state, me)), [reveal, me.known, state.doorsOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useMemo(() => (reveal ? [] : inView(state, me)), [reveal, me.cell, me.heading, me.known, state.weatherActive, state.doorsOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // A door is drawn across its wall: turned when the wall runs north–south. The frame is part of the door itself,
  // so this reads the map and shows nothing a sensor that reported the door would not have seen.
  const turned = useMemo(
    () => new Set(map.tiles.flatMap((tile, index) => {
      const cell = { x: index % map.width, y: Math.floor(index / map.width) };
      const closed = (dir: Dir): boolean => { const kind = tileAt(map, stepCell(cell, dir)).kind; return kind === 'wall' || kind === 'door'; };
      return tile.kind === 'door' && closed('N') && closed('S') ? [index] : [];
    })),
    [map],
  );

  const click = (event: MouseEvent<SVGSVGElement>): void => {
    const svg = event.currentTarget;
    const toScreen = svg.getScreenCTM();
    if (!onTile || toScreen === null) return;
    // Through the drawing's own transform, so a letterboxed map still maps taps to the right tile.
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(toScreen.inverse());
    const cell = { x: Math.floor(point.x / T), y: Math.floor(point.y / T) };
    if (cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height) onTile(cell);
  };

  const objects = state.objects.flatMap((object) => {
    const known = me.knownObjects[object.id];
    // Carried things ride on the robot; delivered ones are gone.
    if (object.status === 'carried' || object.status === 'delivered' || (!reveal && known === undefined)) return [];
    const def = defOf(state.scenario, object.id);
    return [{ def, cell: reveal ? object.at : known!.at, done: object.status === 'scanned' }];
  });
  /** With sprites: the picture of the first thing a robot carries; the flag takes the colour of whoever holds it. */
  const carriedBy = (agent: AgentState): SpriteId | undefined => {
    const first = agent.carrying[0];
    if (!sprites || first === undefined) return undefined;
    const kind = defOf(state.scenario, first).kind;
    return kind === 'flag' && agent.id !== LAB_PLAYER ? 'flag_cyan' : objectSprite(kind);
  };
  const movers = state.movers.flatMap((mover) => {
    const seen = me.visibleMovers.find((m) => m.id === mover.id);
    if (!reveal && seen === undefined) return [];
    const from = mover.route[mover.index]!;
    const to = mover.route[(mover.index + 1) % mover.route.length]!;
    const headingDeg = to.x > from.x ? 90 : to.x < from.x ? 270 : to.y > from.y ? 180 : 0;
    return [{ id: mover.id, x: from.x + (to.x - from.x) * mover.progress, y: from.y + (to.y - from.y) * mover.progress, named: reveal || seen!.labelled, headingDeg }];
  });
  // A camera or a drone names the other robot; a ranger only reports something moving, as it does for a forklift.
  const named = (id: string): boolean => reveal || me.visibleRivals.some((r) => r.id === id && r.labelled);
  const rivals = state.agents.filter((agent) => agent.id !== LAB_PLAYER && named(agent.id));
  const carriedMine = carriedBy(me);
  const blips = reveal ? [] : state.agents.filter((agent) => agent.id !== LAB_PLAYER && !named(agent.id) && me.visibleRivals.some((r) => r.id === agent.id)).map((agent) => ({ id: agent.id, ...poseOf(agent) }));

  return (
    <svg
      viewBox={`0 0 ${map.width * T} ${map.height * T}`}
      className="block h-auto w-full touch-manipulation select-none rounded-xl border border-line bg-slate-deep max-lg:landscape:max-h-[calc(100dvh-96px)] lg:max-h-[calc(100dvh-150px)]"
      role="img"
      aria-label={reveal ? 'The whole map, with what the robot never sensed hatched over' : 'Top-down map as your robot knows it'}
      onClick={click}
      data-testid="scenario-board"
      data-sprites={sprites ? 'on' : 'off'}
    >
      <defs>
        <pattern id="lab-fog" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={6} height={6} fill="#0a0c0f" />
          <rect width={1} height={6} fill="#151a20" />
        </pattern>
        <pattern id="lab-unseen" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={3} height={6} fill="#0a0c0f" opacity={0.62} />
        </pattern>
      </defs>
      {sprites ? <SpriteTiles tiles={tiles} floor={floorSprite(state.scenario)} usual={state.scenario.defaultTerrain} indoor={state.scenario.indoor} turned={turned} /> : <Tiles tiles={tiles} />}
      {view.map((index) => (
        <rect key={index} x={(index % map.width) * T} y={Math.floor(index / map.width) * T} width={T} height={T} fill="#3fd0e0" opacity={sprites ? 0.2 : 0.09} pointerEvents="none" />
      ))}
      {objects.map(({ def, cell, done }) => {
        const glyph = <Glyph key={def.id} kind={def.kind} id={def.id} cell={cell} done={done} rival={def.owner !== undefined && def.owner !== LAB_PLAYER} />;
        if (!sprites) return glyph;
        if (objectSprite(def.kind) !== undefined) return <SpriteGlyph key={def.id} kind={def.kind} id={def.id} cell={cell} done={done} />;
        // No sprite for this kind: the SVG mark, on a plate so it reads on the lighter floor.
        return <g key={def.id}><Plate cell={cell} />{glyph}</g>;
      })}
      {[...movers, ...blips.map((blip) => ({ ...blip, named: false, headingDeg: 0 }))].map((mover) => sprites && mover.named ? (
        <SpriteMover key={mover.id} cx={mover.x * T + T / 2} cy={mover.y * T + T / 2} headingDeg={mover.headingDeg} />
      ) : (
        <g key={mover.id}>
          <rect x={mover.x * T + 3} y={mover.y * T + 3} width={T - 6} height={T - 6} rx={3} fill="#fbbf24" stroke="#160b03" />
          <text x={mover.x * T + T / 2} y={mover.y * T + T / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="var(--font-mono)" fill="#160b03">{mover.named ? 'F' : '?'}</text>
        </g>
      ))}
      {rivals.map((agent) => {
        const carried = carriedBy(agent);
        return <Robot key={agent.id} agent={agent} color={ROBOT_COLORS.rival} name={agent.label} sprites={sprites} {...(carried ? { carried } : {})} />;
      })}
      <Robot agent={me} color={ROBOT_COLORS.player} name="Your robot" sprites={sprites} {...(carriedMine ? { carried: carriedMine } : {})} />
    </svg>
  );
}
