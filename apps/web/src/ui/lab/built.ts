// /lab "How it was built": who built RivetRun, when the commits landed, and what was measured. Everything is read from
// the repository (docs, git log); these are the pure parsers. Nothing here invents a figure.

export interface Session {
  readonly name: string;
  readonly role: string;
}

const cells = (line: string): readonly string[] => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
const isRule = (line: string): boolean => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

export interface MarkdownTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** The first table under the first "## <heading…>" whose title starts with `heading`. Null when there is none. */
export function parseMarkdownTable(markdown: string, heading: string): MarkdownTable | null {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## ') && line.slice(3).trim().toLowerCase().startsWith(heading.toLowerCase()));
  if (start < 0) return null;
  const nextHeading = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const section = lines.slice(start + 1, nextHeading < 0 ? undefined : nextHeading);
  const first = section.findIndex((line) => line.trim().startsWith('|'));
  if (first < 0 || !isRule(section[first + 1] ?? '')) return null;
  const body = section.slice(first + 2);
  const end = body.findIndex((line) => !line.trim().startsWith('|'));
  return { headers: cells(section[first]!), rows: (end < 0 ? body : body.slice(0, end)).map(cells) };
}

/** The sessions and their roles from the program's "## Sessions" table. Names lose their brackets and "(new)". */
export function parseSessions(markdown: string): readonly Session[] {
  const table = parseMarkdownTable(markdown, 'Sessions');
  if (!table) return [];
  return table.rows.flatMap((row): Session[] => {
    const name = (row[0] ?? '').replace(/\(new\)/i, '').replace(/[[\]]/g, '').trim();
    const role = (row[1] ?? '').trim();
    return name && role ? [{ name, role }] : [];
  });
}

export const OWNERS = ['sim', 'game', 'ui', 'brain', 'lab', 'assets', 'plans', 'other'] as const;
export type Owner = (typeof OWNERS)[number];

/** Path prefixes per owner, from the ownership tables in docs/FAST_MODE.md and docs/OVERNIGHT.md. First match wins. */
const OWNED: readonly (readonly [string, Owner])[] = [
  ['packages/lab/', 'lab'],
  ['apps/web/app/scenarios/', 'lab'],
  ['apps/web/src/lab/', 'lab'],
  ['assets/', 'assets'],
  ['apps/web/public/models/', 'assets'],
  ['apps/web/public/renders/', 'assets'],
  ['apps/web/src/game/', 'game'],
  ['apps/web/app/run/', 'sim'],
  ['apps/web/src/state/run.ts', 'sim'],
  ['packages/sim/', 'sim'],
  ['packages/contracts/', 'sim'],
  ['packages/brain/', 'brain'],
  ['packages/db/', 'brain'],
  ['apps/web/app/api/', 'brain'],
  ['apps/web/app/race/', 'brain'],
  ['apps/web/app/screen/', 'brain'],
  ['apps/web/app/leaderboard/', 'brain'],
  ['apps/web/src/brain/', 'brain'],
  ['apps/web/src/ui/', 'ui'],
  ['apps/web/src/state/', 'ui'],
  ['apps/web/app/', 'ui'],
  ['docs/', 'plans'],
  ['e2e/', 'plans'],
];

const ownerOfPath = (path: string): Owner => OWNED.find(([prefix]) => path.startsWith(prefix))?.[1] ?? 'other';

/** The session a commit belongs to: the owner of most of the files it touched. All sessions commit under one git author. */
export function ownerOf(files: readonly string[]): Owner {
  const counts = new Map<Owner, number>();
  for (const file of files) counts.set(ownerOfPath(file), (counts.get(ownerOfPath(file)) ?? 0) + 1);
  // Files nobody owns never outvote a file that has an owner.
  const ranked = [...counts.entries()].filter(([owner]) => owner !== 'other').sort((a, b) => b[1] - a[1] || OWNERS.indexOf(a[0]) - OWNERS.indexOf(b[0]));
  return ranked[0]?.[0] ?? 'other';
}

