'use client';

// The board drawn with the Blender agent's sprites. Same marks in the same places as the SVG board in LabBoard.tsx,
// which stays as the fallback; what a mark means does not change with how it is drawn.
import { memo, type ReactNode } from 'react';
import type { TerrainId } from '@rivetrun/contracts';
import type { Cell, LabObjectKind } from '@rivetrun/lab';
import { terrainTile } from '@/game/glyph';
import { TILE as T, shortId, type TileView } from './boardModel';
import { DOOR_FRAME, SPRITES, SPRITE_PX, objectSprite, spriteUrl, type SpriteBox, type SpriteId } from './sprites';

const INK = '#0e1013';
const HAZARD = '#f8514a';
/**
 * The sprites are drawn for a light sheet; the app is dark. These veils of ink keep the board in the app's key and
 * the order the SVG board has: walls lightest, ground the robot has looked at next, ground it only has on its map
 * darker, fog darkest. Robots and things are not veiled, so they stand out.
 */
const VEIL = { wall: 0.3, seen: 0.36, mapped: 0.7 } as const;

interface SpriteProps {
  readonly id: SpriteId;
  /** The part of the file to draw. Default: the sprite's drawn part. */
  readonly box?: SpriteBox;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Fill the box exactly instead of keeping the sprite's proportions. */
  readonly stretch?: boolean;
}

/** One sprite, or a part of it, fitted into a box of the map. */
export function Sprite({ id, box = SPRITES[id], x, y, width, height, stretch = false }: SpriteProps) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox={box.join(' ')} preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'}>
      <image href={spriteUrl(id)} width={SPRITE_PX} height={SPRITE_PX} />
    </svg>
  );
}

/** A door in the middle of a tile. `turned` = it stands in a wall that runs north–south. */
export function DoorSprite({ x, y, open, turned }: { readonly x: number; readonly y: number; readonly open: boolean; readonly turned: boolean }) {
  const frameH = (T * DOOR_FRAME[3]) / DOOR_FRAME[2];
  return (
    <g transform={turned ? `rotate(90 ${x + T / 2} ${y + T / 2})` : undefined}>
      {open ? (
        <Sprite id="door" x={x} y={y} width={T} height={T} />
      ) : (
        <>
          <Sprite id="door" box={DOOR_FRAME} x={x} y={y + (T - frameH) / 2} width={T} height={frameH} stretch />
          <rect x={x + 3.5} y={y + T / 2 - 2.5} width={T - 7} height={5} rx={1} fill="#ffb27a" stroke={INK} strokeWidth={0.7} />
        </>
      )}
    </g>
  );
}

/** Stairs down: the sprite, ringed in the hazard colour because driving onto it is a fall. */
export function StairsSprite({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g>
      <Sprite id="stairs" x={x} y={y} width={T} height={T} stretch />
      <rect x={x + 1} y={y + 1} width={T - 2} height={T - 2} fill="none" stroke={HAZARD} strokeWidth={2} />
    </g>
  );
}

type SpriteTile = TileView & { readonly sensed?: boolean };

interface SpriteTileMarkProps {
  readonly tile: SpriteTile;
  readonly floor: SpriteId;
  /** The scenario's usual ground: drawn with the floor sprite. Any other ground keeps its own colour. */
  readonly usual: TerrainId;
  readonly indoor: boolean;
  /** A door that stands in a wall running north–south. */
  readonly turned: boolean;
}

const sameTile = (a: SpriteTile, b: SpriteTile): boolean =>
  a.index === b.index && a.x === b.x && a.y === b.y && a.look === b.look && a.terrain === b.terrain && a.visited === b.visited && a.noGo === b.noGo && a.sensed === b.sensed;

/**
 * One tile of the ground layer. The robot's map changes a few tiles at a time and is rebuilt as new objects each
 * time, so a tile compares what it shows, not which object it was given: only the tiles that changed are redrawn.
 */
