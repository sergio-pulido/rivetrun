import { GhostTraceSchema, type Build, type GhostTrace, type Mission } from '@rivetrun/contracts';
import { driveSeed, heuristicBrain, runHeadless } from '@rivetrun/sim';

/** How long Deploy waits for the precomputed Jev ghost before racing the heuristic instead. */
const GHOST_WAIT_MS = 1500;

export interface RivalGhost {
  readonly ghost: GhostTrace;
  readonly decisions?: number;
  readonly fallbacks?: number;
}

export interface GhostRequest {
  readonly mission: Mission;
  readonly seed: number;
  readonly build: Build;
  readonly priority: number;
  readonly briefing?: string;
}

const count = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** The exact URL both the prefetch and the run use, so they hit the same server cache entry. */
export function ghostUrl(request: GhostRequest): string {
  const params = new URLSearchParams({
    mission: request.mission.id,
    seed: String(request.seed),
    build: JSON.stringify(request.build),
    priority: String(request.priority),
  });
  if (request.briefing) params.set('briefing', request.briefing);
  return `/api/ghost?${params.toString()}`;
}

/**
 * Starts the server's Jev run for this loadout ahead of Deploy (it takes several seconds).
 * Call from the Brief whenever mission, build, priority or briefing settle. Never throws.
 */
export function prefetchRivalGhost(request: Omit<GhostRequest, 'seed'>): void {
  void fetch(ghostUrl({ ...request, seed: driveSeed(request.mission) })).catch(() => undefined);
}

/** GET /api/ghost: the Jev run for this mission, build, seed and briefing, computed and cached on the server. */
async function fetchJevGhost(request: GhostRequest, signal: AbortSignal): Promise<RivalGhost | null> {
  const response = await fetch(ghostUrl(request), { signal });
  if (response.status !== 200) return null;
  const body: unknown = await response.json();
  // Accepts the trace itself or an envelope `{ ghost, decisions?, fallbacks? }`.
  const envelope = typeof body === 'object' && body !== null && 'ghost' in body ? (body as { ghost: unknown; decisions?: unknown; fallbacks?: unknown }) : null;
  const parsed = GhostTraceSchema.safeParse(envelope ? envelope.ghost : body);
  if (!parsed.success) return null;
  return { ghost: parsed.data, decisions: count(envelope?.decisions), fallbacks: count(envelope?.fallbacks) };
}

/**
 * The rival for Drive mode. The Jev ghost when the server has it within the wait;
 * otherwise the heuristic's run on the same build and seed, labelled HEURISTIC by its policy.
 */
export async function loadRivalGhost(request: GhostRequest): Promise<RivalGhost> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GHOST_WAIT_MS);
  try {
    const jev = await fetchJevGhost(request, controller.signal);
    if (jev) return jev;
  } catch {
    // Not ready, not there or offline: the heuristic ghost below is the documented fallback.
  } finally {
    clearTimeout(timer);
  }
  const { ghost } = await runHeadless(request.mission, request.seed, request.build, heuristicBrain, {
    priority: request.priority,
    policy: 'heuristic',
  });
  return { ghost };
}