export interface Commit {
  readonly hash: string;
  /** ISO time with the author's offset, as git printed it. */
  readonly at: string;
  readonly subject: string;
  readonly files: readonly string[];
  readonly owner: Owner;
}

/** The marker each commit starts with in `git log --name-only --format=@@%h|%aI|%s`. */
export const LOG_FORMAT = '@@%h|%aI|%s';

/** Commits oldest first, each with the files it touched and the session those belong to. */
export function parseGitLog(text: string): readonly Commit[] {
  const commits: Commit[] = [];
  for (const chunk of text.split(/^@@/m).slice(1)) {
    const [head = '', ...rest] = chunk.split('\n');
    const [hash = '', at = '', ...subject] = head.split('|');
    const files = rest.map((line) => line.trim()).filter((line) => line.length > 0);
    if (hash && !Number.isNaN(Date.parse(at))) commits.push({ hash, at, subject: subject.join('|'), files, owner: ownerOf(files) });
  }
  return commits.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export interface Bucket {
  /** The hour on the author's clock, e.g. "22h". */
  readonly label: string;
  readonly count: number;
  readonly counts: Readonly<Partial<Record<Owner, number>>>;
}

export interface CommitChart {
  readonly total: number;
  readonly totals: Readonly<Partial<Record<Owner, number>>>;
  /** One per hour from the first commit to the last, empty hours included. */
  readonly buckets: readonly Bucket[];
  /** The busiest hour's count, for the chart's scale. */
  readonly peak: number;
}

const HOUR_MS = 3_600_000;
/** The hour as the author's clock showed it: read off the ISO string, so the server's time zone does not matter. */
const hourOf = (iso: string): number => Number(iso.slice(11, 13));

export function commitsOverTime(commits: readonly Commit[]): CommitChart {
  if (commits.length === 0) return { total: 0, totals: {}, buckets: [], peak: 0 };
  const tally = (list: readonly Commit[]): Partial<Record<Owner, number>> => list.reduce<Partial<Record<Owner, number>>>((acc, commit) => ({ ...acc, [commit.owner]: (acc[commit.owner] ?? 0) + 1 }), {});
  const slot = (commit: Commit): number => Math.floor(Date.parse(commit.at) / HOUR_MS);
  const [first, last] = [slot(commits[0]!), slot(commits[commits.length - 1]!)];
  const startHour = hourOf(commits[0]!.at);
  const buckets = Array.from({ length: last - first + 1 }, (_, index): Bucket => {
    const inHour = commits.filter((commit) => slot(commit) === first + index);
    return { label: `${(startHour + index) % 24}h`, count: inHour.length, counts: tally(inHour) };
  });
  return { total: commits.length, totals: tally(commits), buckets, peak: Math.max(...buckets.map((bucket) => bucket.count)) };
}

export interface TokenRow {
  readonly name: string;
  readonly input: number | null;
  readonly output: number | null;
  readonly total: number;
}

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

/**
 * Token counts per session from docs/tokens.json, in either shape the human may write: `{ sessions: [{ name, inputTokens,
 * outputTokens }] }` (or `tokens` for a single total), or a plain `{ name: total }` record. Anything else gives no rows.
 */
export function parseTokens(raw: unknown): readonly TokenRow[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const list = (raw as { readonly sessions?: unknown }).sessions;
  if (Array.isArray(list)) {
    return list.flatMap((entry: unknown): TokenRow[] => {
      const { name, inputTokens, outputTokens, tokens } = (entry ?? {}) as { readonly name?: unknown; readonly inputTokens?: unknown; readonly outputTokens?: unknown; readonly tokens?: unknown };
      const [input, output, total] = [count(inputTokens), count(outputTokens), count(tokens)];
      if (typeof name !== 'string' || !name) return [];
      if (input !== null && output !== null) return [{ name, input, output, total: input + output }];
      return total === null ? [] : [{ name, input: null, output: null, total }];
    });
  }
  return Object.entries(raw).flatMap(([name, value]): TokenRow[] => {
    const total = count(value);
    return total === null ? [] : [{ name, input: null, output: null, total }];
  });
}
