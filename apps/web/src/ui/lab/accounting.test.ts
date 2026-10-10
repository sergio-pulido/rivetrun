import { describe, expect, it } from 'vitest';
import { exact, parseHowBuilt, parseTokenReport, short, usd } from './accounting';

const SESSION = { name: '[UI]', inputTokens: 100, outputTokens: 2000, cacheWriteTokens: 30000, cacheReadTokens: 400000, totalTokens: 432100, models: ['claude-opus-5-5'] };
const TOKENS = {
  generatedAt: '2026-10-10T12:36+02:00',
  total: { claudeCodeTokens: 432100, arenaApiTokens: 900060, measuredTokens: 1332160, note: 'Measured tokens only.' },
  sessions: [SESSION],
  claudeCode: { method: 'python3 scripts/tokens.py', sessions: [{ ...SESSION, sessionId: 'not shown' }], total: { inputTokens: 100, outputTokens: 2000, cacheWriteTokens: 30000, cacheReadTokens: 400000, totalTokens: 432100, apiResponses: 9 } },
  arena: {
    method: 'docs/arena-results.json as published',
    rows: [{ track: 'rail', contestant: 'GPT-5 nano', modelId: 'gpt-5-nano', runs: 30, inputTokens: 885720, outputTokens: 14340, totalTokens: 900060, costUsd: 0.05, factsColumnCostUsd: 0.0551 }],
    total: { inputTokens: 885720, outputTokens: 14340, totalTokens: 900060, costUsd: 0.05, factsColumnCostUsd: 0.0551 },
    notMeasured: 'Tokens of the facts-only columns.',
  },
  jev: { method: 'Calls, not tokens.', tokens: 'not measured', benchmarkCalls: 10101, arenaCallsTotal: 1687, arenaCalls: [], notMeasured: 'Jev calls made by the game itself.' },
  notMeasured: [{ what: 'The asset agent', why: 'no token log reaches this repository' }, { what: 'no reason given' }],
};

describe('parseTokenReport', () => {
  it('reads the measured total, the split per session, the arena, Jev in calls and what was not measured', () => {
    const report = parseTokenReport(TOKENS);
    expect(report?.total).toEqual({ claudeCodeTokens: 432100, arenaApiTokens: 900060, measuredTokens: 1332160, note: 'Measured tokens only.' });
    expect(report?.sessions).toEqual([SESSION]);
    expect(report?.claudeCode).toEqual({ method: 'python3 scripts/tokens.py', total: { inputTokens: 100, outputTokens: 2000, cacheWriteTokens: 30000, cacheReadTokens: 400000, totalTokens: 432100 } });
    expect(report?.arena?.rows).toEqual([{ track: 'rail', contestant: 'GPT-5 nano', modelId: 'gpt-5-nano', runs: 30, totalTokens: 900060, costUsd: 0.05 }]);
    expect(report?.arena?.total).toEqual({ totalTokens: 900060, costUsd: 0.05, factsColumnCostUsd: 0.0551 });
    expect(report?.arena?.notMeasured).toBe('Tokens of the facts-only columns.');
    expect(report?.jev).toEqual({ method: 'Calls, not tokens.', benchmarkCalls: 10101, arenaCallsTotal: 1687, notMeasured: 'Jev calls made by the game itself.' });
    expect(report?.notMeasured).toEqual([{ what: 'The asset agent', why: 'no token log reaches this repository' }]);
  });

  it('keeps the cache tokens apart: a session total is never rebuilt from input and output', () => {
    const [session] = parseTokenReport(TOKENS)?.sessions ?? [];
    expect(session?.totalTokens).toBe(432100);
    expect(session?.cacheReadTokens).toBe(400000);
  });

  it('leaves out a block that is missing or malformed and keeps the rest', () => {
    const report = parseTokenReport({ total: { measuredTokens: 5 }, sessions: [{ name: 'half a row', inputTokens: 1 }], arena: { rows: 'none' }, jev: 'unknown' });
    expect(report?.total?.measuredTokens).toBe(5);
    expect(report?.sessions).toEqual([]);
    expect(report?.arena).toEqual({ method: null, rows: [], total: null, notMeasured: null });
    expect(report?.claudeCode).toBeNull();
    expect(report?.jev).toBeNull();
  });

  it('is null for a file with no measured figure: nothing is made up', () => {
    expect(parseTokenReport({ sessions: [{ name: 'x', tokens: 12 }] })).toBeNull();
    expect(parseTokenReport({ total: { measuredTokens: -1 } })).toBeNull();
    expect(parseTokenReport(null)).toBeNull();
    expect(parseTokenReport('2 billion')).toBeNull();
  });
});

describe('parseHowBuilt', () => {
  const FILE = {
    sessions: [{ name: '[UI]', kind: 'Claude Code session', model: 'claude-opus-5-5', tools: ['Next.js 16'], did: 'Screens and layouts.' }, { name: 'no model' }],
    otherAgents: [{ name: 'Asset agent', model: 'ChatGPT / Codex', tools: ['Blender'], did: 'The MK-II model.', tokens: 'not measured' }],
    runtimeModels: [{ name: 'Jev', model: 'jev-1.13.0', use: "The robot's brain." }],
    tools: [{ name: 'Playwright', use: 'The end-to-end smoke.' }],
    agentsDid: ['The application code.', ''],
    humanDid: ['Product decisions.', 7],
  };

  it('reads the sessions, the other agents, the models, the tools and the two columns', () => {
    const built = parseHowBuilt(FILE);
    expect(built?.sessions).toEqual([{ name: '[UI]', kind: 'Claude Code session', model: 'claude-opus-5-5', tools: ['Next.js 16'], did: 'Screens and layouts.' }]);
    expect(built?.otherAgents[0]?.tokens).toBe('not measured');
    expect(built?.runtimeModels).toHaveLength(1);
    expect(built?.tools).toEqual([{ name: 'Playwright', use: 'The end-to-end smoke.' }]);
    expect(built?.agentsDid).toEqual(['The application code.']);
    expect(built?.humanDid).toEqual(['Product decisions.']);
  });

  it('is null when the file has nothing readable', () => {
    expect(parseHowBuilt({ sessions: 'six' })).toBeNull();
    expect(parseHowBuilt(undefined)).toBeNull();
  });
});

describe('figures as counted', () => {
  it('prints every digit, or a short form for table cells', () => {
    expect(exact(2156794854)).toBe('2,156,794,854');
    expect(short(2156794854)).toBe('2.16 B');
    expect(short(347264200)).toBe('347.3 M');
    expect(short(9090)).toBe('9,090');
  });

  it('prints a recorded cost in dollars', () => {
    expect(usd(3.65)).toBe('US$ 3.65');
    expect(usd(0.05)).toBe('US$ 0.05');
    expect(usd(0.012)).toBe('US$ 0.012');
  });
});
