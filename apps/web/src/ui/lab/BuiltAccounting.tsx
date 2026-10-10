import type { ReactNode } from 'react';
import { NOT_MEASURED, exact, short, usd, type HowBuilt, type TokenReport, type TokenSplit } from './accounting';

const NOTE = 'text-[11px] leading-snug text-muted lg:text-[13px]';
const NAME = 'font-display text-[13px] font-semibold leading-tight text-text lg:text-[15px]';
const MONO = 'font-mono text-[11px] leading-snug lg:text-xs';
const FULL = 'lg:col-span-2';

function Block({ title, children, className = '' }: { readonly title: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <h3 className="rr-label">{title}</h3>
      {children}
    </div>
  );
}

/** "Not measured" wherever a file says so: in amber, so it is never read as a zero. */
function Unmeasured({ children = NOT_MEASURED }: { readonly children?: ReactNode }) {
  return <span className="font-mono text-[11px] font-medium text-warn lg:text-xs">{children}</span>;
}

function Did({ title, items, tone }: { readonly title: string; readonly items: readonly string[]; readonly tone: 'agents' | 'human' }) {
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-col gap-2 rounded-[14px] border p-3.5 ${tone === 'agents' ? 'border-cyan-line bg-cyan-deep' : 'border-[#3A2A1C] bg-[#17120D]'}`}>
      <h3 className={`font-display text-lg font-bold leading-none ${tone === 'agents' ? 'text-cyan-soft' : 'text-orange-soft'}`}>{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[13px] leading-snug text-text-2 lg:text-sm">
            <span aria-hidden="true" className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'agents' ? 'bg-cyan' : 'bg-orange'}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Who and what built the game, from docs/how-built.json: models and tools per session, the other agents, and the two columns. */
export function BuiltFacts({ facts }: { readonly facts: HowBuilt }) {
  const { sessions, otherAgents, runtimeModels, tools, agentsDid, humanDid } = facts;
  return (
    <>
      {agentsDid.length + humanDid.length > 0 ? (
        <div className={`grid gap-3 lg:grid-cols-2 lg:gap-x-8 ${FULL}`} data-testid="built-did">
          <Did title="Agents did" items={agentsDid} tone="agents" />
          <Did title="Human did by hand" items={humanDid} tone="human" />
        </div>
      ) : null}

      {sessions.length > 0 ? (
        <Block title="Sessions · model and tools" className={FULL}>
          <ul className="flex flex-col" data-testid="built-sessions">
            {sessions.map((session) => (
              <li key={session.name} className="grid gap-x-4 gap-y-1 border-t border-tag py-2 first:border-t-0 lg:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.6fr)]">
                <span className="font-mono text-[11px] font-semibold tracking-[1px] text-orange-soft lg:text-[13px]">{session.name}</span>
                <span className="min-w-0">
                  <span className={`block text-text ${MONO}`}>{session.model}</span>
                  {session.tools.length > 0 ? <span className={`mt-0.5 block text-muted ${MONO}`}>{session.tools.join(' · ')}</span> : null}
                </span>
                <span className="min-w-0 text-xs leading-snug text-text-2 lg:text-sm">{session.did}</span>
              </li>
            ))}
          </ul>
          <p className={NOTE}>The model is the one each session&apos;s own transcript recorded.</p>
        </Block>
      ) : null}

      {otherAgents.length > 0 ? (
        <Block title="Other agents">
          <ul className="flex flex-col">
            {otherAgents.map((agent) => (
              <li key={agent.name} className="flex flex-col gap-0.5 border-t border-tag py-2 first:border-t-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={NAME}>{agent.name}</span>
                  <span className="shrink-0 text-right">
                    <span className={`text-muted ${MONO}`}>tokens </span>
                    {agent.tokens && agent.tokens !== NOT_MEASURED ? <span className={`text-text-2 ${MONO}`}>{agent.tokens}</span> : <Unmeasured />}
                  </span>
                </span>
                <span className={`text-muted ${MONO}`}>{[agent.model, ...agent.tools].join(' · ')}</span>
                <span className="text-xs leading-snug text-text-2 lg:text-sm">{agent.did}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {runtimeModels.length > 0 ? (
        <Block title="Models in the game and the arena">
          <ul className="flex flex-col">
            {runtimeModels.map((model) => (
              <li key={model.name} className="flex flex-col gap-0.5 border-t border-tag py-2 first:border-t-0">
                <span className={NAME}>{model.name}</span>
                <span className={`text-muted ${MONO}`}>{model.model}</span>
                <span className="text-xs leading-snug text-text-2 lg:text-sm">{model.use}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {tools.length > 0 ? (
        <Block title="Tools" className={FULL}>
          <ul className="grid gap-x-8 lg:grid-cols-2" data-testid="built-tools">
            {tools.map((tool) => (
              <li key={tool.name} className="flex flex-col gap-0.5 border-t border-tag py-2">
                <span className={NAME}>{tool.name}</span>
                <span className="text-xs leading-snug text-text-2 lg:text-sm">{tool.use}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  );
}

const SPLIT: readonly (readonly [keyof TokenSplit, string])[] = [
  ['totalTokens', 'Total'],
  ['inputTokens', 'Input'],
  ['outputTokens', 'Output'],
  ['cacheWriteTokens', 'Cache write'],
  ['cacheReadTokens', 'Cache read'],
];

/** The measured tokens, from docs/tokens.json: the total, the split per session, the arena, Jev in calls, and what was not measured. */
export function BuiltTokens({ report }: { readonly report: TokenReport }) {
  const { total, sessions, claudeCode, arena, jev, notMeasured } = report;
  const cell = 'whitespace-nowrap px-2 py-2';
  return (
    <Block title="Tokens · measured" className={FULL}>
      {total ? (
        <div className="rounded-[14px] border border-line bg-panel-2 p-3.5" data-testid="built-tokens-total">
          <p className="font-mono text-[26px] font-semibold leading-none tabular-nums text-text lg:text-[34px]">{exact(total.measuredTokens)}</p>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[1px] text-muted lg:text-xs">
            measured tokens
            {total.claudeCodeTokens != null ? ` · Claude Code ${exact(total.claudeCodeTokens)}` : ''}
            {total.arenaApiTokens != null ? ` · arena ${exact(total.arenaApiTokens)}` : ''}
          </p>
          {total.note ? <p className="mt-2 text-xs leading-snug text-text-2 lg:text-sm">{total.note}</p> : null}
        </div>
      ) : null}

      {sessions.length > 0 ? (
        <div className="rr-scroll-x -mx-4 px-4">
          <table className="w-full min-w-[640px] border-collapse text-right font-mono text-xs tabular-nums lg:text-sm" data-testid="built-tokens-sessions">
            <caption className="sr-only">Measured tokens per Claude Code session, with input, output, cache write and cache read apart</caption>
            <thead>
              <tr className="text-[10px] font-medium uppercase tracking-[1px] text-muted lg:text-[11px]">
                <th scope="col" className="sticky left-0 bg-panel py-2 pr-2 text-left font-medium">
                  Session
                </th>
                {SPLIT.map(([key, label]) => (
                  <th key={key} scope="col" className={`${cell} font-medium`}>
                    {label}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-left font-medium">
                  Models
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.name} className="border-t border-tag">
                  <th scope="row" className="sticky left-0 bg-panel py-2 pr-2 text-left font-display text-[13px] font-semibold text-text lg:text-[15px]">
                    {session.name}
                  </th>
                  {SPLIT.map(([key]) => (
                    <td key={key} className={`${cell} ${key === 'totalTokens' ? 'font-semibold text-text' : 'text-text-2'}`} title={exact(session[key])}>
                      {short(session[key])}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-left text-[11px] text-muted">{session.models.join(', ')}</td>
                </tr>
              ))}
              {claudeCode?.total ? (
                <tr className="border-t border-line-3">
                  <th scope="row" className="sticky left-0 bg-panel py-2 pr-2 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-muted">
                    All sessions
                  </th>
                  {SPLIT.map(([key]) => (
                    <td key={key} className={`${cell} font-semibold ${key === 'totalTokens' ? 'text-text' : 'text-text-2'}`} title={exact(claudeCode.total![key])}>
                      {short(claudeCode.total![key])}
                    </td>
                  ))}
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {sessions.length > 0 ? <p className={NOTE}>Cache read is the conversation re-read from cache on every turn, not fresh input: the four columns are kept apart for that reason.</p> : null}
      {claudeCode?.method ? <p className={NOTE}>Source: {claudeCode.method}</p> : null}

      <div className="grid gap-x-8 gap-y-3 pt-1 lg:grid-cols-2">
        {arena ? (
          <div className="flex flex-col gap-1" data-testid="built-tokens-arena">
            <p className="flex items-baseline justify-between gap-2 border-t border-tag pt-2">
              <span className={NAME}>Arena models</span>
              <span className="text-right font-mono text-xs tabular-nums text-text-2 lg:text-sm">
                {arena.total ? (
                  <>
                    <span className="font-semibold text-text">{exact(arena.total.totalTokens)}</span> tokens
                    {arena.total.costUsd != null ? ` · ${usd(arena.total.costUsd)}` : ''}
                  </>
                ) : (
                  <Unmeasured />
                )}
              </span>
            </p>
            {arena.total?.factsColumnCostUsd != null ? (
              <p className={NOTE}>
                Facts-only columns: {usd(arena.total.factsColumnCostUsd)} recorded, tokens <Unmeasured />.
              </p>
            ) : null}
            {arena.rows.length > 0 ? (
              <details>
                <summary className="cursor-pointer list-none font-mono text-[10px] font-medium uppercase tracking-[1px] text-orange-soft lg:text-[11px]">Per model · {arena.rows.length} rows</summary>
                <ul className="mt-1 flex flex-col">
                  {arena.rows.map((row) => (
                    <li key={`${row.track}:${row.contestant}`} className="flex items-baseline justify-between gap-2 border-t border-tag py-1">
                      <span className="min-w-0 text-xs text-text-2">
                        {row.contestant}{' '}
                        <span className="font-mono text-[10px] text-muted">
                          {row.track} · {row.runs} runs
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-2">
                        {exact(row.totalTokens)}
                        {row.costUsd != null ? ` · ${usd(row.costUsd)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {arena.method ? <p className={NOTE}>Source: {arena.method}</p> : null}
            {arena.notMeasured ? (
              <p className={NOTE}>
                <Unmeasured>Not measured:</Unmeasured> {arena.notMeasured}
              </p>
            ) : null}
          </div>
        ) : null}

        {jev ? (
          <div className="flex flex-col gap-1" data-testid="built-tokens-jev">
            <p className="flex items-baseline justify-between gap-2 border-t border-tag pt-2">
              <span className={NAME}>Jev</span>
              <span className="text-right">
                <span className={`text-muted ${MONO}`}>tokens </span>
                <Unmeasured />
              </span>
            </p>
            {jev.benchmarkCalls != null || jev.arenaCallsTotal != null ? (
              <p className="font-mono text-xs tabular-nums text-text-2 lg:text-sm">
                {[jev.benchmarkCalls != null ? `${exact(jev.benchmarkCalls)} benchmark calls` : null, jev.arenaCallsTotal != null ? `${exact(jev.arenaCallsTotal)} arena calls` : null].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            {jev.method ? <p className={NOTE}>{jev.method}</p> : null}
            {jev.notMeasured ? (
              <p className={NOTE}>
                <Unmeasured>Not measured:</Unmeasured> {jev.notMeasured}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {notMeasured.length > 0 ? (
        <div className="mt-1 rounded-[12px] border border-warn/40 px-3 py-2.5" data-testid="built-not-measured">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[1.5px] text-warn lg:text-[11px]">Not measured · excluded from the total, not estimated</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {notMeasured.map((entry) => (
              <li key={entry.what} className="text-xs leading-snug text-text-2 lg:text-sm">
                {entry.what}: <Unmeasured /> <span className="text-muted">({entry.why})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Block>
  );
}
