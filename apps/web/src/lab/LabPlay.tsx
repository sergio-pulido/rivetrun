'use client';

import { useEffect, useState } from 'react';
import { LAB_PLAYER, interactionsAt, objectiveStatus, type Dir, type LabDecisionLog } from '@rivetrun/lab';
import { STAND_IN_NAME } from './labBrain';
import { LabBoard } from './LabBoard';
import { LabLegend } from './LabLegend';
import type { LabMode, LabRunControls, LabRunView } from './useLabRun';

const KEYS: Readonly<Record<string, Dir>> = {
  ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W', w: 'N', d: 'E', s: 'S', a: 'W', W: 'N', D: 'E', S: 'S', A: 'W',
};

const PAD: readonly { readonly dir: Dir; readonly id: string; readonly label: string; readonly place: string; readonly turn: number }[] = [
  { dir: 'N', id: 'pad-up', label: 'Up', place: 'col-start-2 row-start-1', turn: 0 },
  { dir: 'W', id: 'pad-left', label: 'Left', place: 'col-start-1 row-start-2', turn: 270 },
  { dir: 'E', id: 'pad-right', label: 'Right', place: 'col-start-3 row-start-2', turn: 90 },
  { dir: 'S', id: 'pad-down', label: 'Down', place: 'col-start-2 row-start-3', turn: 180 },
];

