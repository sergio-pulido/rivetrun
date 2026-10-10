// Light entry: imported directly ('@/game/glyph') by pages that must not pull in three.js, such as /scenarios.
// Keep this file to React, the contracts and palette.ts. Do not move or rename it without telling [LAB].
import type { TerrainId } from '@rivetrun/contracts';
import { TERRAIN_LOOK, UI } from './palette';

/**
 * The rover seen from above, for 2D views of the same game (the Lab Missions grid): the printed orange
 * chassis, four black tyres and the head with its cyan eyes at the front. Plain SVG, no state, no canvas.
 * It is drawn nose-up inside a box of `size` units centred on (cx, cy); rotate the parent for a heading.
 */
export interface RobotGlyphProps {
  cx: number;
  cy: number;
  /** Width and height of the box the glyph fills, in the SVG's own units. */
  size: number;
  /** Chassis colour. Default: the player's orange. Pass ROBOT_COLORS.rival for another driver. */
  color?: string;
  title?: string;
}

export const ROBOT_COLORS = { player: UI.safety, rival: UI.cyan } as const;

export function RobotGlyph({ cx, cy, size, color = ROBOT_COLORS.player, title }: RobotGlyphProps) {
  // Drawn on a 24-unit box and scaled, so the proportions hold at any tile size.
  const k = size / 24;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${k})`}>
      {title ? <title>{title}</title> : null}
      {[-1, 1].map((side) => (
        <g key={side}>
          <rect x={side * 9 - 2.5} y={-9.5} width={5} height={7} rx={1.5} fill="#0e1013" />
          <rect x={side * 9 - 2.5} y={3} width={5} height={7} rx={1.5} fill="#0e1013" />
        </g>
      ))}
      <rect x={-7} y={-8.5} width={14} height={18} rx={2.5} fill={color} stroke="#0e1013" strokeWidth={1.2} />
      {/* The controller board on the deck and the head at the nose. */}
      <rect x={-4} y={0} width={8} height={6.5} rx={1} fill="#1f7a4a" />
      <rect x={-5} y={-8} width={10} height={5.5} rx={1.2} fill="#0e1013" />
      <rect x={-3.4} y={-6.6} width={2.4} height={2.6} rx={0.5} fill={UI.led} />
      <rect x={1} y={-6.6} width={2.4} height={2.6} rx={0.5} fill={UI.led} />
    </g>
  );
}

/** Terrain colours as the run view and its HUD use them, by terrain id. `top` is the ground itself, `hud` the flat chip colour. */
export const TERRAIN_COLORS: Readonly<Record<TerrainId, { readonly top: string; readonly hud: string; readonly label: string }>> = Object.fromEntries(
  (Object.keys(TERRAIN_LOOK) as TerrainId[]).map((id) => [id, { top: TERRAIN_LOOK[id].top, hud: TERRAIN_LOOK[id].hud, label: TERRAIN_LOOK[id].label }]),
) as Record<TerrainId, { top: string; hud: string; label: string }>;

/**
 * The same ground, darkened for a top-down board on the dark sheet: `shade` 0 keeps the run view's colour,
 * 0.6 (the default) sits at the brightness the Lab board uses today.
 */
export function terrainTile(id: TerrainId, shade = 0.6): string {
  const hex = TERRAIN_LOOK[id].top;
  const channel = (at: number): number => Math.round(parseInt(hex.slice(at, at + 2), 16) * (1 - shade) + 0x0e * shade);
  return `#${[1, 3, 5].map((at) => channel(at).toString(16).padStart(2, '0')).join('')}`;
}

/** What the game's colours mean, for anything that draws beside it. */
export const GAME_COLORS = {
  /** The player and the player's actions. */
  player: UI.safety,
  /** Brains, sensing and anything the robot knows. */
  sensing: UI.cyan,
  sheet: UI.sheet,
  ink: UI.ink,
  line: UI.line,
  text: UI.text,
  dim: UI.dim,
  ok: UI.ok,
  warn: UI.warn,
  bad: UI.bad,
} as const;
