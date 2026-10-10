'use client';

import type { LabObjectKind, LabScenario } from '@rivetrun/lab';
import { legendFor, type LegendKey } from './boardModel';
import { ROBOT_COLORS, RobotGlyph } from '@/game/glyph';
import { Glyph } from './LabBoard';
import { DoorSprite, Plate, SpriteGlyph, SpriteMover, SpriteRover, StairsSprite } from './LabSprites';
import { objectSprite, useLabSprites } from './sprites';

const OBJECTS: readonly LabObjectKind[] = ['exit', 'parcel', 'bay', 'sample', 'lander', 'checkpoint', 'flag', 'home'];
const isObject = (key: LegendKey): key is LabObjectKind => (OBJECTS as readonly string[]).includes(key);

const ORIGIN = { x: 0, y: 0 };

/** The marks that have a sprite, as the board draws them when the sprites are in. `undefined` = it has none. */
function SpriteMark({ entry, indoor }: { readonly entry: LegendKey; readonly indoor: boolean }) {
  if (isObject(entry)) {
    if (objectSprite(entry) !== undefined) return <SpriteGlyph kind={entry} id="1" cell={ORIGIN} done={false} />;
    return <g><Plate cell={ORIGIN} /><Glyph kind={entry} id="1" cell={ORIGIN} done={false} rival={false} /></g>;
  }
  switch (entry) {
    case 'you':
    case 'rival':
      return <SpriteRover cx={12} cy={12} headingDeg={0} sprite="robot_wheels" color={entry === 'you' ? ROBOT_COLORS.player : ROBOT_COLORS.rival} />;
    case 'mover':
      return <SpriteMover cx={12} cy={12} headingDeg={0} />;
    case 'door':
      return <DoorSprite x={0} y={0} open={false} turned={false} />;
    case 'drop':
      return indoor ? <StairsSprite x={0} y={0} /> : <Mark entry={entry} />;
    default:
      return <Mark entry={entry} />;
  }
}

/** One mark, drawn as the map draws it, on a 24-unit tile. */
function Mark({ entry }: { readonly entry: LegendKey }) {
  if (isObject(entry)) return <Glyph kind={entry} id="1" cell={ORIGIN} done={false} rival={false} />;
  switch (entry) {
    case 'you':
    case 'rival':
      return <RobotGlyph cx={12} cy={12} size={24} color={entry === 'you' ? ROBOT_COLORS.player : ROBOT_COLORS.rival} />;
    case 'mover':
      return <rect x={3} y={3} width={18} height={18} rx={3} fill="#fbbf24" stroke="#160b03" />;
    case 'door':
      return <rect x={2} y={8} width={20} height={8} rx={2} fill="#ffb27a" />;
    case 'drop':
      return <g><rect width={24} height={24} fill="#f8514a" opacity={0.28} /><path d="M4 7h16M4 12h16M4 17h16" stroke="#f8514a" strokeWidth={2} /></g>;
    case 'ramp':
      return <path d="M6 15l6 -6l6 6M6 20l6 -6l6 6" stroke="#fbbf24" strokeWidth={1.8} fill="none" />;
    case 'fog':
      return <g><rect width={24} height={24} fill="#0a0c0f" /><path d="M-2 8l10 -10M-2 16l18 -18M-2 24l26 -26M6 24l18 -18M14 24l10 -10" stroke="#232932" strokeWidth={1} /></g>;
  }
}

/** What the marks on this scenario's map mean. */
export function LabLegend({ scenario }: { readonly scenario: LabScenario }) {
  const sprites = useLabSprites();
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Map legend" data-testid="scenario-legend">
      {legendFor(scenario).map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5 text-[11px] leading-snug text-text-2">
          {/* Sprites spill over their tile (the rover's nose, the lander's legs): a wider window, a little larger. */}
          <svg width={sprites ? 20 : 16} height={sprites ? 20 : 16} viewBox={sprites ? '-4 -4 32 32' : '0 0 24 24'} aria-hidden="true" className="shrink-0 rounded-[3px]">
            {sprites ? <SpriteMark entry={entry.key} indoor={scenario.indoor} /> : <Mark entry={entry.key} />}
          </svg>
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
