import { describe, expect, it } from 'vitest';
import type { Outcome } from '@rivetrun/contracts';
import { breakdownView } from './breakdown';

type Breakdown = NonNullable<Outcome['breakdown']>;
const breakdown = (patch: Partial<Breakdown> = {}): Breakdown => ({
  slipLostS: 0,
  damageByCause: { impact: 0, landing: 0, water: 0, tipOver: 0, fall: 0 },
  scansDone: 0,
  scansMissed: 0,
  decisions: {},
  tryNext: '',
  scanPenaltyS: 0,
  scanBonus: 0,
  ...patch,
});

describe('breakdownView', () => {
  it('is null for a run with no breakdown', () => {
    expect(breakdownView(undefined)).toBeNull();
  });

  it('counts scans done and missed with what they cost and earned', () => {
    const view = breakdownView(breakdown({ scansDone: 2, scansMissed: 1, scanPenaltyS: 10, scanBonus: 15 }))!;
    expect(view.scans).toEqual({ text: '2 of 3 scanned', detail: '1 missed: +10 s · centred stops: +15 pts', tone: 'warn' });
    expect(breakdownView(breakdown({ scansDone: 1 }))!.scans).toEqual({ text: '1 of 1 scanned', detail: null, tone: 'ok' });
    expect(breakdownView(breakdown())!.scans).toBeNull();
  });

  it('states the time lost to slip, to a tenth', () => {
    expect(breakdownView(breakdown({ slipLostS: 3.24 }))!.slip).toEqual({ text: '3.2 s lost to wheelspin', tone: 'warn' });
    expect(breakdownView(breakdown({ slipLostS: 0.02 }))!.slip).toEqual({ text: 'No time lost to wheelspin', tone: 'ok' });
  });

  it('lists damage by cause, biggest first, leaving out causes that did none', () => {
    const view = breakdownView(breakdown({ damageByCause: { impact: 12.4, landing: 0, water: 30, tipOver: 0, fall: 5 } }))!;
    expect(view.damage).toEqual([
      { cause: 'Water', pct: 30 },
      { cause: 'Impacts', pct: 12 },
      { cause: 'Falls', pct: 5 },
    ]);
    expect(breakdownView(breakdown())!.damage).toEqual([]);
  });

  it('passes on the one line on what to try next, when the sim has one', () => {
    expect(breakdownView(breakdown({ tryNext: 'Brake before the rock: 12 % of the damage came from it' }))!.tryNext).toBe('Brake before the rock: 12 % of the damage came from it');
    expect(breakdownView(breakdown({ tryNext: '  ' }))!.tryNext).toBeNull();
  });
});

describe('losses', () => {
  it('ranks the losses in points as the sim does, biggest first, and has none on older runs', () => {
    const view = breakdownView(breakdown({ losses: [{ kind: 'water', points: 180.4 }, { kind: 'slip', points: 13 }, { kind: 'scans', points: 40 }, { kind: 'impact', points: 0.2 }] }))!;
    expect(view.losses).toEqual([{ label: 'Water', points: 180 }, { label: 'Wheelspin', points: 13 }, { label: 'Missed scans', points: 40 }]);
    expect(breakdownView(breakdown())!.losses).toEqual([]);
  });
});

describe('a run that did not finish', () => {
  const stuck = breakdown({ scansMissed: 1, scanPenaltyS: 10, losses: [{ kind: 'scans', points: 40 }, { kind: 'slip', points: 21 }], tryNext: 'Switch to climb mode before soft or steep ground' });

  it('does not rank point losses: not finishing is the loss, with how far the robot got', () => {
    const view = breakdownView(stuck, { finished: false, progressFraction: 0.22 })!;
    expect(view.losses).toEqual([]);
    expect(view.unfinishedAtPct).toBe(22);
    expect(view.tryNext).toBe('Switch to climb mode before soft or steep ground');
  });

  it('ranks them as before on a finish', () => {
    const view = breakdownView(stuck, { finished: true, progressFraction: 1 })!;
    expect(view.losses.map((loss) => loss.label)).toEqual(['Missed scans', 'Wheelspin']);
    expect(view.unfinishedAtPct).toBeNull();
  });

  it('says so on the card', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RunBreakdown } = await import('./RunBreakdown');
    const shown = renderToStaticMarkup(createElement(RunBreakdown, { view: breakdownView(stuck, { finished: false, progressFraction: 0.22 })! })).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
    expect(shown).toContain('BIGGEST LOSS · |Not finishing.');
    expect(shown).toContain('22 % of the track');
    expect(shown).not.toContain('−40 pts');
  });
});

describe('RunBreakdown', () => {
  it('renders the scans, the slip, the damage bars and the try-next line', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RunBreakdown } = await import('./RunBreakdown');
    const view = breakdownView(breakdown({ scansDone: 1, scansMissed: 1, scanPenaltyS: 10, slipLostS: 2.5, damageByCause: { impact: 20, landing: 0, water: 8, tipOver: 0, fall: 0 }, tryNext: 'Ease off before the rock', losses: [{ kind: 'impact', points: 120 }, { kind: 'water', points: 48 }] }))!;
    const shown = renderToStaticMarkup(createElement(RunBreakdown, { view })).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
    expect(shown).toContain('Scans: 1 of 2 scanned');
    expect(shown).toContain('1 missed: +10 s');
    expect(shown).toContain('2.5 s lost to wheelspin');
    expect(shown).toContain('Impacts|20%');
    expect(shown).toContain('Water|8%');
    expect(shown).toContain('BIGGEST LOSS · |Impacts −120 pts');
    expect(shown).toContain('water −48');
    expect(shown).toContain('TRY NEXT · |Ease off before the rock');
  });
});
