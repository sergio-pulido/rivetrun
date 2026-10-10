import type { ReactionDuel as Duel } from './reactions';

/** Rows shown before the rest folds away: a long run can log dozens of events. */
const ROWS_OPEN = 5;

const GRID_BOTH = 'grid-cols-[1fr_76px_58px]';
const GRID_YOU = 'grid-cols-[1fr_76px]';

function Rows({ rows, jev }: { readonly rows: Duel['rows']; readonly jev: boolean }) {
  return (
    <>
      {rows.map((row) => (
        <li key={row.key} className={`grid ${jev ? GRID_BOTH : GRID_YOU} items-baseline gap-2 border-t border-tag py-1.5 text-xs leading-snug`}>
          <span className="min-w-0 text-text-2">
            <span className="mr-1.5 font-mono text-[10px] tabular-nums text-muted">{row.atM} m</span>
            {row.label}
          </span>
          <span className={`text-right font-mono text-[11px] tabular-nums ${row.you === 'no reaction' ? 'text-faint' : row.faster === 'you' ? 'font-semibold text-orange-soft' : 'text-text-2'}`}>{row.you}</span>
          {jev ? (
            <span className={`text-right font-mono text-[11px] tabular-nums ${row.faster === 'jev' ? 'font-semibold text-cyan' : row.jevIsMedian ? 'text-faint' : 'text-text-2'}`} title={row.jevIsMedian ? 'Jev’s median for the run' : undefined}>
              {row.jevIsMedian ? `~${row.jev}` : row.jev}
            </span>
          ) : null}
        </li>
      ))}
    </>
  );
}

/**
 * The reaction duel: how fast the player answered what the robot's sensors reported, against Jev's decision latency
 * for the same events. A time for the player is their first control change within 3 s; none is "no reaction".
 */
export function ReactionDuel({ duel }: { readonly duel: Duel }) {
  const first = duel.rows.slice(0, ROWS_OPEN);
  const rest = duel.rows.slice(ROWS_OPEN);
  return (
    <section className="rr-card flex flex-col gap-2 px-3.5 py-3" aria-label={duel.headline}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="rr-label">Reaction duel</h2>
        <span className="text-[11px] text-muted">{duel.note}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-orange/50 bg-orange-deep px-3 py-2">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-orange-soft">YOUR REACTION</span>
          <p className="font-mono text-[22px] font-semibold leading-tight tabular-nums">{duel.yourS === null ? 'none' : `${duel.yourS.toFixed(2)} s`}</p>
        </div>
        <div className="rounded-xl border border-cyan-line bg-cyan-deep px-3 py-2">
          <span className="font-mono text-[10px] font-medium tracking-[1.5px] text-cyan">JEV</span>
          <p className="font-mono text-[22px] font-semibold leading-tight tabular-nums text-cyan-soft">{duel.jevS === null ? '—' : `${duel.jevS.toFixed(2)} s`}</p>
          {duel.jevS === null ? <span className="text-[10px] leading-tight text-cyan-muted">latency not on this run</span> : null}
        </div>
      </div>
      <ul className="flex flex-col" aria-label="Reaction per event">
        <li className={`grid ${duel.jevPerEvent ? GRID_BOTH : GRID_YOU} gap-2 pb-1 font-mono text-[10px] tracking-[1px] text-muted`}>
          <span>EVENT</span>
          <span className="text-right">YOU</span>
          {duel.jevPerEvent ? <span className="text-right">JEV</span> : null}
        </li>
        <Rows rows={first} jev={duel.jevPerEvent} />
      </ul>
      {rest.length > 0 ? (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center font-mono text-[11px] font-medium tracking-[1px] text-orange-soft">
            {rest.length} MORE {rest.length === 1 ? 'EVENT' : 'EVENTS'}
          </summary>
          <ul className="flex flex-col">
            <Rows rows={rest} jev={duel.jevPerEvent} />
          </ul>
        </details>
      ) : null}
      <p className="text-[11px] leading-snug text-faint">
        Your time is your first control change within 3 s of what the robot detected. Jev&apos;s is how long its answer to the same event took
        {duel.rows.some((row) => row.jevIsMedian) ? '; a time marked ~ is its median for the run, where its ghost made no decision of its own on that event' : ''}.
      </p>
    </section>
  );
}
