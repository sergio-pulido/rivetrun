// Server-side reader for docs/arena-results.json, the brain session's arena output. Read from disk at request time:
// the file appears (and changes) without a rebuild, and a missing file is the empty state, not an error.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArena, type Arena } from './arena';

const FILE = path.join(process.cwd(), '..', '..', 'docs', 'arena-results.json');

/** The arena results, or null while there is no readable file. */
export function arenaResults(): Arena | null {
  try {
    return parseArena(JSON.parse(readFileSync(FILE, 'utf8')));
  } catch {
    return null; // Not written yet, or not JSON.
  }
}
