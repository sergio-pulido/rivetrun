// Home's live proof: figures the server already keeps for the big screen (GET /api/stats, GET /api/arena/humans).
import { z } from 'zod';

const AudienceSchema = z.object({
  verified: z.number().int().min(0),
  vsJev: z.object({ runs: z.number().int().min(0), humanWins: z.number().int().min(0) }),
});

export interface Audience {
  /** Runs the server replayed and reproduced since it started. */
  readonly verified: number;
  /** Verified runs that had a Jev ghost to race, and how many the human won. */
  readonly vsJev: { readonly runs: number; readonly humanWins: number };
}

/** The audience figures, or null when the answer is not in that shape: nothing is shown instead of a guess. */
export function readAudience(body: unknown): Audience | null {
  const parsed = AudienceSchema.safeParse(body);
  return parsed.success ? { verified: parsed.data.verified, vsJev: parsed.data.vsJev } : null;
}

/** "Humans beat Jev 3 of 11 runs", in the big screen's words; an invitation while nobody has raced Jev yet. */
export const versusLine = ({ vsJev }: Audience): string => (vsJev.runs === 0 ? 'No run against Jev yet. Be the first.' : `Humans beat Jev ${vsJev.humanWins} of ${vsJev.runs} ${vsJev.runs === 1 ? 'run' : 'runs'}`);
