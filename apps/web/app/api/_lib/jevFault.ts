import { JEV_TIMEOUT_MS, JevError } from '@rivetrun/brain';
import type { Brain } from '@rivetrun/contracts';

// Test switch for the fallback path (docs/OVERNIGHT.md OVN-BRAIN-5): makes Jev fail or answer too late without
// touching the key. Per client, so one tester does not break everyone else's runs on a shared server:
//   cookie  rr_jev_fault=fail|slow      (a browser: document.cookie = 'rr_jev_fault=fail; path=/')
//   header  x-rivetrun-jev-fault: fail|slow   (curl, route tests)
// Honoured outside production builds only, unless the server was started with RIVETRUN_JEV_FAULT_SWITCH=1.
// RIVETRUN_JEV_FAULT=fail|slow in the server's environment forces it for every request.
export type JevFault = 'fail' | 'slow';

export const JEV_FAULT_COOKIE = 'rr_jev_fault';
export const JEV_FAULT_HEADER = 'x-rivetrun-jev-fault';
/** How long a "slow" Jev takes to answer /api/decide: well past the client's 1200 ms fallback. */
export const JEV_FAULT_SLOW_MS = 3000;

const asFault = (value: string | null | undefined): JevFault | null => (value === 'fail' || value === 'slow' ? value : null);

const cookieValue = (request: Request, name: string): string | null => {
  const found = (request.headers.get('cookie') ?? '').split(';').map((part) => part.trim().split('=')).find(([key]) => key === name);
  return found?.[1] ?? null;
};

/** The fault this request asks for, if the switch is allowed on this server. */
export function jevFaultOf(request: Request): JevFault | null {
  const forced = asFault(process.env.RIVETRUN_JEV_FAULT);
  if (forced) return forced;
  if (process.env.NODE_ENV === 'production' && process.env.RIVETRUN_JEV_FAULT_SWITCH !== '1') return null;
  return asFault(request.headers.get(JEV_FAULT_HEADER)) ?? asFault(cookieValue(request, JEV_FAULT_COOKIE));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jev as a server-side run (the ghost) meets it under a fault: an immediate error, or no answer within the
 * decision deadline. Either way the sim's own fallback takes the decision.
 */
export const faultedJev = (fault: JevFault): Brain => ({
  decide: async () => {
    if (fault === 'fail') throw new JevError('http', 'Jev fault switch: fail', 503);
    await sleep(JEV_TIMEOUT_MS);
    throw new JevError('timeout', `Jev fault switch: no answer within ${JEV_TIMEOUT_MS} ms`);
  },
});

/** The fault as /api/decide meets it: an upstream error at once, or silence for JEV_FAULT_SLOW_MS and then a timeout. */
export async function decideFault(fault: JevFault): Promise<never> {
  if (fault === 'fail') throw new JevError('http', 'Jev fault switch: fail', 503);
  await sleep(JEV_FAULT_SLOW_MS);
  throw new JevError('timeout', `Jev fault switch: answered after ${JEV_FAULT_SLOW_MS} ms`);
}
