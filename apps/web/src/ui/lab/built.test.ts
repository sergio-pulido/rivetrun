import { describe, expect, it } from 'vitest';
import { commitsOverTime, ownerOf, parseGitLog, parseMarkdownTable, parseSessions, parseTokens, soundCredit } from './built';

const SESSIONS = `# Program

## Sessions
| Session | Role | Owns |
|---|---|---|
| [MASTER] (new) | Orchestrator and QA. Writes no feature code. | docs/OVERNIGHT.md, e2e/** |
| [SIM] | Physics, terrain, weather | as in docs/FAST_MODE.md |
| ChatGPT · Blender | Assets. Not reachable by the sessions. | assets/** |

## Protocol
| not | this |
`;

describe('parseSessions', () => {
  it('reads the sessions table and nothing after it', () => {
    expect(parseSessions(SESSIONS)).toEqual([
      { name: 'MASTER', role: 'Orchestrator and QA. Writes no feature code.' },
      { name: 'SIM', role: 'Physics, terrain, weather' },
      { name: 'ChatGPT · Blender', role: 'Assets. Not reachable by the sessions.' },
    ]);
  });

  it('is empty when the file has no such table', () => {
    expect(parseSessions('# Nothing here')).toEqual([]);
  });
});

describe('ownerOf', () => {
  it('names the session that owns most of the files a commit touched', () => {
    expect(ownerOf(['packages/sim/src/physics.ts', 'packages/sim/src/weather.ts', 'docs/CHANGES.md'])).toBe('sim');
    expect(ownerOf(['apps/web/src/game/hud/RunHud.tsx'])).toBe('game');
    expect(ownerOf(['apps/web/src/ui/brief/Brief.tsx', 'apps/web/src/state/build.ts', 'apps/web/app/lab/page.tsx'])).toBe('ui');
    expect(ownerOf(['apps/web/app/api/ghost/route.ts', 'packages/brain/src/index.ts', 'apps/web/app/screen/RaceTrack.tsx'])).toBe('brain');
    expect(ownerOf(['packages/lab/src/grid.ts', 'apps/web/app/scenarios/page.tsx'])).toBe('lab');
    expect(ownerOf(['assets/blender/parts/x.blend', 'apps/web/public/models/parts/x.glb', 'apps/web/public/renders/parts/x.png'])).toBe('assets');
    expect(ownerOf(['docs/OVERNIGHT.md', 'e2e/smoke.spec.ts'])).toBe('plans');
  });

  it('gives the run page and the run store to the sim, and says other when it cannot tell', () => {
    expect(ownerOf(['apps/web/app/run/[mission]/useRun.ts', 'apps/web/src/state/run.ts'])).toBe('sim');
    expect(ownerOf(['package.json'])).toBe('other');
    expect(ownerOf([])).toBe('other');
  });
});

const LOG = `@@a1|2026-10-09T20:18:24+02:00|feat: sim core
packages/sim/src/physics.ts

@@b2|2026-10-09T20:50:00+02:00|feat: ui home
apps/web/src/ui/home/Bench.tsx
apps/web/app/page.tsx

@@c3|2026-10-09T22:05:00+02:00|feat: game hud
apps/web/src/game/hud/RunHud.tsx
@@d4|2026-10-09T22:40:00+02:00|docs: plan
docs/DEMO_PLAN.md
`;

describe('parseGitLog and commitsOverTime', () => {
  const commits = parseGitLog(LOG);

  it('reads each commit with its time and files', () => {
    expect(commits.map((commit) => [commit.hash, commit.owner, commit.files.length])).toEqual([['a1', 'sim', 1], ['b2', 'ui', 2], ['c3', 'game', 1], ['d4', 'plans', 1]]);
  });

  it('counts commits per session per hour, with empty hours kept so the time axis is even', () => {
    const chart = commitsOverTime(commits);
    expect(chart.total).toBe(4);
    expect(chart.totals).toMatchObject({ sim: 1, ui: 1, game: 1, plans: 1 });
    expect(chart.buckets.map((bucket) => [bucket.label, bucket.count])).toEqual([['20h', 2], ['21h', 0], ['22h', 2]]);
    expect(chart.buckets[0]!.counts).toMatchObject({ sim: 1, ui: 1 });
    expect(chart.peak).toBe(2);
  });

  it('has nothing to chart without commits', () => {
    expect(commitsOverTime([])).toMatchObject({ total: 0, buckets: [], peak: 0 });
  });
});

describe('parseMarkdownTable', () => {
  const doc = `# Bench

Generated 2026-10-09 by a script.

## Overall, per policy
| Policy | Runs | Mean score |
| - | - | - |
| Jev | 90 | 485 |
| Heuristic | 90 | 516 |

## Per mission
| Mission | Runs |
| - | - |
| M1 | 15 |
`;

  it('reads the table under a heading', () => {
    expect(parseMarkdownTable(doc, 'Overall')).toEqual({ headers: ['Policy', 'Runs', 'Mean score'], rows: [['Jev', '90', '485'], ['Heuristic', '90', '516']] });
  });

  it('is null when the heading or its table is missing', () => {
    expect(parseMarkdownTable(doc, 'Nope')).toBeNull();
    expect(parseMarkdownTable('## Overall\n\nno table', 'Overall')).toBeNull();
  });
});

describe('parseTokens', () => {
  it('reads a list of sessions with their token counts', () => {
    expect(parseTokens({ sessions: [{ name: 'UI', inputTokens: 1200000, outputTokens: 80000 }, { name: 'SIM', tokens: 5 }] })).toEqual([
      { name: 'UI', input: 1200000, output: 80000, total: 1280000 },
      { name: 'SIM', input: null, output: null, total: 5 },
    ]);
  });

  it('reads a plain name-to-count record too', () => {
    expect(parseTokens({ UI: 10, SIM: 20 })).toEqual([{ name: 'UI', input: null, output: null, total: 10 }, { name: 'SIM', input: null, output: null, total: 20 }]);
  });

  it('is empty for anything else: no figure is made up', () => {
    expect(parseTokens(null)).toEqual([]);
    expect(parseTokens({ sessions: [{ name: 'UI' }] })).toEqual([]);
    expect(parseTokens('lots')).toEqual([]);
  });
});

describe('soundCredit', () => {
  it('credits ElevenLabs only while its files are there', () => {
    expect(soundCredit(true)).toBe('Ambience, announcer and stingers: ElevenLabs. Engine and event sounds: procedural WebAudio.');
    expect(soundCredit(false)).toBe('Engine and event sounds: procedural WebAudio.');
  });
});
