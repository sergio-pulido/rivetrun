import { describe, expect, it } from 'vitest';
import { createJevBrain, JEV_MODEL_ID, JevNotImplementedError } from './index';

describe('brain (scaffold)', () => {
  it('pins a versioned model id, not an alias', () => {
    expect(JEV_MODEL_ID).toMatch(/^jev-\d+\.\d+\.\d+$/);
  });

  it('createJevBrain returns a Brain whose stub fails loudly', async () => {
    await expect(createJevBrain().decide({} as never)).rejects.toThrow(JevNotImplementedError);
  });
});
