'use client';

import { UI } from '../palette';
import { pilotLine, strategyName, type PilotTag } from './strategy';

const SIZE = {
  hud: { font: 10, line: 13, padX: 8, padY: 4, radius: 7 },
  // The race watch view on a projector: read from across a room.
  screen: { font: 15, line: 19, padX: 12, padY: 6, radius: 10 },
} as const;

export interface StrategyChipProps extends PilotTag {
  size?: keyof typeof SIZE;
  /** Lane colour of this robot on a shared screen: tints the agent's name. */
  tint?: string;
}

/**
 * Who drives this robot and on what orders, on one line: "Jev + Claude's plan", "GPT-6 Luna · Daredevil".
 * Never wraps: on a narrow phone the strategy is what gets cut, the agent's name stays whole. Plain DOM, no state.
 */
export function StrategyChip({ agent, strategy, planModel, size = 'hud', tint }: StrategyChipProps) {
  const s = SIZE[size];
  const plan = strategy === 'plan';
  return (
    <span
      className="inline-flex max-w-full items-center whitespace-nowrap font-mono"
      style={{ fontSize: s.font, lineHeight: `${s.line}px`, padding: `${s.padY}px ${s.padX}px`, borderRadius: s.radius, border: `1px solid ${plan ? UI.safety : UI.line}`, background: 'rgb(14 16 19 / 0.86)', color: UI.text }}
      title={pilotLine({ agent, strategy, planModel })}
    >
      <span className="shrink-0 font-semibold uppercase" style={{ color: tint ?? UI.cyanText }}>
        {agent}
      </span>
      <span className="shrink-0" style={{ color: UI.dim, whiteSpace: 'pre' }}>
        {plan ? ' + ' : ' · '}
      </span>
      <span className="min-w-0 truncate uppercase" style={{ color: plan ? UI.safetyHi : UI.text }}>
        {strategyName(strategy, planModel)}
        {plan ? ' ★' : ''}
      </span>
    </span>
  );
}
