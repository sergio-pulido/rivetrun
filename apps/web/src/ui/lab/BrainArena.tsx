'use client';

import { useState } from 'react';
import { arenaLine, arenaRows, mostRuns, scatter, scenarioTable, type Arena, type ArenaSection, type ContestantKind } from './arena';

const PLOT = { width: 334, height: 230, padding: 30 } as const;

/** Jev is the brain's colour everywhere; the player's orange marks the models brought in to challenge it. */
const DOT: Readonly<Record<ContestantKind, string>> = {
  jev: 'var(--color-cyan)',
  llm: 'var(--color-orange)',
  heuristic: 'var(--color-text-2)',
  random: 'var(--color-faint)',
  human: 'var(--color-ok)',
};

const COLUMNS = ['Finish', 'Score', 'Dec. / run', 'p50', 'p95', 'Late crashes', 'Cost / run'] as const;

function Table({ arena }: { readonly arena: ArenaSection }) {
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
                <span className="flex items-start gap-1.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: row.configured ? DOT[row.kind] : 'transparent', border: row.configured ? undefined : '1px dashed var(--color-line-3)' }} />
                  <span className={`font-display text-[13px] font-semibold leading-tight ${row.configured ? 'text-text' : ''}`}>{row.label}</span>
                </span>
                <span className={`block pl-3.5 text-[10px] text-muted ${row.configured ? 'truncate' : 'whitespace-normal leading-tight'}`}>{row.detail}</span>
                {row.fewer ? <span className="block pl-3.5 text-[10px] font-medium text-warn">{row.fewer} only</span> : null}
                {row.carried ? <span className="block pl-3.5 text-[10px] font-medium text-warn">run on {row.carried}</span> : null}
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

function Scatter({ arena }: { readonly arena: ArenaSection }) {
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
        <g fontFamily="var(--font-mono)" fontSize="9" fill="var(--color-muted)">
          {plot.xTicks.map((tick) => (
            <g key={tick.ms}>
              {tick.ms > 0 ? <line x1={tick.x} y1={padding} x2={tick.x} y2={bottom} stroke="var(--color-line)" strokeDasharray="3 4" /> : null}
              <text x={tick.x} y={bottom + 13} textAnchor="middle">
                {tick.ms === 0 ? '0' : `${tick.ms / 1000} s`}
              </text>
            </g>
          ))}
          <text x={(padding + right) / 2} y={bottom + 26} textAnchor="middle">
            MEDIAN LATENCY →
          </text>
          <text x={padding - 5} y={padding + 3} textAnchor="end">
            {plot.yMax}
          </text>
          <text x={padding - 5} y={bottom} textAnchor="end">
            {plot.yMin}
          </text>
          <text x={padding} y={padding - 9}>
            ↑ MEAN SCORE
          </text>
        </g>
        {/* Numbered rather than named on the plot: brains that score alike sit too close for names to stay readable. */}
        {plot.points.map((point, index) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="7.5" fill={DOT[point.kind]} fillOpacity="0.92" stroke={point.below ? 'var(--color-warn)' : 'var(--color-ground)'} strokeWidth="1.5" strokeDasharray={point.below ? '2 2' : undefined} />
            <text x={point.x} y={point.y + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fontWeight="600" fill="var(--color-ground)">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-snug text-text-2">
        {plot.points.map((point, index) => (
          <li key={point.id} className="flex items-center gap-1.5">
            <span className="grid h-4 w-4 place-items-center rounded-full font-mono text-[10px] font-semibold text-ground" style={{ background: DOT[point.kind] }}>
              {index + 1}
            </span>
            {point.label}
          </li>
        ))}
      </ol>
      {plot.points.some((point) => point.below) ? (
        <p className="text-[11px] leading-snug text-warn">
          Below the score axis (it starts at {plot.yMin}):{' '}
          {plot.points
            .filter((point) => point.below)
            .map((point) => `${point.label} ${Math.round(point.score)}`)
            .join(', ')}
          .
        </p>
      ) : null}
      <p className="text-[11px] leading-snug text-muted">Up and to the left is better: a higher score from a faster answer. The latency axis is stretched at the fast end (square-root scale) so brains that answer quickly do not sit on top of each other.</p>
    </figure>
  );
}

type Track = 'rail' | 'lab';

const TRACKS: readonly { readonly id: Track; readonly label: string }[] = [
  { id: 'rail', label: 'Rail missions' },
  { id: 'lab', label: 'Lab Missions' },
];

const EMPTY: Readonly<Record<Track, { readonly title: string; readonly text: string }>> = {
  rail: { title: 'No arena results yet', text: 'The table and the latency-vs-score plot appear here once the arena has run. Nothing is shown until there are real runs to show.' },
  lab: { title: 'No Lab Missions results yet', text: 'The same brains on the grid scenarios appear here once that track has run. Nothing is shown until there are real runs to show.' },
};

/** What a reader needs to know about capture the flag when the runner's own notes do not say it. */
const CTF_NOTE = 'Capture the flag is a race against a rival robot: a brain that answers too slowly loses the flag and scores 0 on it.';

function Scenarios({ section }: { readonly section: ArenaSection }) {
  const table = scenarioTable(section);
  if (!table) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="rr-label">Score by scenario</h3>
      <div className="rr-scroll-x -mx-4 px-4">
        <table className="w-full min-w-[520px] border-collapse text-right font-mono text-xs tabular-nums">
          <caption className="sr-only">Mean score per scenario, with runs completed</caption>
          <thead>
            <tr className="text-[10px] font-medium uppercase tracking-[1px] text-muted">
              <th scope="col" className="sticky left-0 bg-panel py-2 pr-3 text-left font-medium">
                Brain
              </th>
              {table.scenarios.map((scenario) => (
                <th key={scenario} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">
                  {scenario.replaceAll('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id} className="border-t border-tag">
                <th scope="row" className="sticky left-0 max-w-[140px] bg-panel py-2 pr-3 text-left font-display text-[13px] font-semibold leading-tight text-text">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td key={table.scenarios[index]} className={`whitespace-nowrap px-2 py-2 ${cell.failed ? 'text-warn' : ''}`}>
                    {cell.score}
                    {cell.done ? <span className="ml-1 text-[10px] text-muted">{cell.done}</span> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-snug text-muted">Mean score, then runs completed of runs made.</p>
    </div>
  );
}

function Results({ section }: { readonly section: ArenaSection }) {
  const rows = arenaRows(section);
  // The runner's notes when the file carries them; otherwise the one thing the CTF column cannot be read without.
  const notes = section.notes.length > 0 ? section.notes : section.scenarios.includes('ctf') ? [CTF_NOTE] : [];
  return (
    <>
      {section.scenarios.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {section.scenarios.map((scenario) => (
            <span key={scenario} className="rr-chip">
              {scenario.replaceAll('_', ' ')}
            </span>
          ))}
        </div>
      ) : null}
      <Table arena={section} />
      {rows.some((row) => row.fewer) ? (
        <p className="-mt-1.5 text-[11px] leading-snug text-warn">Rows marked in amber ran fewer runs than the others ({mostRuns(section)}): their figures rest on less and are not directly comparable.</p>
      ) : null}
      {rows.some((row) => row.carried) ? (
        <p className="-mt-1.5 text-[11px] leading-snug text-warn">Rows marked with a gameplay version were run on an earlier version of the game than the rest (gameplay {section.gameplayVersion}).</p>
      ) : null}
      {section.priced ? <p className="-mt-1.5 text-[11px] leading-snug text-muted">Cost per run: each provider&apos;s published price × the tokens it reported. A token count is shown where no price is set.</p> : null}
      <Scenarios section={section} />
      {notes.map((note) => (
        <p key={note} className="-mt-1.5 text-[11px] leading-snug text-text-2">
          {note}
        </p>
      ))}
      <Scatter arena={section} />
      <p className="border-t border-line pt-3 text-xs leading-snug text-text-2">
        {arenaLine(section)}
        {section.promptHash ? <span className="ml-1.5 font-mono text-[10px] text-faint">prompt {section.promptHash}</span> : null}
      </p>
    </>
  );
}

/**
 * /lab "Brain Arena": same robot, same seed, same sensors, same question, different brains, on two tracks:
 * the rail missions and Lab Missions (a grid simulation). Shows the brain session's results file; a track with
 * no results says so and shows no figures.
 */
export function BrainArena({ arena }: { readonly arena: Arena | null }) {
  const [track, setTrack] = useState<Track>('rail');
  const section: ArenaSection | null = track === 'rail' ? arena : (arena?.lab ?? null);
  const hasResults = section !== null && section.contestants.length + section.notRun.length > 0;

  return (
    <section className="rr-card flex flex-col gap-3.5 p-4" aria-labelledby="brain-arena">
      <div className="flex flex-col gap-1">
        <h2 id="brain-arena" className="font-display text-2xl font-bold leading-none">
          Brain Arena
        </h2>
        <p className="text-[13px] leading-snug text-text-2">Same robot, same seed, same sensors, same question. Different brains. Their answers arrive with their real latency: the robot holds its last command until then.</p>
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="Arena track">
        {TRACKS.map((entry) => {
          const on = entry.id === track;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTrack(entry.id)}
              className={`h-11 flex-1 rounded-[10px] border font-display text-[13px] font-semibold transition-colors ${on ? 'border-cyan bg-cyan-deep text-cyan-soft' : 'border-line-2 bg-panel-2 text-text-2'}`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {track === 'lab' ? <p className="-mt-1.5 text-[11px] leading-snug text-muted">Lab Missions use a grid simulation: top-down scenarios with the same parts, sensors, battery and brains.</p> : null}

      <div role="tabpanel" className="flex flex-col gap-3.5">
        {hasResults ? (
          <Results section={section} />
        ) : (
          <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-line-3 px-3.5 py-5 text-center">
            <p className="font-display text-[15px] font-semibold">{EMPTY[track].title}</p>
            <p className="text-xs leading-snug text-muted">{EMPTY[track].text}</p>
          </div>
        )}
      </div>
    </section>
  );
}
