#!/usr/bin/env python3
"""Token accounting for docs/tokens.json (owner: [MASTER]).

Sums the usage that Claude Code records in its local session transcripts for this repository:
~/.claude/projects/<this checkout's path with / replaced by ->/*.jsonl and their subagents/*.jsonl.
Those are the files `ccusage` reads; this script reads only this project's and runs no third-party code.

  python3 scripts/tokens.py                       print the table
  python3 scripts/tokens.py --write docs/tokens.json

Every API response is one or more transcript lines with the same message id and request id, each carrying the
response's usage: a response is counted once. The arena rows come from docs/arena-results.json and the Jev call
counts from that file and docs/BENCHMARK.md. Nothing is estimated: what has no log is listed as not measured.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PROJECT = Path.home() / '.claude' / 'projects' / str(REPO).replace('/', '-')
# The hackathon opened on Friday 9 October 2026 at 18:00 local time (CEST, UTC+2).
SINCE = datetime(2026, 10, 9, 16, 0, tzinfo=timezone.utc)
ROLE = re.compile(r'\[(SIM|GAME|UI|BRAIN|LAB|MASTER)\]')
FIELDS = ('input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens')
ARENA = REPO / 'docs' / 'arena-results.json'
BENCHMARK = REPO / 'docs' / 'BENCHMARK.md'
NOT_MEASURED = (
    ('The asset agent (ChatGPT / Codex driving Blender and the Bambu Studio command line)',
     'runs outside Claude Code; no token log reaches this repository'),
    ('The orchestration chat that wrote the specs and the prompts the human pasted into the sessions',
     'a separate chat; no token log reaches this repository'),
    ('Claude Design (the mockups in docs/design/v1)', 'no token log reaches this repository'),
    ('Any Claude Code session for this project that did not run from this checkout on this Mac',
     "only this checkout's transcripts are read"),
)


def read(path: Path, since: datetime) -> tuple[dict, list[str]]:
    """One transcript: usage per API response (deduplicated), models, titles, time span."""
    seen = {}
    titles = []
    for line in path.open(encoding='utf-8', errors='replace'):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        kind = entry.get('type')
        if kind == 'custom-title':
            title = entry.get('customTitle') or entry.get('title')
            if title:
                titles.append(title)
            continue
        if kind != 'assistant':
            continue
        message = entry.get('message') or {}
        usage = message.get('usage')
        stamp = entry.get('timestamp')
        if not usage or not stamp or message.get('model') in (None, '<synthetic>'):
            continue
        at = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
        if at < since:
            continue
        key = (message.get('id'), entry.get('requestId'))
        previous = seen.get(key)
        # The lines of one response repeat its usage; keep the fullest one.
        if previous is None or (usage.get('output_tokens') or 0) > (previous['usage'].get('output_tokens') or 0):
            seen[key] = {'usage': usage, 'model': message['model'], 'at': at if previous is None else min(at, previous['at'])}
    return seen, titles


def total(responses: dict) -> dict[str, int]:
    sums = {field: 0 for field in FIELDS}
    for response in responses.values():
        for field in FIELDS:
            sums[field] += int(response['usage'].get(field) or 0)
    return sums


def session_row(path: Path, since: datetime) -> dict | None:
    main, titles = read(path, since)
    agents = {}
    agent_files = sorted((path.parent / path.stem / 'subagents').glob('*.jsonl')) if (path.parent / path.stem).is_dir() else []
    for agent_file in agent_files:
        responses, _ = read(agent_file, since)
        agents.update({(agent_file.name,) + key: value for key, value in responses.items()})
    if not main and not agents:
        return None
    everything = {**{('main',) + key: value for key, value in main.items()}, **agents}
    sums = total(everything)
    sub = total(agents)
    title = titles[-1] if titles else ''
    role = (ROLE.search(title) or [None, None])[1] if ROLE.search(title) else None
    times = [response['at'] for response in everything.values()]
    models = sorted({response['model'] for response in everything.values()})
    return {
        'name': f'[{role}]' if role else (title or path.stem[:8]),
        'role': role.lower() if role else None,
        'title': title,
        'sessionId': path.stem,
        'models': models,
        'mainModels': sorted({response['model'] for response in main.values()}),
        'subagentModels': sorted({response['model'] for response in agents.values()}),
        'inputTokens': sums['input_tokens'],
        'outputTokens': sums['output_tokens'],
        'cacheWriteTokens': sums['cache_creation_input_tokens'],
        'cacheReadTokens': sums['cache_read_input_tokens'],
        'totalTokens': sum(sums.values()),
        'apiResponses': len(everything),
        'subagents': len(agent_files),
        'subagentTokens': sum(sub.values()),
        'firstAt': min(times).astimezone().isoformat(timespec='minutes'),
        'lastAt': max(times).astimezone().isoformat(timespec='minutes'),
        'source': 'Claude Code local transcript of the session and its subagents (message.usage, one count per API response)',
    }


def arena_row(track: str, contestant: dict) -> dict:
    """One paid arena contestant: the tokens per run its provider reported, times the runs of that row."""
    runs = contestant.get('runs') or 0
    row = {
        'track': track,
        'contestant': contestant.get('label'),
        'modelId': contestant.get('modelId'),
        'runs': runs,
        'inputTokensPerRun': contestant['inputTokens'],
        'outputTokensPerRun': contestant['outputTokens'],
        'inputTokens': round(contestant['inputTokens'] * runs),
        'outputTokens': round(contestant['outputTokens'] * runs),
        'costUsd': contestant.get('totalCostUsd'),
    }
    facts = contestant.get('facts') or {}
    extra = {}
    if facts.get('totalCostUsd') is not None:
        extra = {'factsColumnCostUsd': facts['totalCostUsd'],
                 'factsColumnTokens': 'not measured: the results file records the cost of the facts-only runs, not their tokens'}
    return {**row, 'totalTokens': row['inputTokens'] + row['outputTokens'], **extra}


def arena_section(results: dict) -> dict:
    tracks = (('rail', results), ('lab', results.get('lab') or {}))
    rows = [arena_row(track, contestant) for track, block in tracks
            for contestant in block.get('contestants', []) if 'inputTokens' in contestant]
    return {
        'method': 'docs/arena-results.json as published: the tokens per run each provider reported × the runs of that row '
                  '(the "verdict" column). Cost = reported tokens × the provider\'s official price; sources in docs/ARENA.md.',
        'rows': rows,
        'total': {
            'inputTokens': sum(row['inputTokens'] for row in rows),
            'outputTokens': sum(row['outputTokens'] for row in rows),
            'totalTokens': sum(row['totalTokens'] for row in rows),
            'costUsd': round(sum(row['costUsd'] or 0 for row in rows), 2),
            'factsColumnCostUsd': round(sum(row.get('factsColumnCostUsd') or 0 for row in rows), 2),
        },
        'notMeasured': 'Tokens of the facts-only columns (their cost is recorded, their tokens are not), and every arena call '
                       'that is not in the published tables: superseded arena runs and the live Arena races on the big screen.',
    }


def jev_section(results: dict, benchmark: str) -> dict:
    """Jev is counted in calls: its API answers with a choice and reports no tokens."""
    arena_calls = []
    for track, block in (('rail', results), ('lab', results.get('lab') or {})):
        for contestant in block.get('contestants', []):
            if contestant.get('kind') != 'jev' and not str(contestant.get('modelId', '')).startswith('jev'):
                continue
            for column, figures in (('verdict', contestant), ('facts only', contestant.get('facts') or {})):
                if figures.get('runs') and figures.get('decisionsPerRun'):
                    arena_calls.append({'track': track, 'column': column, 'runs': figures['runs'],
                                        'decisionsPerRun': figures['decisionsPerRun'],
                                        'calls': round(figures['runs'] * figures['decisionsPerRun'])})
    asked = re.search(r'Decisions asked: (\d+)', benchmark)
    return {
        'method': 'Calls, not tokens: the Jev API answers with a choice and its probabilities and reports no token count.',
        'tokens': 'not measured',
        'benchmarkCalls': int(asked.group(1)) if asked else None,
        'benchmarkSource': 'docs/BENCHMARK.md, "Decisions asked", the last full benchmark run; earlier runs were overwritten',
        'arenaCalls': arena_calls,
        'arenaCallsTotal': sum(row['calls'] for row in arena_calls),
        'arenaSource': 'docs/arena-results.json: runs × mean decisions per run of the Jev rows (rounded)',
        'notMeasured': 'Jev calls made by the game itself (play, ghosts, Room Race bots, the QA gate, tuning tables): '
                       'counted in server memory only and lost on restart.',
    }


def grand_total(claude_code: dict, arena: dict) -> dict:
    return {
        'claudeCodeTokens': claude_code['totalTokens'],
        'arenaApiTokens': arena['total']['totalTokens'],
        'measuredTokens': claude_code['totalTokens'] + arena['total']['totalTokens'],
        'note': 'Measured tokens only: Claude Code sessions (input + output + cache write + cache read) plus the published arena '
                f"tables. Of the Claude Code figure, {claude_code['cacheReadTokens']:,} are cache reads (the conversation re-read "
                f"from cache on every turn); fresh input is {claude_code['inputTokens']:,}, cache writes "
                f"{claude_code['cacheWriteTokens']:,}, output {claude_code['outputTokens']:,}. Everything listed under "
                'notMeasured is excluded, not estimated.',
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--write')
    args = parser.parse_args()
    if not PROJECT.is_dir():
        sys.exit(f'no Claude Code transcripts for this checkout under ~/.claude/projects/{PROJECT.name}')
    rows = [row for row in (session_row(path, SINCE) for path in sorted(PROJECT.glob('*.jsonl'))) if row]
    rows.sort(key=lambda row: row['firstAt'])
    keys = ('inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens', 'totalTokens', 'apiResponses')
    sums = {key: sum(row[key] for row in rows) for key in keys}
    for row in rows:
        print(f"{row['name']:<10} {row['totalTokens']:>14,}  in {row['inputTokens']:>10,}  out {row['outputTokens']:>10,}  "
              f"cache write {row['cacheWriteTokens']:>12,}  cache read {row['cacheReadTokens']:>14,}  {row['apiResponses']:>6} responses  "
              f"{row['firstAt'][5:16]} → {row['lastAt'][5:16]}  {', '.join(row['models'])}  {row['title'][:40]}")
    print(f"{'TOTAL':<10} {sums['totalTokens']:>14,}  in {sums['inputTokens']:>10,}  out {sums['outputTokens']:>10,}  "
          f"cache write {sums['cacheWriteTokens']:>12,}  cache read {sums['cacheReadTokens']:>14,}  {sums['apiResponses']:>6} responses")
    if args.write:
        results = json.loads(ARENA.read_text()) if ARENA.exists() else {}
        arena = arena_section(results)
        document = {
            'generatedAt': datetime.now().astimezone().isoformat(timespec='minutes'),
            'since': SINCE.astimezone().isoformat(timespec='minutes'),
            'total': grand_total(sums, arena),
            'claudeCode': {
                'method': 'python3 scripts/tokens.py: sums message.usage from the Claude Code transcripts of this repository on the '
                          "human's Mac (the files ccusage reads), one count per API response, sessions and their subagents. "
                          'totalTokens = input + output + cache write + cache read, as ccusage defines it. Sessions were still '
                          'running at generatedAt.',
                'sessions': rows,
                'total': sums,
            },
            'arena': arena,
            'jev': jev_section(results, BENCHMARK.read_text() if BENCHMARK.exists() else ''),
            'notMeasured': [{'what': what, 'why': why} for what, why in NOT_MEASURED],
            # The /lab page reads `sessions` at the top level.
            'sessions': [{'name': row['name'], 'inputTokens': row['inputTokens'], 'outputTokens': row['outputTokens'],
                          'cacheWriteTokens': row['cacheWriteTokens'], 'cacheReadTokens': row['cacheReadTokens'],
                          'totalTokens': row['totalTokens'], 'models': row['models']} for row in rows],
        }
        target = Path(args.write)
        target.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')
        print(f'wrote {target}')

if __name__ == '__main__':
    main()
