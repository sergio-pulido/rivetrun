// The reaction duel (docs/BRAIN_V3_SENSING.md): for each event the player's robot detected, how long the player took to
// change a control (within 3 s, else "no reaction") against Jev's decision latency for the same event.
import { z } from 'zod';

const ReactionEventSchema = z.object({
  /** The event's stable id: the same string in the player's run and the ghost's, so the two can be paired. */
  id: z.string().optional(),
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
  /** True when `jev` is Jev's median for the run because its ghost logged no decision of its own on this event. */
  readonly jevIsMedian: boolean;
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
  /** Whether the list has a Jev figure to show per event: its own latency for some, or at least the run median. */
  readonly jevPerEvent: boolean;
}

/** What the pairing needs from one entry of the ghost's decision log. */
export interface GhostDecision {
  readonly trigger: { readonly eventId?: string | undefined };
  readonly latencyMs: number;
  /** The heuristic answered because Jev did not: not Jev's latency. */
  readonly fallback: boolean;
}

/**
 * Jev's latency for each event the player faced: the ghost's own decision on the event with the same id.
 * An event with no id, or one the ghost made no decision of its own on, is left without a time.
 */
export function pairWithGhost(events: readonly ReactionEvent[], log: readonly GhostDecision[]): readonly ReactionEvent[] {
  const latencyById = new Map<string, number>();
  for (const decision of log) {
    const id = decision.trigger.eventId;
    if (id !== undefined && !decision.fallback && !latencyById.has(id)) latencyById.set(id, decision.latencyMs);
  }
  return events.map((event) => (event.id !== undefined && latencyById.has(event.id) ? { ...event, jevMs: latencyById.get(event.id)! } : event));
}

const seconds = (value: number): string => `${value.toFixed(2)} s`;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * The duel for a run's events: each side's median reaction, and the list event by event. Jev's side of an event is its
 * own latency when the event carries one (see pairWithGhost); otherwise the ghost's median for the run, marked as such.
 * Null when there were no events.
 */
export function reactionDuel(events: readonly ReactionEvent[], ghostMedianMs: number | null = null): ReactionDuel | null {
  if (events.length === 0) return null;
  const jevTimes = events.flatMap((event) => (typeof event.jevMs === 'number' ? [event.jevMs / 1000] : []));
  const runMedianS = ghostMedianMs === null ? null : ghostMedianMs / 1000;
  const yourS = median(events.flatMap((event) => (event.humanS === null ? [] : [event.humanS])));
  const jevS = median(jevTimes) ?? runMedianS;
  const missed = events.filter((event) => event.humanS === null).length;
  const count = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
  return {
    headline: `${yourS === null ? 'Your reaction: none' : `Your reaction ${seconds(yourS)}`} · Jev ${jevS === null ? '—' : seconds(jevS)}`,
    yourS,
    jevS,
    note: `Median of ${count}${missed > 0 ? ` · you did not react to ${missed}` : ''}`,
    jevPerEvent: jevTimes.length > 0 || runMedianS !== null,
    rows: events.map((event, index) => {
      const own = typeof event.jevMs === 'number' ? event.jevMs / 1000 : null;
      const theirs = own ?? runMedianS;
      return {
        key: `${index}:${event.t}`,
        label: event.label,
        atM: Math.round(event.xM),
        you: event.humanS === null ? 'no reaction' : seconds(event.humanS),
        jev: theirs === null ? '—' : seconds(theirs),
        jevIsMedian: own === null && runMedianS !== null,
        // Only Jev's own time on this event makes a winner; a median is not an answer to this event.
        faster: own === null ? null : event.humanS === null || own <= event.humanS ? 'jev' : 'you',
      };
    }),
  };
}
