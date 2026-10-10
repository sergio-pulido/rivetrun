// The reaction duel (docs/BRAIN_V3_SENSING.md): for each event the player's robot detected, how long the player took to
// change a control (within 3 s, else "no reaction") against Jev's decision latency for the same event.
import { z } from 'zod';

const ReactionEventSchema = z.object({
  /** Sim time and track position of the event. */
  t: z.number().min(0),
  xM: z.number(),
  /** What the robot detected, as shown to the player, e.g. "LIDAR · rock 11 m". */
  label: z.string().min(1),
  /** Seconds to the player's first control change; null = no reaction. */
  humanS: z.number().min(0).nullable(),
  /** Jev's decision latency for the same event, when the run carries it per event. */
  jevMs: z.number().min(0).nullish(),
});
export type ReactionEvent = z.infer<typeof ReactionEventSchema>;

/**
 * The run's reaction events (episode.outcome.breakdown.reactions, Drive mode), or null when the run carries none
 * or carries something else.
 */
export function parseReactions(value: unknown): readonly ReactionEvent[] | null {
  const parsed = z.array(ReactionEventSchema).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export interface ReactionRow {
  readonly key: string;
  readonly label: string;
  readonly atM: number;
  /** "0.82 s" or "no reaction". */
  readonly you: string;
  /** "0.34 s", or "—" when Jev made no decision on it. */
  readonly jev: string;
  readonly faster: 'you' | 'jev' | null;
}

export interface ReactionDuel {
  /** "Your reaction 0.82 s · Jev 0.34 s". */
  readonly headline: string;
  readonly yourS: number | null;
  readonly jevS: number | null;
  /** How the headline was worked out, and how many events went unanswered. */
  readonly note: string;
  readonly rows: readonly ReactionRow[];
  /** Whether any event carries Jev's own latency: without one, the list has no Jev column to show. */
  readonly jevPerEvent: boolean;
}

const seconds = (value: number): string => `${value.toFixed(2)} s`;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * The duel for a run's events: each side's median reaction, and the list event by event. Jev's side is the median of its
 * per-event latencies when the events carry them, otherwise the ghost's median decision latency when the run knows it.
 * Null when there were no events.
 */
export function reactionDuel(events: readonly ReactionEvent[], ghostMedianMs: number | null = null): ReactionDuel | null {
  if (events.length === 0) return null;
  const jevTimes = events.flatMap((event) => (typeof event.jevMs === 'number' ? [event.jevMs / 1000] : []));
  const yourS = median(events.flatMap((event) => (event.humanS === null ? [] : [event.humanS])));
  const jevS = median(jevTimes) ?? (ghostMedianMs === null ? null : ghostMedianMs / 1000);
  const missed = events.filter((event) => event.humanS === null).length;
  const count = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
  return {
    headline: `${yourS === null ? 'Your reaction: none' : `Your reaction ${seconds(yourS)}`} · Jev ${jevS === null ? '—' : seconds(jevS)}`,
    yourS,
    jevS,
    note: `Median of ${count}${missed > 0 ? ` · you did not react to ${missed}` : ''}`,
    jevPerEvent: jevTimes.length > 0,
    rows: events.map((event, index) => {
      const theirs = typeof event.jevMs === 'number' ? event.jevMs / 1000 : null;
      return {
        key: `${index}:${event.t}`,
        label: event.label,
        atM: Math.round(event.xM),
        you: event.humanS === null ? 'no reaction' : seconds(event.humanS),
        jev: theirs === null ? '—' : seconds(theirs),
        // A side with no time cannot be the faster one; with neither, nobody is.
        faster: theirs === null ? (event.humanS === null || jevTimes.length === 0 ? null : 'you') : event.humanS === null || theirs <= event.humanS ? 'jev' : 'you',
      };
    }),
  };
}
