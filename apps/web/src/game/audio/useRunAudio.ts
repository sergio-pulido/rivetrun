'use client';

import { useEffect } from 'react';
import type { Action, Build } from '@rivetrun/contracts';
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
export function useRunAudio(feed: RunFeed, build: Build): void {
  const hasDrone = build.sensors.includes('scout_drone');

  useEffect(() => {
    initAudio();
    let prev = feed.get();
    let lastAction: Action | null = null;
    let lastSlipAt = 0;
    let lastSplashAt = 0;
    let humming = false;

    const onChange = (): void => {
      const view = feed.get();
      const state = view.state;
      const now = performance.now();

      if (state && !prev.state) play('go');
      if (view.decisionCount < prev.decisionCount) lastAction = null;
      if (view.decisionCount > prev.decisionCount && view.decision) {
        const picked = view.decision.decision.selected;
        play('decision');
        if (picked !== lastAction && picked === 'accelerate') play('accelerate');
        if (picked !== lastAction && picked === 'brake') play('brake');
        lastAction = picked;
      }
      if (view.lastDamage && view.lastDamage !== prev.lastDamage) play('crash');
      if (view.done && !prev.done) play(view.dnfReason ? 'dnf' : 'finish');

      const running = state !== null && !view.done;
      if (running) {
        const before = prev.state?.effects ?? [];
        if (state.effects.includes('slip') && !before.includes('slip') && now - lastSlipAt > SLIP_COOLDOWN_MS) {
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
        // Spinning wheels rev the motor even when the robot barely moves; slow-mo drops the pitch.
        const speed = Math.max(Math.abs(state.v), Math.abs(state.wheelSpin) * 0.3) / TOP_SPEED_MPS;
        setEngine(clamp(speed, 0, 1) * (view.pending ? 0.6 : 1), clamp(load, 0, 1));
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
  }, [feed, hasDrone]);
}
