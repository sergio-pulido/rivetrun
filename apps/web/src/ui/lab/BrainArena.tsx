import { arenaLine, arenaRows, scatter, type Arena, type ContestantKind } from './arena';

const PLOT = { width: 334, height: 210, padding: 30 } as const;

/** Jev is the brain's colour everywhere; the player's orange marks the models brought in to challenge it. */
const DOT: Readonly<Record<ContestantKind, string>> = {
  jev: 'var(--color-cyan)',
  llm: 'var(--color-orange)',
  heuristic: 'var(--color-text-2)',
  random: 'var(--color-faint)',
  human: 'var(--color-ok)',
};

const COLUMNS = ['Finish', 'Score', 'Dec. / run', 'p50', 'p95', 'Late crashes', 'Cost / run'] as const;

function Table({ arena }: { readonly arena: Arena }) {
  return (
    <div className="rr-scroll-x -mx-4 px-4">
      <table className="w-full min-w-[620px] border-collapse text-right font-mono text-xs tabular-nums">
        <caption className="sr-only">Brain Arena results per contestant</caption>
        <thead>
          <tr className="text-[10px] font-medium uppercase tracking-[1px] text-muted">
            <th scope="col" className="sticky left-0 bg-panel py-2 pr-3 text-left font-medium">
              Brain
            </th>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {arenaRows(arena).map((row) => (
            <tr key={row.id} className={`border-t border-tag ${row.configured ? '' : 'text-faint'}`}>
              <th scope="row" className="sticky left-0 max-w-[150px] bg-panel py-2 pr-3 text-left font-normal">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.configured ? DOT[row.kind] : 'transparent', border: row.configured ? undefined : '1px dashed var(--color-line-3)' }} />
                  <span className={`truncate font-display text-[13px] font-semibold ${row.configured ? 'text-text' : ''}`}>{row.label}</span>
                </span>
                <span className="block truncate pl-3.5 text-[10px] text-muted">{row.detail}</span>
              </th>
              {[row.finish, row.score, row.decisions, row.p50, row.p95, row.lateCrashes, row.cost].map((cell, index) => (
                <td key={COLUMNS[index]} className="whitespace-nowrap px-2 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Scatter({ arena }: { readonly arena: Arena }) {
  const plot = scatter(arena, PLOT);
  if (!plot) return null;
  const { width, height, padding } = PLOT;
  const [right, bottom] = [width - padding, height - padding];
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="rr-label">Latency vs score</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={`Median decision latency against mean score: ${plot.points.map((point) => point.label).join(', ')}`}>
        <rect x={padding} y={padding} width={right - padding} height={bottom - padding} fill="var(--color-panel-2)" stroke="var(--color-line)" />
        <line x1={padding} y1={(padding + bottom) / 2} x2={right} y2={(padding + bottom) / 2} stroke="var(--color-line)" strokeDasharray="3 4" />
        <line x1={(padding + right) / 2} y1={padding} x2={(padding + right) / 2} y2={bottom} stroke="var(--color-line)" strokeDasharray="3 4" />
        <g fontFamily="var(--font-mono)" fontSize="9" fill="var(--color-muted)">
          <text x={padding} y={bottom + 13}>0 ms</text>
          <text x={right} y={bottom + 13} textAnchor="end">
            {plot.xMaxMs >= 1000 ? `${plot.xMaxMs / 1000} s` : `${plot.xMaxMs} ms`}
          </text>
          <text x={(padding + right) / 2} y={bottom + 24} textAnchor="middle">
            MEDIAN LATENCY →
          </text>
          <text x={padding - 5} y={padding + 3} textAnchor="end">
            {plot.yMax}
          </text>
          <text x={padding - 5} y={bottom} textAnchor="end">
            0
          </text>
          <text x={padding} y={padding - 9}>
            ↑ MEAN SCORE
          </text>
        </g>
        {plot.points.map((point) => {
          // Labels turn inwards near the right edge so they stay inside the plot.
          const flip = point.x > (padding + right) / 2;
          return (
            <g key={point.id}>
              <circle cx={point.x} cy={point.y} r="5" fill={DOT[point.kind]} stroke="var(--color-ground)" strokeWidth="1.5" />
              <text x={point.x + (flip ? -9 : 9)} y={point.y + 3.5} textAnchor={flip ? 'end' : 'start'} fontFamily="var(--font-sans)" fontSize="10" fill="var(--color-text-2)">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[11px] leading-snug text-muted">Up and to the left is better: a higher score from a faster answer.</p>
    </figure>
  );
}

/**
 * /lab "Brain Arena": same robot, same seed, same sensors, same question, different brains.
 * Shows the brain session's results file; until it exists, says so and shows no figures.
 */
export function BrainArena({ arena }: { readonly arena: Arena | null }) {
  return (
    <section className="rr-card flex flex-col gap-3.5 p-4" aria-labelledby="brain-arena">
      <div className="flex flex-col gap-1">
        <h2 id="brain-arena" className="font-display text-2xl font-bold leading-none">
          Brain Arena
        </h2>
        <p className="text-[13px] leading-snug text-text-2">Same robot, same seed, same sensors, same question. Different brains. Their answers arrive with their real latency: the robot holds its last command until then.</p>
      </div>

      {arena && arena.contestants.length > 0 ? (
        <>
          <Table arena={arena} />
          <Scatter arena={arena} />
          <p className="border-t border-line pt-3 text-xs leading-snug text-text-2">
            {arenaLine(arena)}
            {arena.promptHash ? <span className="ml-1.5 font-mono text-[10px] text-faint">prompt {arena.promptHash}</span> : null}
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-line-3 px-3.5 py-5 text-center">
          <p className="font-display text-[15px] font-semibold">No arena results yet</p>
          <p className="text-xs leading-snug text-muted">The table and the latency-vs-score plot appear here once the arena has run. Nothing is shown until there are real runs to show.</p>
        </div>
      )}
    </section>
  );
}