function Arrow({ turn }: { readonly turn: number }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${turn}deg)` }}>
      <path d="M12 5l7 9h-4.5v5h-5v-5H5z" fill="currentColor" />
    </svg>
  );
}

/** The last decisions, newest first: what fired, what was chosen, how long the answer took. */
export function DecisionThread({ decisions, limit, title }: { readonly decisions: readonly LabDecisionLog[]; readonly limit: number; readonly title: string }) {
  const shown = decisions.slice(-limit).reverse();
  return (
    <section className="rr-card-brain flex flex-col gap-1.5 p-2.5" aria-label={title} data-testid="scenario-thread">
      <h3 className="rr-label !text-cyan">{title}</h3>
      {shown.length === 0 ? (
        <p className="text-xs leading-snug text-cyan-muted">No decision yet. A decision is asked only when something changes.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {shown.map((decision, i) => (
            <li key={`${decision.agentId}-${decision.t}-${i}`} className="flex gap-2 font-mono text-[11px] leading-snug text-cyan-soft">
              <span className="w-11 shrink-0 tabular-nums text-cyan-muted">{decision.t.toFixed(1)} s</span>
              <span className="min-w-0">{decision.chip}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface LabPlayProps {
  readonly view: LabRunView;
  readonly controls: LabRunControls;
  readonly mode: LabMode;
}

/** The run: status line, the map, the last thing the robot noticed, the arrow pad and the brain's thread. */
export function LabPlay({ view, controls, mode }: LabPlayProps) {
  const { state } = view;
  const me = state.agents.find((agent) => agent.id === LAB_PLAYER)!;
  const driving = mode === 'drive';
  const statuses = objectiveStatus(state, me);
  const action = interactionsAt(state, me)[0];
  const rival = state.agents.find((agent) => agent.id !== LAB_PLAYER);
  const thread = driving ? view.decisions.filter((d) => d.agentId !== LAB_PLAYER) : view.decisions.filter((d) => d.agentId === LAB_PLAYER);
  const { press, act, halt } = controls;
  // Ending the mission cannot be undone, and on Mars the robot starts on the tile that offers it: it takes two taps,
  // the second within 3 s, and the keyboard never does it.
  const ending = action?.kind === 'finish';
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const armed = ending && armedAt !== null && state.t - armedAt < 3;
  const onAction = (): void => {
    if (!ending || armed) { setArmedAt(null); act(); } else setArmedAt(state.t);
  };

  useEffect(() => {
    if (!driving) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const dir = KEYS[event.key];
      if (dir !== undefined) {
        event.preventDefault();
        // A held key repeats: one press is one tile.
        if (!event.repeat) press(dir);
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat && !ending) act();
      } else if (event.key === 'Escape') {
        halt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [driving, press, act, halt, ending]);

  return (
    <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-x-5">
      <div className="lg:col-start-1 lg:row-span-6 lg:row-start-1">
        <LabBoard state={state} onTile={driving ? controls.goTo : undefined} />
      </div>
      <ul className="order-first flex flex-col gap-1 lg:order-none lg:col-start-2" data-testid="scenario-objective" aria-label="Objectives">
        {statuses.map((status) => (
          <li key={status.id} className="flex items-center justify-between gap-2 text-[13px] leading-snug">
            <span className={status.done ? 'text-ok' : 'text-text'}>{status.label}</span>
            <span className={`font-mono text-xs tabular-nums ${status.done ? 'text-ok' : 'text-muted'}`}>{status.have}/{status.need}</span>
          </li>
        ))}
      </ul>

      <div className="order-first flex flex-wrap gap-1.5 lg:order-none lg:col-start-2">
        <span className="rr-chip tabular-nums" data-testid="scenario-time">{state.t.toFixed(1)} s</span>
        <span className={`rr-chip tabular-nums ${me.batteryPct < 20 ? '!border-bad !text-bad' : ''}`}>Battery {Math.round(me.batteryPct)} %</span>
        <span className={`rr-chip tabular-nums ${me.damagePct > 0 ? '!border-warn !text-warn' : ''}`}>Damage {Math.round(me.damagePct)} %</span>
        {me.carrying.length > 0 ? <span className="rr-chip rr-chip-on">Carrying {me.carrying.length}</span> : null}
        {state.weatherActive.length > 0 ? <span className="rr-chip !border-warn !text-warn">{state.weather.find((w) => state.weatherActive.includes(w.id))?.label}</span> : null}
      </div>

      <p className="min-h-8 font-mono text-[11px] leading-snug text-text-2 lg:col-start-2" aria-live="polite" data-testid="scenario-noticed">
        {view.noticed ? view.noticed.label : 'Fog is what no sensor has reported. The tint is what your sensors see now.'}
      </p>

      {driving ? (
        <div className="flex items-center justify-between gap-3 lg:col-start-2">
          <div className="grid grid-cols-[repeat(3,48px)] grid-rows-[repeat(3,48px)] gap-1.5" role="group" aria-label="Move">
            {PAD.map((button) => (
              <button key={button.id} type="button" className={`rr-iconbtn !h-12 !w-12 bg-panel-2 ${button.place}`} aria-label={button.label} data-testid={button.id} onClick={() => press(button.dir)}>
                <Arrow turn={button.turn} />
              </button>
            ))}
            <button type="button" className="rr-iconbtn col-start-2 row-start-2 !h-12 !w-12 font-mono text-[10px] tracking-[1px] text-muted" aria-label="Stop" data-testid="pad-stop" onClick={halt}>
              STOP
            </button>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <button
              type="button" className={`rr-btn !min-h-[52px] !text-xs ${ending && !armed ? 'rr-btn-secondary' : 'rr-btn-primary'}`}
              disabled={action === undefined} data-testid="pad-action" onClick={onAction}
            >
              {!action ? 'Nothing to do here' : armed ? 'Tap again to end the mission' : ending ? 'End the mission here' : action.label}
            </button>
            <button type="button" className="rr-btn rr-btn-secondary !min-h-11 !text-xs" data-testid="pad-pace" onClick={controls.togglePace}>
              Pace: {me.pace === 'full' ? 'Full' : 'Eco'}
            </button>
            <p className="text-[11px] leading-snug text-faint">Arrows or WASD. Tap a tile you have mapped to drive there.</p>
          </div>
        </div>
      ) : null}

      <div className="lg:col-start-2">
        <LabLegend scenario={state.scenario} />
      </div>

      {!driving || rival ? (
        <div className="lg:col-start-2">
        <DecisionThread
          decisions={thread}
          limit={driving ? 3 : 5}
          title={`${driving ? (rival?.label ?? 'Jev') : 'Your robot'} · decisions (${STAND_IN_NAME.toLowerCase()})${view.thinking.length > 0 ? ' · thinking' : ''}`}
        />
        </div>
      ) : null}
    </div>
  );
}
