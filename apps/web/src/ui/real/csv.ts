// The shopping list as a CSV file: the lines still to buy, with nothing the bill of materials does not say.
import { canBuy, quantity, type RealLine } from './bom';

export const CSV_COLUMNS = ['name', 'maker', 'model', 'qty', 'price as shown', 'url'] as const;
export const CSV_FILE_NAME = 'rivetrun-shopping-list.csv';

/** A spreadsheet runs a cell that starts with one of these as a formula: such a cell is written as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | null): string {
  const text = value ?? '';
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * One row per line still to buy. The price is the text its page showed, in its own currency: no totals, nothing
 * converted. The link is left empty for an item whose page was not checked, as on the screen.
 */
export function shoppingCsv(lines: readonly RealLine[]): string {
  const rows = lines.map(({ item }) => [item.name, item.manufacturer, item.model, quantity(item), item.priceShown, canBuy(item) ? item.url : null]);
  return [CSV_COLUMNS, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

/** The CSV as a link target, so the download needs no script. The byte-order mark makes spreadsheets read "€" as UTF-8. */
export const csvHref = (csv: string): string => `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`;
