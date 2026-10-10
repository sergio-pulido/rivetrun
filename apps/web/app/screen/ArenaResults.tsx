import { isReasoning, penaltyNote, rankPlayers, resultShort, shortName, type RacePlayer } from '../race/_lib/protocol';
import styles from './screen.module.css';

/**
 * Live Arena, after the finish: what each brain's speed of answer cost it. One row per AI, in the race's own order
 * (humans and AIs are ranked together in the order panel above; the place shown here is that overall place).
 */
export function ArenaResults({ players, trackLengthM }: { readonly players: readonly RacePlayer[]; readonly trackLengthM: number }) {
  const ranked = rankPlayers(players);
  const brains = ranked.map((player, index) => ({ player, place: index + 1 })).filter(({ player }) => player.kind === 'jev');
  return (
    <div className={styles.thread}>
      <span className={styles.label}>Brains · this race</span>
      <span className={styles.threadNote}>Same robot, seed and question. Late = hit, blocked or fell while its answer was on the way.</span>
      <div className={styles.arenaTable} role="table">
        <div className={`${styles.arenaRow} ${styles.arenaHead}`} role="row">
          <span>#</span>
          <span>Brain</span>
          <span>Time (+scan)</span>
          <span>Median</span>
          <span>Late</span>
        </div>
        {brains.map(({ player, place }) => {
          const out = player.done && !player.finished;
          return (
            <div key={player.id} className={styles.arenaRow} role="row">
              <span className={styles.arenaPlace}>{out ? '—' : place}</span>
              <span className={styles.arenaName}>
                {shortName(player)}
                {isReasoning(player) ? <small className={styles.orderTag}> reasoning</small> : null}
              </span>
              <span>
                {resultShort(player, trackLengthM)}
                {penaltyNote(player) ? <em className={styles.arenaMissed} title={penaltyNote(player) ?? undefined}> +{Math.round(player.penaltyMs / 1000)}</em> : null}
              </span>
              <span>{player.model === 'heuristic' ? 'no model' : player.medianLatencyMs === null ? '—' : `${Math.round(player.medianLatencyMs)} ms`}</span>
              <span className={(player.lateDecisions ?? 0) > 0 ? styles.arenaBad : undefined}>
                {player.lateDecisions ?? 0}
                {(player.missedDecisions ?? 0) > 0 ? <em className={styles.arenaMissed}> · {player.missedDecisions} unanswered</em> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
