// /play (docs/PLAY_AND_PLAN.md §4): what the matchmaker answered, and the 30 s the room gives for three taps.
import { z } from 'zod';

/** How long a room's lobby lasts from the first join. Only used to draw the ring: the end itself is the server's `endsAt`. */
export const LOBBY_MS = 30_000;

const RoomSchema = z.object({
  code: z.string().trim().min(1).max(12),
  /** Server epoch ms when the lobby ends. */
  endsAt: z.number().finite(),
  playerId: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  serverNow: z.number().finite().optional(),
});

export interface Seat {
  readonly playerId: string;
  readonly token: string;
}

export type MatchAnswer =
  | { readonly kind: 'room'; readonly code: string; readonly endsAt: number; readonly seat: Seat | null; /** Add to Date.now() for the server's clock. */ readonly clockOffsetMs: number }
  /** Every room is busy: try again in this many seconds. */
  | { readonly kind: 'wait'; readonly seconds: number }
  /** The matchmaker is not on this server, or answered something else. */
  | { readonly kind: 'unavailable' };

const WAIT_KEYS = ['retryInS', 'retryAfterS', 'nextRaceInS', 'waitS'] as const;
const WAIT_DEFAULT_S = 5;
const WAIT_MAX_S = 120;

/** Reads the matchmaker's answer. Anything that is neither a room nor a "next race in N s" is "unavailable": no room is made up. */
export function readMatch(status: number, body: unknown, now: number): MatchAnswer {
  const room = RoomSchema.safeParse(body);
  if (status >= 200 && status < 300 && room.success) {
    const { code, endsAt, playerId, token, serverNow } = room.data;
    return { kind: 'room', code, endsAt, seat: playerId && token ? { playerId, token } : null, clockOffsetMs: serverNow === undefined ? 0 : serverNow - now };
  }
  const fields = typeof body === 'object' && body !== null ? (body as Readonly<Record<string, unknown>>) : {};
  const told = WAIT_KEYS.map((key) => fields[key]).find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  if (told !== undefined) return { kind: 'wait', seconds: Math.min(WAIT_MAX_S, Math.ceil(told)) };
  return status === 429 || status === 503 ? { kind: 'wait', seconds: WAIT_DEFAULT_S } : { kind: 'unavailable' };
}

/** Whole seconds until the lobby ends, never below 0. */
export const secondsLeft = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / 1000));

/** How much of the ring is left, 1 → 0. */
export const ringLeft = (endsAt: number, now: number): number => Math.min(1, Math.max(0, (endsAt - now) / LOBBY_MS));

export const STEPS = ['vehicle', 'agent', 'strategy'] as const;
export type Step = (typeof STEPS)[number];
export type Stage = Step | 'waiting';

/** A tap moves on: vehicle → agent → strategy → waiting for the start. */
export const after = (stage: Stage): Stage => (stage === 'vehicle' ? 'agent' : stage === 'agent' ? 'strategy' : 'waiting');

/** "claude-sonnet-5-5" planned it → "Claude's plan"; another provider's model is named as it is. */
export const planTitle = (model: string | null): string => (model === null || /^claude/i.test(model) ? "Claude's plan" : `${model}'s plan`);
