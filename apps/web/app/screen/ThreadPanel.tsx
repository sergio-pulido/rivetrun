import type { ThreadEntry } from '@/brain/thread';
import styles from './screen.module.css';

const OPTIONS_SHOWN = 3;
const LINES_SHOWN = 2;

/**
 * The JEV bots' live decisions: what each was told and how it split its probability.
 * Jev returns a choice with probabilities, not text, so this panel shows inputs and numbers only.
 */
export function ThreadPanel({ thread }: { readonly thread: readonly ThreadEntry[] }) {
  return (
    <div className={styles.thread} aria-live="off">
      <span className={styles.label}>Jev · live decisions</span>
      <span className={styles.threadNote}>Inputs and probability split. Jev returns a choice, not reasoning.</span>
      {thread.length === 0 ? <span className={styles.orderEmpty}>Waiting for the first decision…</span> : null}
      <ol className={styles.threadList}>
        {thread.map((entry) => (
          <li key={entry.id} className={styles.threadEntry}>
            <div className={styles.threadHead}>
              <span>
                {entry.t.toFixed(1)} s · {entry.who}
              </span>
              <span>{Math.round(entry.latencyMs)} ms</span>
            </div>
            <div className={styles.threadTrigger}>{entry.trigger}</div>
            {entry.knew.slice(0, LINES_SHOWN).map((line) => (
              <div key={line} className={styles.threadLine}>
                {line}
              </div>
            ))}
            {entry.options.slice(0, OPTIONS_SHOWN).map((option) => (
              <div key={option.action} className={`${styles.threadOption} ${option.action === entry.choice ? styles.threadChosen : ''}`}>
                <span className={styles.threadAction}>{option.action}</span>
                <span className={styles.threadBar}>
                  <span style={{ width: `${Math.round(option.probability * 100)}%` }} />
                </span>
                <span className={styles.threadPct}>{Math.round(option.probability * 100)} %</span>
              </div>
            ))}
            {/* Never show a heuristic answer under Jev's name. */}
            {entry.fallback || entry.policy !== 'jev' ? <div className={styles.threadFallback}>Jev did not answer in time · heuristic chose</div> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
