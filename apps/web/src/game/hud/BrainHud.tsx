'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Action, BrainDecision, BrainQuestion, DecisionTrigger, Perception } from '@rivetrun/contracts';
import { ACTION_LABEL, TERRAIN_LOOK, UI } from '../palette';
import styles from './hud.module.css';

const TRIGGER_LABEL: Readonly<Record<DecisionTrigger, string>> = {
  start: 'run start',
  terrain_ahead: 'terrain ahead',
  terrain_enter: 'new terrain',
  obstacle: 'obstacle',
  slip: 'slipping',
  damage: 'took damage',
  interval: 'check-in',
};

interface ChipProps {
  label: string;
  /** Shown under the "?" when the build has no sensor for this reading. */
  sensor: string;
  known: boolean;
  wide?: boolean;
  tone?: string;
  children?: ReactNode;
}

/** One perceived reading. No sensor ⇒ a hatched "?" chip: the Brain is blind there. */
function Chip({ label, sensor, known, wide = false, tone = UI.text, children }: ChipProps) {
  return (
    <div
      className={`${known ? '' : styles.unknown} flex min-w-0 flex-col justify-between rounded-md px-1.5 py-1 ${wide ? 'flex-[1.7]' : 'flex-1'}`}
      style={{ background: known ? 'rgb(9 13 18 / 0.75)' : 'rgb(9 13 18 / 0.4)', border: `1px ${known ? 'solid' : 'dashed'} ${known ? UI.line : '#44505f'}`, height: 40 }}
    >
      <span className="text-[8px] leading-none tracking-widest" style={{ color: UI.dim }}>
        {label}
      </span>
      {known ? (
        <span className="truncate text-[12px] font-bold leading-none tabular-nums" style={{ color: tone }}>
          {children}
        </span>
      ) : (
        <span className="flex items-baseline gap-1 leading-none">
          <span className="text-[15px] font-bold" style={{ color: '#5d6b7c' }}>
            ?
          </span>
          <span className="truncate text-[8px]" style={{ color: '#5d6b7c' }}>
            {sensor}
          </span>
        </span>
      )}
    </div>
  );
}

function Perceived({ perceived }: { perceived: Perception }) {
  const { terrainAhead, terrainAheadDistanceM, obstacleAheadM, slipPct, tiltDeg, depthAheadCm } = perceived;
  return (
    <div className="flex gap-1">
      <Chip label="AHEAD" sensor="no camera" known={terrainAhead !== 'unknown'} wide>
        {terrainAhead !== 'unknown' && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: TERRAIN_LOOK[terrainAhead].hud }} />
            <span className="uppercase">{TERRAIN_LOOK[terrainAhead].label}</span>
            {terrainAheadDistanceM !== 'unknown' && <span style={{ color: UI.dim }}>{terrainAheadDistanceM.toFixed(1)}m</span>}
          </span>
        )}
      </Chip>
      <Chip label="OBSTACLE" sensor="no sonar" known={obstacleAheadM !== 'unknown'} tone={obstacleAheadM === null ? UI.ok : UI.warn}>
        {obstacleAheadM !== 'unknown' && (obstacleAheadM === null ? 'clear' : `${obstacleAheadM.toFixed(1)}m`)}
      </Chip>
      <Chip label="SLIP" sensor="no IMU" known={slipPct !== 'unknown'} tone={slipPct !== 'unknown' && slipPct > 25 ? UI.bad : UI.text}>
        {slipPct !== 'unknown' && `${Math.round(slipPct)}%`}
      </Chip>
      <Chip label="TILT" sensor="no IMU" known={tiltDeg !== 'unknown'}>
        {tiltDeg !== 'unknown' && `${Math.round(tiltDeg)}°`}
      </Chip>
      <Chip label="DEPTH" sensor="no probe" known={depthAheadCm !== 'unknown'} tone={depthAheadCm !== 'unknown' && depthAheadCm > 0 ? UI.blueprint : UI.text}>
        {depthAheadCm !== 'unknown' && `${Math.round(depthAheadCm)}cm`}
      </Chip>
    </div>
  );
}

interface OptionRowProps {
  action: Action;
  probability: number | null;
  chosen: boolean;
  thinking: boolean;
  progressM: number | undefined;
  risky: boolean;
}

