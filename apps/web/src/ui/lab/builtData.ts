// Server-side sources for /lab "How it was built": the program's sessions table, the git log, the benchmark file and
// the token counts. Each is read on request and is simply absent when it cannot be read; nothing is made up.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseHowBuilt, parseTokenReport, type HowBuilt, type TokenReport } from './accounting';
import { LOG_FORMAT, commitsOverTime, parseGitLog, parseMarkdownTable, parseSessions, parseTokens, soundCredit, type CommitChart, type MarkdownTable, type Session, type TokenRow } from './built';

const REPO = path.join(process.cwd(), '..', '..');
const doc = (name: string): string | null => {
  try {
    return readFileSync(path.join(REPO, 'docs', name), 'utf8');
  } catch {
    return null;
  }
};

/** The git log is the same for every visitor: asked for at most once a minute. */
const LOG_TTL_MS = 60_000;
let cachedLog: { readonly at: number; readonly chart: CommitChart | null } | null = null;

function commitChart(): CommitChart | null {
  if (cachedLog && Date.now() - cachedLog.at < LOG_TTL_MS) return cachedLog.chart;
  let chart: CommitChart | null;
  try {
    // Fixed arguments, no shell: nothing from a request reaches the command.
    const log = execFileSync('git', ['log', '--no-merges', '--name-only', `--format=${LOG_FORMAT}`], { cwd: REPO, encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    chart = commitsOverTime(parseGitLog(log));
  } catch {
    chart = null; // No git here (a deployed bundle), or it took too long: the chart is left out.
  }
  cachedLog = { at: Date.now(), chart };
  return chart;
}

export interface Built {
  readonly sessions: readonly Session[];
  readonly commits: CommitChart | null;
  /** The benchmark's overall table, and the line that says how it was produced. */
  readonly benchmark: { readonly table: MarkdownTable; readonly generated: string | null } | null;
  /** Token counts in the older, simpler shape of docs/tokens.json. Used only when the file is not the measured report. */
  readonly tokens: readonly TokenRow[];
  /** docs/tokens.json as scripts/tokens.py writes it: the measured tokens, and what was not measured. */
  readonly tokenReport: TokenReport | null;
  /** docs/how-built.json: models and tools per session, the other agents, what agents and the human did. */
  readonly facts: HowBuilt | null;
  /** Who made the game's sound, as far as the files on this server bear out. */
  readonly sound: string;
}

/** The generated sound pack is there when public/sfx holds at least one .mp3 (docs/SOUND_PACK.md). */
function hasSoundPack(): boolean {
  try {
    return readdirSync(path.join(process.cwd(), 'public', 'sfx')).some((file) => file.toLowerCase().endsWith('.mp3'));
  } catch {
    return false; // No such folder: no pack.
  }
}

/** A docs file as JSON, or undefined when it is missing or not JSON: its block is then left out. */
const json = (name: string): unknown => {
  try {
    return JSON.parse(doc(name) ?? '');
  } catch {
    return undefined;
  }
};

export function howItWasBuilt(): Built {
  const benchmarkDoc = doc('BENCHMARK.md');
  const table = benchmarkDoc ? parseMarkdownTable(benchmarkDoc, 'Overall') : null;
  const tokensFile = json('tokens.json');
  const tokenReport = parseTokenReport(tokensFile);
  return {
    sessions: parseSessions(doc('OVERNIGHT.md') ?? ''),
    commits: commitChart(),
    benchmark: table ? { table, generated: benchmarkDoc?.split('\n').find((line) => line.startsWith('Generated ')) ?? null } : null,
    tokens: tokenReport ? [] : parseTokens(tokensFile),
    tokenReport,
    facts: parseHowBuilt(json('how-built.json')),
    sound: soundCredit(hasSoundPack()),
  };
}
