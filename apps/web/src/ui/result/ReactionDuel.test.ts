import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReactionDuel } from './ReactionDuel';
import { pairWithGhost, reactionDuel } from './reactions';

const text = (markup: string): string => markup.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

describe('ReactionDuel', () => {
  it('renders both medians and, per event, the player\'s time or "no reaction" and Jev\'s latency', () => {
    const events = pairWithGhost(
      [
        { id: 'hazard_seen:2:lidar', t: 4, xM: 11.4, label: 'LIDAR · rock 11 m', humanS: 0.82 },
        { id: 'terrain_seen:3:camera', t: 9, xM: 20, label: 'CAMERA · mud 6 m', humanS: null },
      ],
      [{ trigger: { eventId: 'hazard_seen:2:lidar' }, latencyMs: 340, fallback: false }],
    );
    const shown = text(renderToStaticMarkup(createElement(ReactionDuel, { duel: reactionDuel(events, 300)! })));
    expect(shown).toContain('YOUR REACTION|0.82 s');
    expect(shown).toContain('JEV|0.34 s');
    expect(shown).toContain('11 m|LIDAR · rock 11 m|0.82 s|0.34 s');
    expect(shown).toContain('CAMERA · mud 6 m|no reaction|~0.30 s');
    expect(shown).toContain('a time marked ~ is its median for the run');
  });

  it('draws no Jev column and says so when the run has no Jev latency at all', () => {
    const shown = text(renderToStaticMarkup(createElement(ReactionDuel, { duel: reactionDuel([{ t: 4, xM: 11, label: 'LIDAR · rock 11 m', humanS: 0.82 }])! })));
    expect(shown).toContain('latency not on this run');
    expect(shown).not.toContain('|JEV|EVENT');
    expect(shown).toContain('EVENT|YOU|11 m');
  });
});
