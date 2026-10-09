/** Thrown by scaffold stubs. The sim session replaces every caller. */
export class NotImplementedError extends Error {
  constructor(name: string) {
    super(`@rivetrun/sim: ${name} is not implemented yet (scaffold stub)`);
    this.name = 'NotImplementedError';
  }
}

export const notImplemented = (name: string): never => {
  throw new NotImplementedError(name);
};
