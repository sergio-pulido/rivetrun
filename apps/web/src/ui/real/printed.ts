import type { PrintedPart } from './printedData';

/** 1.536 h → "1 h 32 min"; 0.106 h → "6 min". */
export function formatHours(hours: number): string {
  const minutes = Math.round(hours * 60);
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const formatGrams = (grams: number): string => `${grams >= 10 ? grams.toFixed(0) : grams.toFixed(1)} g`;

/** Figures that did not come out of a slicer are estimates, and say so. */
export const isEstimate = (part: Pick<PrintedPart, 'source'>): boolean => part.source !== 'slicer';

export interface PrintTotals {
  readonly pieces: number;
  /** Null when any part has no figure: a partial sum would read as the total. */
  readonly grams: number | null;
  readonly hours: number | null;
  readonly estimated: boolean;
}

/** Filament and print time for one rover: each part times its quantity. */
export function printTotals(parts: readonly PrintedPart[]): PrintTotals {
  const sum = (pick: (part: PrintedPart) => number | null): number | null =>
    parts.every((part) => pick(part) !== null) ? parts.reduce((total, part) => total + (pick(part) ?? 0) * part.qty, 0) : null;
  return {
    pieces: parts.reduce((total, part) => total + part.qty, 0),
    grams: sum((part) => part.grams),
    hours: sum((part) => part.hours),
    estimated: parts.some(isEstimate),
  };
}
