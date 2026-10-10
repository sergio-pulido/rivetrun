'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Build } from '@rivetrun/contracts';
import {
  LAB_PLAYER, LAB_SCENARIOS, LAB_TUNING, createLabDriver,
  type Cell, type Dir, type LabBrain, type LabDecisionLog, type LabDriver, type LabRunResult, type LabScenarioId, type LabState, type LabTrigger,
} from '@rivetrun/lab';
import { jevLabBrain, jevSeat, standInBrain, type JevSeat } from './labBrain';

/** drive = the player's thumbs · jev = a brain drives the player's robot and the player watches its decisions. */
export type LabMode = 'drive' | 'jev';

export interface LabRunSetup {
  readonly scenarioId: LabScenarioId;
  readonly seed: number;
  readonly build: Build;
  readonly mode: LabMode;
  /** True when the server has a route to Jev: the brain seats ask it live. False: the lab's fixed rules sit there. */
  readonly jevLive: boolean;
  /** Ask Jev the facts-only question: no verdict from the fixed rules on any option. */
  readonly jevFacts: boolean;
  /** Changes on every start, so a retry with the same setup is a new run. */
  readonly attempt: number;
}

export interface LabRunView {
  /** The start this view belongs to. */
  readonly attempt: number;
  readonly state: LabState;
  readonly decisions: readonly LabDecisionLog[];
  /** The last thing the player's robot noticed: what a brain would have been asked about. */
  readonly noticed?: LabTrigger;
  /** Robots waiting for an answer from their brain. */
  readonly thinking: readonly string[];
  /** Arrow presses not yet driven. */
  readonly queued: number;
  readonly result?: LabRunResult;
}

export interface LabRunControls {
  /** One tile that way, after the moves already asked for. */
  readonly press: (dir: Dir) => void;
  /** Drive to a tile by the robot's own map. */
  readonly goTo: (cell: Cell) => void;
  /** Pick up, deliver, scan or end the mission on this tile. */
  readonly act: () => void;
  readonly togglePace: () => void;
  /** Stop and forget the queued moves. */
  readonly halt: () => void;
}

const STEP_MS = LAB_TUNING.dtS * 1000;
/** At most this many sim steps per timer tick: a tab that was asleep catches up slowly instead of jumping. */
const MAX_STEPS = 6;
const MAX_QUEUE = 120;

/** Runs one Lab Mission in real time: the sim steps on a timer, brains answer when they answer, the player's moves queue. */
export function useLabRun(setup: LabRunSetup | null): { view: LabRunView | null; controls: LabRunControls } {
  const [view, setView] = useState<LabRunView | null>(null);
  const driverRef = useRef<LabDriver | null>(null);
  const queueRef = useRef<Dir[]>([]);

  useEffect(() => {
    if (setup === null) {
      driverRef.current = null;
      return undefined;
    }
    const scenario = LAB_SCENARIOS[setup.scenarioId];
    const brains: Record<string, LabBrain | undefined> = Object.fromEntries(
      scenario.agents.map((agent) => [agent.id, agent.id !== LAB_PLAYER || setup.mode === 'jev' ? (setup.jevLive ? jevLabBrain({ factsOnly: setup.jevFacts }) : standInBrain()) : undefined]));
    const driver = createLabDriver(scenario, setup.seed, scenario.agents.map((agent) => ({ agentId: agent.id, build: setup.build, ...(brains[agent.id] ? { brain: brains[agent.id] } : {}) })), { live: true });
    driverRef.current = driver;
    queueRef.current = [];
    const thinking = new Set<string>();
    let noticed: LabTrigger | undefined;
    let decisions: readonly LabDecisionLog[] = [];
    let last = performance.now();
    let owed = 0;

    const publish = (): void => {
      if (driver.decisions.length !== decisions.length) decisions = [...driver.decisions];
      setView({
        attempt: setup.attempt, state: driver.state, decisions, ...(noticed ? { noticed } : {}), thinking: [...thinking], queued: queueRef.current.length,
        ...(driver.done ? { result: driver.result() } : {}),
      });
    };

    const ask = (agentId: string, question: Parameters<LabBrain['decide']>[0]): void => {
      thinking.add(agentId);
      const settle = (): void => { thinking.delete(agentId); };
      // An answer for a run that has been replaced goes nowhere.
      brains[agentId]!.decide(question).then(
        (decision) => { settle(); if (driverRef.current === driver) driver.answer(agentId, decision); },
        (error: unknown) => { settle(); if (driverRef.current === driver) driver.answer(agentId, undefined, error instanceof Error ? error.message : 'the brain did not answer'); },
      );
    };

    let shown = false;
    const tick = (): void => {
      // The first tick puts the starting position on screen.
      if (!shown) { shown = true; publish(); }
      if (driver.done) return;
      const now = performance.now();
      owed += Math.min(MAX_STEPS * STEP_MS, now - last);
      last = now;
      let stepped = false;
      for (let steps = 0; owed >= STEP_MS && steps < MAX_STEPS && !driver.done; steps += 1) {
        owed -= STEP_MS;
        for (const { agentId, question } of driver.questions()) ask(agentId, question);
        const me = driver.state.agents.find((agent) => agent.id === LAB_PLAYER);
        const next = queueRef.current[0];
        if (me && next !== undefined && me.command.type === 'idle' && me.move === undefined && me.busy === undefined) {
          queueRef.current = queueRef.current.slice(1);
          driver.command(LAB_PLAYER, { type: 'step', dir: next });
        }
        driver.advance();
        // "Standing still" is not news to the person holding the controls.
        const fresh = driver.state.agents.find((agent) => agent.id === LAB_PLAYER)?.trigger;
        if (fresh !== undefined && fresh.cause !== 'idle') noticed = fresh;
        stepped = true;
      }
      if (stepped) publish();
    };

    const timer = window.setInterval(tick, 33);
    return () => {
      window.clearInterval(timer);
      if (driverRef.current === driver) driverRef.current = null;
    };
  }, [setup]);

  const press = useCallback((dir: Dir) => {
    if (queueRef.current.length < MAX_QUEUE) queueRef.current = [...queueRef.current, dir];
  }, []);
  const goTo = useCallback((cell: Cell) => {
    queueRef.current = [];
    driverRef.current?.command(LAB_PLAYER, { type: 'goto', to: cell });
  }, []);
  const act = useCallback(() => {
    queueRef.current = [];
    driverRef.current?.command(LAB_PLAYER, { type: 'interact' });
  }, []);
  const halt = useCallback(() => {
    queueRef.current = [];
    driverRef.current?.command(LAB_PLAYER, { type: 'idle' });
  }, []);
  const togglePace = useCallback(() => {
    const driver = driverRef.current;
    const me = driver?.state.agents.find((agent) => agent.id === LAB_PLAYER);
    if (driver && me) driver.setPace(LAB_PLAYER, me.pace === 'full' ? 'eco' : 'full');
  }, []);

  // A view left over from an earlier start is not this run's.
  return { view: view !== null && setup !== null && view.attempt === setup.attempt ? view : null, controls: { press, goTo, act, togglePace, halt } };
}

/** What the server offers for Jev on Lab Missions. `null` until the answer is in. */
export function useJevSeat(): JevSeat | null {
  const [seat, setSeat] = useState<JevSeat | null>(null);
  useEffect(() => {
    let current = true;
    void jevSeat().then((answer) => { if (current) setSeat(answer); });
    return () => { current = false; };
  }, []);
  return seat;
}
