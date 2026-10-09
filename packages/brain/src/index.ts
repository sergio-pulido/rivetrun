// @rivetrun/brain — server-only Jev client. Never import from client components:
// it reads JEV_API_KEY. Request/response shape: docs/JEV.md.
import type { Brain } from '@rivetrun/contracts';

/** Versioned id (not the `jev-latest` alias) so behaviour does not move under us. See docs/JEV.md. */
export const JEV_MODEL_ID = 'jev-1.13.0';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export interface JevBrainOptions {
  /** Defaults to process.env.JEV_API_KEY. */
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export class JevNotImplementedError extends Error {
  constructor() {
    super('@rivetrun/brain: createJevBrain is a scaffold stub (brain session implements it)');
    this.name = 'JevNotImplementedError';
  }
}

const assertServer = (): void => {
  if ('window' in globalThis) {
    throw new Error('@rivetrun/brain is server-only: it must never run in the browser');
  }
};

/** Scaffold stub. The brain session implements the Jev call per docs/JEV.md. */
export function createJevBrain(_options: JevBrainOptions = {}): Brain {
  assertServer();
  return {
    decide: async () => {
      throw new JevNotImplementedError();
    },
  };
}