const SpriteTileMark = memo(function SpriteTileMark({ tile, floor, usual, indoor, turned }: SpriteTileMarkProps) {
  const x = tile.x * T;
  const y = tile.y * T;
  // On the result map: never reported by a sensor. Darkened first, or the hatch flickers on the light walls.
  const unseen = tile.sensed === false ? (
    <g>
      <rect x={x} y={y} width={T} height={T} fill={INK} opacity={0.45} />
      <rect x={x} y={y} width={T} height={T} fill="url(#lab-unseen)" />
    </g>
  ) : null;
  if (tile.look === 'fog') return <rect x={x} y={y} width={T} height={T} fill="url(#lab-fog)" />;
  if (tile.look === 'wall') {
    return (
      <g>
        {indoor ? (
          <>
            <Sprite id="wall" x={x} y={y} width={T} height={T} stretch />
            <rect x={x} y={y} width={T} height={T} fill={INK} opacity={VEIL.wall} />
          </>
        ) : (
          // Outdoors a wall is rock, not a partition: the plain block of the SVG board.
          <>
            <rect x={x} y={y} width={T} height={T} fill="#4b535f" />
            <rect x={x} y={y} width={T} height={3} fill="#6a7380" />
          </>
        )}
        {unseen}
      </g>
    );
  }
  const other = tile.terrain !== undefined && tile.terrain !== usual;
  // A ranger maps floor without seeing what the ground is: the same floor, in the dark.
  const veil = tile.terrain === undefined ? VEIL.mapped : other ? 0 : VEIL.seen;
  return (
    <g>
      {other ? (
        <rect x={x} y={y} width={T} height={T} fill={terrainTile(tile.terrain!, 0.45)} />
      ) : (
        // The whole file, half a unit over each side: its soft edge falls under the neighbours and the grid line.
        <image href={spriteUrl(floor)} x={x - 0.5} y={y - 0.5} width={T + 1} height={T + 1} preserveAspectRatio="none" />
      )}
      <rect x={x} y={y} width={T} height={T} fill={INK} fillOpacity={veil} stroke="#10141a" strokeWidth={0.5} strokeOpacity={0.7} />
      {tile.look === 'door' || tile.look === 'door-open' ? <DoorSprite x={x} y={y} open={tile.look === 'door-open'} turned={turned} /> : null}
      {tile.look === 'drop' && indoor ? <StairsSprite x={x} y={y} /> : null}
      {tile.look === 'drop' && !indoor ? (
        <g>
          <rect x={x} y={y} width={T} height={T} fill={HAZARD} opacity={0.4} />
          <path d={`M${x + 4} ${y + 7}h16M${x + 4} ${y + 12}h16M${x + 4} ${y + 17}h16`} stroke={HAZARD} strokeWidth={2} />
        </g>
      ) : null}
      {tile.look === 'ramp' ? (
        <g fill="none">
          <path d={`M${x + 6} ${y + 15}l6 -6l6 6M${x + 6} ${y + 20}l6 -6l6 6`} stroke={INK} strokeWidth={3.6} />
          <path d={`M${x + 6} ${y + 15}l6 -6l6 6M${x + 6} ${y + 20}l6 -6l6 6`} stroke="#fbbf24" strokeWidth={1.8} />
        </g>
      ) : null}
      {tile.noGo ? <path d={`M${x + 6} ${y + 6}l12 12M${x + 18} ${y + 6}l-12 12`} stroke={HAZARD} strokeWidth={2.4} /> : null}
      {tile.visited ? <circle cx={x + T / 2} cy={y + T / 2} r={1.8} fill="#ff7a1a" stroke={INK} strokeWidth={0.4} opacity={0.75} /> : null}
      {unseen}
    </g>
  );
}, (a, b) => a.floor === b.floor && a.usual === b.usual && a.indoor === b.indoor && a.turned === b.turned && sameTile(a.tile, b.tile));

interface SpriteTilesProps {
  readonly tiles: readonly SpriteTile[];
  readonly floor: SpriteId;
  readonly usual: TerrainId;
  readonly indoor: boolean;
  /** Tile indexes of doors that stand in a wall running north–south. */
  readonly turned: ReadonlySet<number>;
}

