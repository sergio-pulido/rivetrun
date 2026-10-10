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
  /** Jev's decision latency for it; null when Jev made no decision on it. */
  jevMs: z.number().min(0).nullable(),
});
export type ReactionEvent = z.infer<typeof ReactionEventSchema>;

const ReactionsSchema = z.object({ events: z.array(ReactionEventSchema) });

/** The run's reaction events, or null when the run carries none (or carries something else). */
export function parseReactions(value: unknown): readonly ReactionEvent[] | null {
  const parsed = ReactionsSchema.safeParse(value);
  return parsed.success ? parsed.data.events : null;
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
}

const seconds = (value: number): string => `${value.toFixed(2)} s`;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** The duel for a run's events: each side's median reaction, and the list event by event. Null when there were no events. */
export function reactionDuel(events: readonly ReactionEvent[]): ReactionDuel | null {
  if (events.length === 0) return null;
  const yourS = median(events.flatMap((event) => (event.humanS === null ? [] : [event.humanS])));
  const jevS = median(events.flatMap((event) => (event.jevMs === null ? [] : [event.jevMs / 1000])));
  const missed = events.filter((event) => event.humanS === null).length;
  const count = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
  return {
    headline: `${yourS === null ? 'Your reaction: none' : `Your reaction ${seconds(yourS)}`} · Jev ${jevS === null ? '—' : seconds(jevS)}`,
    yourS,
    jevS,
    note: `Median of ${count}${missed > 0 ? ` · you did not react to ${missed}` : ''}`,
    rows: events.map((event, index) => {
      const theirs = event.jevMs === null ? null : event.jevMs / 1000;
      return {
        key: `${index}:${event.t}`,
        label: event.label,
        atM: Math.round(event.xM),
        you: event.humanS === null ? 'no reaction' : seconds(event.humanS),
        jev: theirs === null ? '—' : seconds(theirs),
        // A side that did not react cannot be the faster one; with neither, nobody is.
        faster: theirs === null ? (event.humanS === null ? null : 'you') : event.humanS === null || theirs <= event.humanS ? 'jev' : 'you',
      };
    }),
  };
}
