import { MissionIdSchema, type MissionId } from '@rivetrun/contracts';

/** Parses the [mission] route segment; null when it is not a known mission id. */
export function parseMissionParam(value: string): MissionId | null {
  const parsed = MissionIdSchema.safeParse(value.toUpperCase());
  return parsed.success ? parsed.data : null;
}
