import { BuiltFacts, BuiltTokens } from './BuiltAccounting';
import { OWNERS, type CommitChart, type Owner } from './built';
import type { Built } from './builtData';

const OWNER_LOOK: Readonly<Record<Owner, { readonly label: string; readonly color: string }>> = {
  sim: { label: 'SIM', color: '#E3B341' },
  game: { label: 'GAME', color: '#2E9D63' },
  ui: { label: 'UI', color: '#FF7A1A' },
  brain: { label: 'BRAIN', color: '#3FD0E0' },
  lab: { label: 'LAB', color: '#B58CF0' },
  assets: { label: 'Assets', color: '#8FB8D6' },
  plans: { label: 'Plans & QA', color: '#C9CED6' },
  other: { label: 'Other', color: '#6F7883' },
};

const CHART = { width: 334, height: 150, left: 22, bottom: 20, top: 8 } as const;

function Commits({ chart }: { readonly chart: CommitChart }) {
  const { width, height, left, bottom, top } = CHART;
  const plotH = height - bottom - top;
  const step = (width - left) / chart.buckets.length;
  const bar = Math.max(2, step - 2);
  const present = OWNERS.filter((owner) => (chart.totals[owner] ?? 0) > 0);
  // A label every few hours, so they never collide on a phone.
  const every = Math.max(1, Math.ceil(chart.buckets.length / 8));
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="rr-label">Commits per hour · {chart.total} commits</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={`Commits per hour by session, ${chart.total} in total, busiest hour ${chart.peak}`}>
        <line x1={left} y1={height - bottom} x2={width} y2={height - bottom} stroke="var(--color-line-2)" />
        <text x={left - 4} y={top + 7} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-muted)">
          {chart.peak}
        </text>
        <text x={left - 4} y={height - bottom} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-muted)">
          0
        </text>
        {chart.buckets.map((bucket, index) => {
          let stacked = 0;
          return (
            <g key={index}>
              {present.map((owner) => {
                const count = bucket.counts[owner] ?? 0;
                if (count === 0) return null;
                const h = (count / chart.peak) * plotH;
                stacked += h;
                return <rect key={owner} x={left + index * step + 1} y={height - bottom - stacked} width={bar} height={h} fill={OWNER_LOOK[owner].color} />;
              })}
              {index % every === 0 ? (
                <text x={left + index * step + step / 2} y={height - 6} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-muted)">
                  {bucket.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-snug text-text-2 lg:text-[13px]">
        {present.map((owner) => (
          <li key={owner} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OWNER_LOOK[owner].color }} />
            {OWNER_LOOK[owner].label}
            <span className="font-mono tabular-nums text-muted">{chart.totals[owner]}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-snug text-muted lg:text-[13px]">Every session commits under one git author, so a commit is counted for the session that owns most of the files it touched.</p>
    </figure>
  );
}

const compact = (value: number): string => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`);

/** /lab "How it was built": the sessions and their roles, when the commits landed, the benchmark, and tokens when they are provided. */
export function HowItWasBuilt({ built }: { readonly built: Built }) {
  const { sessions, commits, benchmark, tokens, tokenReport, facts, sound } = built;
  // With the facts file, each session is listed there with its model and tools: the program's shorter list is not repeated.
  const roles = facts && facts.sessions.length > 0 ? [] : sessions;
  return (
    <section className="rr-card flex flex-col gap-4 p-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8 lg:p-6" aria-labelledby="how-built">
      <div className="flex flex-col gap-1 lg:col-span-2">
        <h2 id="how-built" className="font-display text-2xl font-bold leading-none">
          How it was built
        </h2>
        <p className="text-[13px] leading-snug text-text-2 lg:text-base">Parallel AI coding sessions on one repository, each with its own files, one human setting the direction. Everything below is read from the repository.</p>
      </div>

      {facts ? <BuiltFacts facts={facts} /> : null}

      <div className="flex flex-col gap-1.5 lg:col-span-2" data-testid="built-sound">
        <h3 className="rr-label">Sound</h3>
        <p className="text-xs leading-snug text-text-2 lg:text-sm">{sound}</p>
      </div>

      {roles.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="rr-label">Sessions and roles</h3>
          <ul className="flex flex-col">
            {roles.map((session) => (
              <li key={session.name} className="flex items-baseline gap-2.5 border-t border-tag py-1.5 first:border-t-0">
                <span className="w-[92px] shrink-0 font-mono text-[11px] font-semibold tracking-[1px] text-orange-soft lg:w-[108px] lg:text-[13px]">{session.name.toUpperCase()}</span>
                <span className="min-w-0 text-xs leading-snug text-text-2 lg:text-sm">{session.role}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Alone on its row the chart would grow with the card: it keeps a readable size instead. */}
      <div className={roles.length > 0 ? '' : 'lg:col-span-2 lg:max-w-[760px]'}>
        {commits && commits.total > 0 ? <Commits chart={commits} /> : <p className="text-xs leading-snug text-muted lg:text-sm">The commit history is not available on this server.</p>}
      </div>

      {tokenReport ? <BuiltTokens report={tokenReport} /> : null}

      {benchmark ? (
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <h3 className="rr-label">Brain benchmark</h3>
          <div className="rr-scroll-x -mx-4 px-4">
            <table className="w-full min-w-[560px] border-collapse text-right font-mono text-xs tabular-nums lg:text-sm">
              <caption className="sr-only">Brain benchmark, overall per policy and briefing</caption>
              <thead>
                <tr className="text-[10px] font-medium uppercase tracking-[1px] text-muted lg:text-[11px]">
                  {benchmark.table.headers.map((header, index) => (
                    <th key={header} scope="col" className={`px-2 py-2 font-medium ${index === 0 ? 'sticky left-0 bg-panel pl-0 text-left' : 'whitespace-nowrap'}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {benchmark.table.rows.map((row) => (
                  <tr key={row[0]} className="border-t border-tag">
                    {row.map((cell, index) =>
                      index === 0 ? (
                        <th key={index} scope="row" className="sticky left-0 bg-panel py-2 pr-2 text-left font-display text-[13px] font-semibold text-text">
                          {cell}
                        </th>
                      ) : (
                        <td key={index} className="whitespace-nowrap px-2 py-2">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {benchmark.generated ? <p className="text-[11px] leading-snug text-muted lg:text-[13px]">{benchmark.generated.replaceAll('`', '')}</p> : null}
        </div>
      ) : null}

      {tokenReport ? null : (
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <h3 className="rr-label">Tokens</h3>
          {tokens.length > 0 ? (
            <ul className="flex flex-col">
              {tokens.map((row) => (
                <li key={row.name} className="flex items-baseline justify-between gap-2 border-t border-tag py-1.5 text-xs first:border-t-0">
                  <span className="font-display text-[13px] font-semibold">{row.name}</span>
                  <span className="font-mono tabular-nums text-text-2">
                    {row.input !== null && row.output !== null ? `${compact(row.input)} in · ${compact(row.output)} out · ` : ''}
                    <span className="font-semibold text-text">{compact(row.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs leading-snug text-muted lg:text-sm">Token counts have not been added yet. They appear here from docs/tokens.json.</p>
          )}
        </div>
      )}
    </section>
  );
}
