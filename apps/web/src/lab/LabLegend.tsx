import type { LabObjectKind, LabScenario } from '@rivetrun/lab';
import { legendFor, type LegendKey } from './boardModel';
import { Glyph } from './LabBoard';

const OBJECTS: readonly LabObjectKind[] = ['exit', 'parcel', 'bay', 'sample', 'lander', 'checkpoint', 'flag', 'home'];
const isObject = (key: LegendKey): key is LabObjectKind => (OBJECTS as readonly string[]).includes(key);

/** One mark, drawn as the map draws it, on a 24-unit tile. */
function Mark({ entry }: { readonly entry: LegendKey }) {
  if (isObject(entry)) return <Glyph kind={entry} id="1" cell={{ x: 0, y: 0 }} done={false} rival={false} />;
  switch (entry) {
    case 'you':
    case 'rival':
      return <g><circle cx={12} cy={12} r={9} fill={entry === 'you' ? '#ff7a1a' : '#3fd0e0'} stroke="#0e1013" strokeWidth={1.5} /><path d="M12 4l5 7h-10z" fill="#0e1013" /></g>;
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
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Map legend" data-testid="scenario-legend">
      {legendFor(scenario).map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5 text-[11px] leading-snug text-text-2">
          <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 rounded-[3px]">
            <Mark entry={entry.key} />
          </svg>
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
