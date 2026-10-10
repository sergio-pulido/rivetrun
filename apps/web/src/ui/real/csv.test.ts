import { describe, expect, it } from 'vitest';
import type { BomItem, RealLine } from './bom';
import { csvHref, shoppingCsv } from './csv';

const line = (patch: Partial<BomItem>): RealLine => ({
  gameId: null,
  item: {
    key: 'k', gameId: null, group: 'core', category: 'controller', name: 'Board', manufacturer: 'Maker', model: 'M-1', qty: 1, unit: 'pcs',
    url: 'https://example.com/board', priceShown: 'US$29.95', specs: {}, status: 'verified', notes: '', scenario: null, usedFor: null, ...patch,
  },
});

describe('shopping list CSV', () => {
  it('writes one row per line with the six columns', () => {
    expect(shoppingCsv([line({})])).toBe('name,maker,model,qty,price as shown,url\r\nBoard,Maker,M-1,1 pcs,US$29.95,https://example.com/board');
  });

  it('keeps the price exactly as shown and quotes commas and quotes', () => {
    const csv = shoppingCsv([line({ name: 'Encoder kit, 12 CPR, 2.7-18V', priceShown: '€9,99', model: '3" wheel' })]);
    expect(csv.split('\r\n')[1]).toBe('"Encoder kit, 12 CPR, 2.7-18V",Maker,"3"" wheel",1 pcs,"€9,99",https://example.com/board');
  });

  it('leaves empty what the bill of materials does not have, and gives no link for an unchecked page', () => {
    const csv = shoppingCsv([line({ manufacturer: null, model: null, priceShown: null, status: 'unverified', qty: 4, unit: 'pair' })]);
    expect(csv.split('\r\n')[1]).toBe('Board,,,4 pair,,');
  });

  it('writes a cell that a spreadsheet would run as a formula as text', () => {
    expect(shoppingCsv([line({ name: '=SUM(A1)', priceShown: '-5' })]).split('\r\n')[1]).toBe("'=SUM(A1),Maker,M-1,1 pcs,'-5,https://example.com/board");
  });

  it('has only the header when nothing is left to buy', () => {
    expect(shoppingCsv([])).toBe('name,maker,model,qty,price as shown,url');
  });

  it('is a data link a browser can save, read as UTF-8', () => {
    const href = csvHref(shoppingCsv([line({ priceShown: '€ 249' })]));
    expect(href.startsWith('data:text/csv;charset=utf-8,%EF%BB%BF')).toBe(true);
    expect(decodeURIComponent(href.split(',').slice(1).join(','))).toContain('€ 249');
  });
});
