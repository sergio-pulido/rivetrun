import { JEV_MODEL_ID } from '@rivetrun/brain';
import { closestReady, ghostStateOf, peekGhost, requestGhost, type GhostAnswer, type GhostBody, type GhostRequest } from './ghostStore';
import { CACHED_RUN_LABEL, clientOf, GUARD_LABEL, isPublicRequest, startPublicRun } from './publicGuard';

/** A ghost answer, with what a phone must say when it is not the run that was asked for. */
export type GuardedGhost =
  | { readonly status: 'ready'; readonly body: GhostBody; /** Set when an earlier recorded run is served in place of a new one. */ readonly served?: 'cached'; readonly label?: string }
  | { readonly status: 'pending' }
  | { readonly status: 'unavailable'; readonly reason: string; /** Set when a limit refused the run: the phone drives on the fixed rules and shows this. */ readonly label?: string };

/**
 * RR-GUARD in front of the ghost store. Cache first: a stored run is served to anyone. A visitor's request that would
 * have to drive a new run is checked against the switch, the budgets and that client's runs; refused, it gets the
 * closest stored run ("cached run") or nothing to race but the fixed rules, with the label to show. The presenter's
 * requests go straight to the store.
 */
export function guardedGhost(http: Request, ghost: GhostRequest): GuardedGhost {
  const plain = (answer: GhostAnswer): GuardedGhost => answer;
  if (!isPublicRequest(http) || ghost.fault) return plain(requestGhost(ghost));
  const ready = peekGhost(ghost);
  if (ready) return { status: 'ready', body: ready };
  if (ghostStateOf(ghost) === 'pending') return { status: 'pending' };
  if (ghost.agent === 'heuristic') return plain(requestGhost(ghost));
  const reason = startPublicRun(clientOf(http), ghost.agent && ghost.agent !== JEV_MODEL_ID ? 'llm' : 'jev');
  if (reason === null) return plain(requestGhost({ ...ghost, public: true }));
  const near = closestReady(ghost);
  if (near) return { status: 'ready', body: near, served: 'cached', label: CACHED_RUN_LABEL };
  return { status: 'unavailable', reason: GUARD_LABEL[reason], label: GUARD_LABEL[reason] };
}