function OptionRow({ action, probability, chosen, thinking, progressM, risky }: OptionRowProps) {
  const pct = probability === null ? null : Math.round(probability * 100);
  return (
    <div className={`${chosen ? styles.chosen : ''} flex h-[19px] items-center gap-2`}>
      <span className="w-[88px] shrink-0 truncate text-[10px] uppercase tracking-wide" style={{ color: chosen ? UI.safety : thinking ? UI.text : UI.dim, fontWeight: chosen ? 700 : 500 }}>
        {chosen ? '▶ ' : ''}
        {ACTION_LABEL[action]}
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-sm" style={{ background: '#0a0e13', boxShadow: chosen ? `0 0 0 1px ${UI.safety}` : `0 0 0 1px ${UI.line}` }}>
        {thinking ? (
          <div className={`${styles.shimmer} absolute inset-0`} />
        ) : (
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${pct ?? 0}%`,
              background: chosen ? `linear-gradient(90deg, ${UI.safety}, ${UI.safetyHi})` : '#4a5868',
              transition: 'width 220ms cubic-bezier(0.2, 0.9, 0.3, 1)',
            }}
          />
        )}
        {progressM !== undefined && (
          <span className="absolute inset-y-0 right-1 flex items-center gap-1 text-[8px] tabular-nums" style={{ color: 'rgb(230 235 242 / 0.7)' }}>
            {risky && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: UI.bad }} />}
            {progressM >= 0 ? '+' : ''}
            {progressM.toFixed(1)}m
          </span>
        )}
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] font-bold tabular-nums" style={{ color: chosen ? UI.safety : UI.dim }}>
        {pct === null ? '··' : `${pct}%`}
      </span>
    </div>
  );
}

/** Live "thinking for N ms" counter while Jev has the question. */
function Thinking({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - since), 50);
    return () => window.clearInterval(id);
  }, [since]);
  return <span className="tabular-nums">{Math.max(0, Math.round(elapsed))} ms</span>;
}

function Badge({ color, children, pulse = false }: { color: string; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={`${pulse ? styles.pulse : ''} rounded px-1.5 py-[3px] text-[10px] font-bold leading-none tracking-widest`} style={{ color: '#0f141b', background: color }}>
      {children}
    </span>
  );
}

export interface BrainHudProps {
  /** The question being decided right now (run is in slow-mo), if any. */
  pending?: { readonly question: BrainQuestion; readonly since: number } | null;
  /** The last answered question and its decision. */
  last?: { readonly question: BrainQuestion; readonly decision: BrainDecision } | null;
  decisionCount?: number;
}

/** The Brain HUD: what the AI perceives, its options with %, what it chose, who decided, how fast. */
export function BrainHud({ pending = null, last = null, decisionCount = 0 }: BrainHudProps) {
  const question = pending?.question ?? last?.question ?? null;
  const decision = pending ? null : (last?.decision ?? null);
  const thinking = pending !== null;
  const latencyColor = !decision ? UI.dim : decision.fallback ? UI.bad : decision.latencyMs < 500 ? UI.ok : UI.warn;

  return (
    <div className={`${styles.panel} rounded-xl font-mono`} style={{ color: UI.text, borderLeft: `3px solid ${decision?.fallback ? UI.bad : UI.safety}` }}>
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-[0.2em]">BRAIN</span>
          {thinking ? (
            <Badge color={UI.safety} pulse>
              THINKING
            </Badge>
          ) : decision?.fallback ? (
            <Badge color={UI.bad} pulse>
              FALLBACK
            </Badge>
          ) : decision ? (
            <Badge color={decision.policy === 'jev' ? UI.safety : UI.blueprint}>{decision.policy.toUpperCase()}</Badge>
          ) : (
            <Badge color={UI.line}>STANDBY</Badge>
          )}
          {decision?.fallback && (
            <span className="truncate text-[9px]" style={{ color: UI.bad }}>
              Jev timed out → heuristic
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-baseline gap-1 text-[11px] font-bold" style={{ color: thinking ? UI.safety : latencyColor }}>
          {thinking && pending ? <Thinking since={pending.since} /> : decision ? <span className="tabular-nums">{Math.round(decision.latencyMs)} ms</span> : <span>— ms</span>}
        </div>
      </div>

      <div className="px-3 pt-2">
        <div className="mb-1 flex items-center justify-between text-[8px] tracking-widest" style={{ color: UI.dim }}>
          <span>WHAT IT PERCEIVES</span>
          {question && (
            <span>
              #{decisionCount + (thinking ? 1 : 0)} · {TRIGGER_LABEL[question.trigger]}
            </span>
          )}
        </div>
        <Perceived
          perceived={
            question?.perceived ?? {
              terrainAhead: 'unknown', terrainAheadDistanceM: 'unknown', obstacleAheadM: 'unknown', slipPct: 'unknown', tiltDeg: 'unknown', depthAheadCm: 'unknown',
            }
          }
        />
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="mb-1 flex items-center justify-between text-[8px] tracking-widest" style={{ color: UI.dim }}>
          <span>OPTIONS · 1.5 s LOOKAHEAD</span>
          <span>P(ACTION)</span>
        </div>
        <div className="flex flex-col gap-[3px]">
          {(question?.options ?? (['cruise', 'accelerate', 'slow_down', 'brake'] as const)).map((action) => {
            const entry = question?.lookahead.find((candidate) => candidate.action === action);
            return (
              <OptionRow
                key={action}
                action={action}
                probability={decision ? (decision.probabilities[action] ?? 0) : null}
                chosen={decision?.selected === action}
                thinking={thinking}
                progressM={entry?.progressM}
                risky={(entry?.damagePct ?? 0) > 0.5}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
