// Server-side reader for docs/inputs/printed-parts.json. Read from disk at request time rather than imported:
// the file may not be committed yet, and a build must not fail because it is missing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const FILE = path.join(process.cwd(), '..', '..', 'docs', 'inputs', 'printed-parts.json');

const PrintedPartSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().int().positive(),
  material: z.string().min(1),
  layerMm: z.number().positive().nullish(),
  infillPct: z.number().min(0).max(100).nullish(),
  supports: z.boolean().nullish(),
  grams: z.number().positive().nullish(),
  hours: z.number().positive().nullish(),
  /** Where grams and hours come from, e.g. "slicer". */
  source: z.string().nullish(),
});

/** One printed part as the UI shows it. The file's author and STL path are left out on purpose. */
export interface PrintedPart {
  readonly id: string;
  readonly name: string;
  readonly qty: number;
  readonly material: string;
  readonly layerMm: number | null;
  readonly infillPct: number | null;
  readonly supports: boolean | null;
  /** Per piece. */
  readonly grams: number | null;
  /** Per piece. */
  readonly hours: number | null;
  readonly source: string | null;
}

/** The printed parts list, or an empty list when the file is missing or unreadable. Malformed entries are skipped. */
export function printedParts(): readonly PrintedPart[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return []; // Not there yet (or not JSON): the screen simply has no printed-parts section.
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown): PrintedPart[] => {
    const parsed = PrintedPartSchema.safeParse(entry);
    if (!parsed.success) return [];
    const part = parsed.data;
    return [
      {
        id: part.id,
        name: part.name,
        qty: part.qty,
        material: part.material,
        layerMm: part.layerMm ?? null,
        infillPct: part.infillPct ?? null,
        supports: part.supports ?? null,
        grams: part.grams ?? null,
        hours: part.hours ?? null,
        source: part.source ?? null,
      },
    ];
  });
}