/** The ground layer. Looked at again only when the robot's map changes, not on every frame. */
export const SpriteTiles = memo(function SpriteTiles({ tiles, floor, usual, indoor, turned }: SpriteTilesProps) {
  return (
    <g>
      {tiles.map((tile) => <SpriteTileMark key={tile.index} tile={tile} floor={floor} usual={usual} indoor={indoor} turned={turned.has(tile.index)} />)}
    </g>
  );
});

/** A dark plate behind a mark that has no sprite, so its thin lines still read on a light floor. */
export function Plate({ cell }: { readonly cell: Cell }) {
  return <rect x={cell.x * T + 1} y={cell.y * T + 1} width={T - 2} height={T - 2} rx={6} fill={INK} opacity={0.55} />;
}

/** How large each object's sprite is drawn on its tile: width and height in map units. */
const OBJECT_SIZE: Readonly<Partial<Record<LabObjectKind, readonly [number, number]>>> = {
  parcel: [18, 20], bay: [22, 22], sample: [22, 20], lander: [32, 32], flag: [15, 22],
};

/** A letter or digit on a sprite, readable on any of them. */
function Tag({ cx, cy, children }: { readonly cx: number; readonly cy: number; readonly children: ReactNode }) {
  return (
    <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="var(--font-mono)" fill="#ffffff" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" paintOrder="stroke">
      {children}
    </text>
  );
}

interface SpriteGlyphProps {
  readonly kind: LabObjectKind;
  readonly id: string;
  readonly cell: Cell;
  readonly done: boolean;
}

/** An object that has a sprite. Parcels, bays and samples keep the letter or digit that tells them apart. */
export function SpriteGlyph({ kind, id, cell, done }: SpriteGlyphProps) {
  const sprite = objectSprite(kind);
  const size = OBJECT_SIZE[kind];
  if (sprite === undefined || size === undefined) return null;
  const cx = cell.x * T + T / 2;
  const cy = cell.y * T + T / 2;
  const tagged = kind === 'parcel' || kind === 'bay' || kind === 'sample';
  return (
    <g opacity={done ? 0.4 : 1}>
      <Sprite id={sprite} x={cx - size[0] / 2} y={cy - size[1] / 2} width={size[0]} height={size[1]} />
      {tagged ? <Tag cx={cx} cy={cy}>{shortId(id)}</Tag> : null}
    </g>
  );
}

interface SpriteRoverProps {
  /** Centre, in map units. */
  readonly cx: number;
  readonly cy: number;
  /** Clockwise from north. */
  readonly headingDeg: number;
  readonly sprite: SpriteId;
  /** The driver's colour: a disc under the rover and a nose on its front, so two rovers of one build tell apart. */
  readonly color: string;
  /** What it carries, drawn small at its side. */
  readonly carried?: SpriteId;
}

export function SpriteRover({ cx, cy, headingDeg, sprite, color, carried }: SpriteRoverProps) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={11.5} fill={color} opacity={0.42} />
      <circle cx={cx} cy={cy} r={11.5} fill="none" stroke={color} strokeWidth={2.2} />
      <g transform={`rotate(${headingDeg} ${cx} ${cy})`}>
        <path d={`M${cx - 4} ${cy - 10.5}L${cx} ${cy - 16}L${cx + 4} ${cy - 10.5}z`} fill={color} stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
        <Sprite id={sprite} x={cx - 8.5} y={cy - 14.5} width={17} height={29} />
      </g>
      {carried ? (
        <g>
          <circle cx={cx + 8.5} cy={cy - 8.5} r={5.6} fill={INK} opacity={0.75} />
          <Sprite id={carried} x={cx + 4.5} y={cy - 12.5} width={8} height={8} />
        </g>
      ) : null}
    </g>
  );
}

/** A forklift the robot has named, forks first along its way. */
export function SpriteMover({ cx, cy, headingDeg }: { readonly cx: number; readonly cy: number; readonly headingDeg: number }) {
  return (
    <g transform={`rotate(${headingDeg} ${cx} ${cy})`}>
      <Sprite id="forklift" x={cx - 8.5} y={cy - 15} width={17} height={30} />
    </g>
  );
}
