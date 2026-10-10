/** Why a decision was asked for, in a word or two. A cause the sim adds later reads by its own name until listed here. */
type Word = { readonly one: string; readonly many: string };
const HAZARD: Word = { one: 'hazard', many: 'hazards' };
const TERRAIN: Word = { one: 'terrain', many: 'terrain' };
const SLIP: Word = { one: 'slip', many: 'slip' };
const TILT: Word = { one: 'tilt', many: 'tilt' };
const IMPACT: Word = { one: 'impact', many: 'impacts' };
const ENERGY: Word = { one: 'energy', many: 'energy' };
const SCAN_ZONE: Word = { one: 'scan zone', many: 'scan zones' };
const PART_READY: Word = { one: 'part ready', many: 'parts ready' };

const GROUP: Readonly<Record<string, Word>> = {
  start: { one: 'start', many: 'start' },
  // Brain v3 causes (packages/contracts sensing.ts)
  hazard_seen: HAZARD, hazard_reached: HAZARD, gap_seen: HAZARD, gap_reached: HAZARD,
  terrain_seen: TERRAIN, terrain_reached: TERRAIN,
  zone_seen: SCAN_ZONE, zone_reached: SCAN_ZONE,
  slip_start: SLIP, slip_stop: SLIP,
  tilt_10: TILT, tilt_20: TILT, tilt_level: TILT,
  impact: IMPACT, damage: IMPACT, landing: IMPACT, blocked: IMPACT, fell: IMPACT,
  energy_low: ENERGY, energy_ok: ENERGY,
  jump_ready: PART_READY, winch_done: PART_READY, scan_done: PART_READY,
  // Triggers of runs logged before Brain v3
  obstacle: HAZARD,
  terrain_ahead: TERRAIN, terrain_enter: TERRAIN,
  slip: SLIP,
  interval: { one: 'timed', many: 'timed' },
};

const OTHER: Word = { one: 'other', many: 'other' };
const groupOf = (trigger: string | undefined): Word => {
  if (trigger === undefined) return OTHER;
  const plain = trigger.replaceAll('_', ' ');
  return GROUP[trigger] ?? { one: plain, many: plain };
};

/** A logged decision: the Brain v3 log names the cause; older runs carry only a trigger. */
export interface LoggedDecision {
  readonly trigger?: string | undefined;
  readonly log?: { readonly trigger: { readonly cause: string } } | undefined;
}

/**
 * The run's decisions in one line: how many, over what distance, and what asked for them.
 * "7 decisions in 62 m: 3 hazards, 2 energy, 2 slip". Null when the run logged none.
 */
export function decisionSummary(decisions: readonly LoggedDecision[], distanceM: number): string | null {
  if (decisions.length === 0) return null;
  const counts = decisions.reduce<ReadonlyMap<string, { readonly count: number; readonly group: Word }>>((acc, decision) => {
    const group = groupOf(decision.log?.trigger.cause ?? decision.trigger);
    return new Map([...acc, [group.many, { count: (acc.get(group.many)?.count ?? 0) + 1, group }]]);
  }, new Map());
  // Most frequent first; the start of the run is not a reason worth leading with.
  const parts = [...counts.values()]
    .sort((a, b) => Number(a.group.one === 'start') - Number(b.group.one === 'start') || b.count - a.count)
    .map(({ count, group }) => `${count} ${count === 1 ? group.one : group.many}`);
  return `${decisions.length} ${decisions.length === 1 ? 'decision' : 'decisions'} in ${Math.round(distanceM)} m: ${parts.join(', ')}`;
}
