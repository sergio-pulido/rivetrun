import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoachContent } from './CoachSheet';

const text = (markup: string): string => markup.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

describe('CoachSheet', () => {
  it('teaches the v3 controls in Drive mode: throttle slider, brake slider, scan pads', () => {
    const shown = text(renderToStaticMarkup(createElement(CoachContent, { mode: 'drive', onStart: () => {}, onClose: () => {} })));
    expect(shown).toContain('Slide up on the right for throttle');
    expect(shown).toContain('A touch gives 30 %');
    expect(shown).toContain('Slide up on the left to brake');
    expect(shown).toMatch(/Stop on a scan pad for 1\.5 s/);
    expect(shown).toMatch(/unscanned adds 10 s/);
    expect(shown).toContain('The ghost beside you is Jev');
    expect(shown).not.toContain('Hold the right side');
    expect(shown.match(/\|[123]\|/g)).toHaveLength(3);
  });

  it('keeps the three Jev-mode marks', () => {
    const shown = text(renderToStaticMarkup(createElement(CoachContent, { mode: 'jev', onStart: () => {}, onClose: () => {} })));
    expect(shown).toContain('Watch the Brain panel');
    expect(shown).toContain('Brief your brain');
  });
});
