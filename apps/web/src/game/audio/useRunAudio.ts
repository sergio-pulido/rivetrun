'use client';

import { useEffect, useMemo } from 'react';
import type { Action, Build } from '@rivetrun/contracts';
import { deriveSpec, safeContactSpeedMps } from '@rivetrun/sim';
import { hazardWarning } from '../drive/hazard';
import { clamp } from '../rng';
import type { RunFeed } from '../runFeed';
import { droneHum, initAudio, play, setEngine } from './sfx';

/** Roughly the fastest build: engine pitch is relative to it. */
const TOP_SPEED_MPS = 3;
const SLIP_COOLDOWN_MS = 1200;
const SPLASH_COOLDOWN_MS = 1500;

/**
 * Sound for a run, driven only by what the feed already knows: engine hum from speed and load,
 * one-shots on run events, drone hum for scout-drone builds. Audio unlocks on the first user gesture.
 */
export function useRunAudio(feed: RunFeed, build: Build, driving = false): void {
  const safeContactMps = useMemo(() => safeContactSpeedMps(deriveSpec(build)), [build]);
  const hasDrone = build.sensors.includes('scout_drone');

  useEffect(() => {
    initAudio();
    let prev = feed.get();
    let lastAction: Action | null = null;
    let lastSlipAt = 0;
    let lastSplashAt = 0;
    let scanStep = 0;
    let overSafe = false;
    let humming = false;

    const onChange = (): void => {
      const view = feed.get();
      const state = view.state;
      const now = performance.now();

      if (state && !prev.state) play('go');
      if (view.decisionCount < prev.decisionCount) lastAction = null;
      if (view.decisionCount > prev.decisionCount && view.decision) {
        // Only a change of mind is worth a sound: a chirp every 1.5 s wears thin.
        const picked = view.decision.decision.selected;
        if (picked !== lastAction) {
          play('decision');
          if (picked === 'accelerate') play('accelerate');
          if (picked === 'brake') play('brake');
        }
        lastAction = picked;
      }
      // A landing has its own thump; the crash is for running into things.
      if (view.lastLanding && view.lastLanding !== prev.lastLanding) play(view.lastLanding.grade === 'clean' ? 'land' : view.lastLanding.grade || view.lastLanding.damagePct > 0 || view.lastLanding.impactMps > 2.6 ? 'land_hard' : 'land');
      else if (view.lastDamage && view.lastDamage !== prev.lastDamage && view.lastDamage.amountPct >= 0.5) play('crash');
      if (view.done && !prev.done) play(view.dnfReason ? 'dnf' : 'finish');

      const running = state !== null && !view.done;
      if (running) {
        const before = prev.state?.effects ?? [];
        const was = prev.state;
        if (state.airborne && !was?.airborne) play('jump');
        if (state.blockedBy && !was?.blockedBy) play('blocked');
        if (state.gust && !was?.gust) play('gust');
        // Scan: a tick at each quarter of the hold, then the result.
        const step = state.scan ? Math.floor(state.scan.progress * 4) : -1;
        if (state.scan && step !== scanStep) play('scan_tick');
        scanStep = step;
        if ((state.scansDone ?? 0) > (was?.scansDone ?? 0)) play('scan_done');
        if ((state.scansMissed ?? 0) > (was?.scansMissed ?? 0)) play('scan_missed');
        // Driving: two pips the moment the robot is over the safe speed for what its sensors see ahead.
        if (driving) {
          const over = hazardWarning(view.observation?.value ?? null, state.v, safeContactMps)?.over === true;
          if (over && !overSafe) play('warn');
          overSafe = over;
        }
        // Wheelspin keeps squealing for as long as it lasts.
        if (state.effects.includes('slip') && now - lastSlipAt > SLIP_COOLDOWN_MS) {
          lastSlipAt = now;
          play('slip');
        }
        if (state.effects.includes('splash') && !before.includes('splash') && now - lastSplashAt > SPLASH_COOLDOWN_MS) {
          lastSplashAt = now;
          play('splash');
        }
        const heavy = state.terrain === 'mud' || state.terrain === 'sand' || state.terrain === 'water';
        const load =
          (Math.max(0, state.slopeDeg) / 15) * 0.6 +
          (state.effects.includes('slip') ? 0.35 : 0) +
          (heavy ? 0.3 : 0) +
          (state.effects.includes('winch') ? 0.3 : 0);
        // Spinning wheels rev the motor even when the robot barely moves.
        const speed = Math.max(Math.abs(state.v), Math.abs(state.wheelSpin) * 0.3) / TOP_SPEED_MPS;
        setEngine(clamp(speed, 0, 1), clamp(load, 0, 1));
      } else if (prev.state !== null && !prev.done) {
        setEngine(0, 0);
      }
      if (hasDrone && running !== humming) {
        humming = running;
        droneHum(running);
      }
      prev = view;
    };

    const unsubscribe = feed.subscribe(onChange);
    return () => {
      unsubscribe();
      setEngine(0, 0);
      droneHum(false);
    };
  }, [feed, hasDrone, driving, safeContactMps]);
}
